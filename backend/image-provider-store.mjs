import { randomUUID } from "node:crypto";

function runTransaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function providerFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    generationPath: row.generation_path,
    editPath: row.edit_path,
    encryptedApiKey: row.encrypted_api_key,
    timeoutMs: Number(row.timeout_ms),
    enabled: Boolean(row.enabled),
    lastTestStatus: row.last_test_status,
    lastTestMessage: row.last_test_message,
    lastTestedAt: row.last_tested_at,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function modelFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    supportedRatios: JSON.parse(row.supported_ratios_json),
    maxImages: Number(row.max_images),
    sortOrder: Number(row.sort_order),
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function requireRevision(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("revision is required");
  }
  return value;
}

function auditSnapshot(value) {
  if (!value || !Object.hasOwn(value, "encryptedApiKey")) return value;
  const { encryptedApiKey, ...safe } = value;
  return safe;
}

function writeAudit(db, context, action, entityType, entityId, before, after) {
  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, before_json, after_json, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    context?.actor || "admin-token",
    action,
    entityType,
    entityId,
    before ? JSON.stringify(auditSnapshot(before)) : null,
    after ? JSON.stringify(auditSnapshot(after)) : null,
    context?.requestId || ""
  );
}

function changedValues(input, fields) {
  return fields.flatMap(([property, column, convert]) => Object.hasOwn(input, property)
    ? [[column, convert ? convert(input[property]) : input[property]]]
    : []);
}

export function createImageProviderStore(db) {
  const getProviderRow = db.prepare("SELECT * FROM image_providers WHERE id = ?");
  const getModelRow = db.prepare("SELECT * FROM image_models WHERE id = ?");

  function clearOtherDefaults(modelId, context) {
    const defaults = db.prepare("SELECT * FROM image_models WHERE is_default = 1 AND id <> ?").all(modelId);
    defaults.forEach((row) => {
      db.prepare(`
        UPDATE image_models
        SET is_default = 0, revision = revision + 1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).run(row.id);
      writeAudit(db, context, "set_default_image_model", "image_model", row.id, modelFromRow(row), modelFromRow(getModelRow.get(row.id)));
    });
  }

  function updateRow(table, id, before, input, fields, context, action, mapper) {
    const revision = requireRevision(input.revision);
    if (before.revision !== revision) throw new Error("revision conflict");
    const values = changedValues(input, fields);
    if (!values.length) return before;
    const assignments = values.map(([column]) => `${column} = ?`);
    const parameters = values.map(([, value]) => value);
    const result = db.prepare(`
      UPDATE ${table}
      SET ${assignments.join(", ")}, revision = revision + 1,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND revision = ?
    `).run(...parameters, id, revision);
    if (Number(result.changes) !== 1) throw new Error("revision conflict");
    const after = mapper(table === "image_providers" ? getProviderRow.get(id) : getModelRow.get(id));
    writeAudit(db, context, action, table === "image_providers" ? "image_provider" : "image_model", id, before, after);
    return after;
  }

  return {
    listProviders() {
      return db.prepare("SELECT * FROM image_providers ORDER BY name COLLATE NOCASE, id").all().map(providerFromRow);
    },
    getProvider(id) {
      return providerFromRow(getProviderRow.get(id));
    },
    createProvider(input, context) {
      return runTransaction(db, () => {
        const id = randomUUID();
        db.prepare(`
          INSERT INTO image_providers (
            id, name, base_url, generation_path, edit_path, encrypted_api_key, timeout_ms, enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.name,
          input.baseUrl,
          input.generationPath ?? "/v1/images/generations",
          input.editPath ?? "/v1/images/edits",
          input.encryptedApiKey,
          input.timeoutMs ?? 60000,
          input.enabled === false ? 0 : 1
        );
        const provider = providerFromRow(getProviderRow.get(id));
        writeAudit(db, context, "create_image_provider", "image_provider", id, null, provider);
        return provider;
      });
    },
    updateProvider(id, input, context) {
      return runTransaction(db, () => {
        const before = providerFromRow(getProviderRow.get(id));
        if (!before) return null;
        return updateRow("image_providers", id, before, input, [
          ["name", "name"],
          ["baseUrl", "base_url"],
          ["generationPath", "generation_path"],
          ["editPath", "edit_path"],
          ["encryptedApiKey", "encrypted_api_key"],
          ["timeoutMs", "timeout_ms"],
          ["enabled", "enabled", (value) => value ? 1 : 0]
        ], context, "update_image_provider", providerFromRow);
      });
    },
    deleteProvider(id, input, context) {
      return runTransaction(db, () => {
        const provider = providerFromRow(getProviderRow.get(id));
        if (!provider) return false;
        if (provider.revision !== requireRevision(input.revision)) throw new Error("revision conflict");
        if (db.prepare("SELECT 1 FROM image_models WHERE provider_id = ? LIMIT 1").get(id)) {
          throw new Error("cannot delete provider while models reference it");
        }
        const result = db.prepare("DELETE FROM image_providers WHERE id = ? AND revision = ?").run(id, provider.revision);
        if (Number(result.changes) !== 1) throw new Error("revision conflict");
        writeAudit(db, context, "delete_image_provider", "image_provider", id, provider, null);
        return true;
      });
    },
    recordProviderTest(id, input, context) {
      return runTransaction(db, () => {
        const before = providerFromRow(getProviderRow.get(id));
        if (!before) return null;
        return updateRow("image_providers", id, before, input, [
          ["lastTestStatus", "last_test_status"],
          ["lastTestMessage", "last_test_message"],
          ["lastTestedAt", "last_tested_at"]
        ], context, "test_image_provider", providerFromRow);
      });
    },
    listModels() {
      return db.prepare("SELECT * FROM image_models ORDER BY sort_order, display_name COLLATE NOCASE, id").all().map(modelFromRow);
    },
    getModel(id) {
      return modelFromRow(getModelRow.get(id));
    },
    createModel(input, context) {
      return runTransaction(db, () => {
        const id = randomUUID();
        if (input.isDefault) clearOtherDefaults(id, context);
        db.prepare(`
          INSERT INTO image_models (
            id, provider_id, model_id, display_name, supported_ratios_json,
            max_images, sort_order, enabled, is_default
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          input.providerId,
          input.modelId,
          input.displayName,
          JSON.stringify(input.supportedRatios),
          input.maxImages,
          input.sortOrder ?? 0,
          input.enabled === false ? 0 : 1,
          input.isDefault ? 1 : 0
        );
        const model = modelFromRow(getModelRow.get(id));
        writeAudit(db, context, "create_image_model", "image_model", id, null, model);
        return model;
      });
    },
    updateModel(id, input, context) {
      return runTransaction(db, () => {
        const before = modelFromRow(getModelRow.get(id));
        if (!before) return null;
        requireRevision(input.revision);
        if (before.revision !== input.revision) throw new Error("revision conflict");
        if (input.isDefault === true) clearOtherDefaults(id, context);
        return updateRow("image_models", id, before, input, [
          ["providerId", "provider_id"],
          ["modelId", "model_id"],
          ["displayName", "display_name"],
          ["supportedRatios", "supported_ratios_json", JSON.stringify],
          ["maxImages", "max_images"],
          ["sortOrder", "sort_order"],
          ["enabled", "enabled", (value) => value ? 1 : 0],
          ["isDefault", "is_default", (value) => value ? 1 : 0]
        ], context, "update_image_model", modelFromRow);
      });
    },
    deleteModel(id, input, context) {
      return runTransaction(db, () => {
        const model = modelFromRow(getModelRow.get(id));
        if (!model) return false;
        if (model.revision !== requireRevision(input.revision)) throw new Error("revision conflict");
        const result = db.prepare("DELETE FROM image_models WHERE id = ? AND revision = ?").run(id, model.revision);
        if (Number(result.changes) !== 1) throw new Error("revision conflict");
        writeAudit(db, context, "delete_image_model", "image_model", id, model, null);
        return true;
      });
    },
    setDefaultModel(id, input, context) {
      return runTransaction(db, () => {
        const before = modelFromRow(getModelRow.get(id));
        if (!before) return null;
        if (before.revision !== requireRevision(input.revision)) throw new Error("revision conflict");
        clearOtherDefaults(id, context);
        return updateRow("image_models", id, before, { revision: input.revision, isDefault: true }, [
          ["isDefault", "is_default", (value) => value ? 1 : 0]
        ], context, "set_default_image_model", modelFromRow);
      });
    }
  };
}
