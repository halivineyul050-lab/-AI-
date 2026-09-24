import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { openDatabase } from "../backend/database.mjs";
import { createImageProviderStore } from "../backend/image-provider-store.mjs";

let db;
let directory;

const audit = { actor: "admin-1", requestId: "request-1" };

before(() => {
  directory = mkdtempSync(join(tmpdir(), "nikai-image-providers-"));
  db = openDatabase(join(directory, "providers.db"));
});

after(() => {
  db.close();
  rmSync(directory, { recursive: true, force: true });
});

test("provider store enforces one default model and revision checks", () => {
  const store = createImageProviderStore(db);
  const provider = store.createProvider({
    name: "Example",
    baseUrl: "https://api.example.com",
    generationPath: "/v1/images/generations",
    encryptedApiKey: "v1.payload",
    timeoutMs: 60000,
    enabled: true
  }, audit);
  const first = store.createModel({
    providerId: provider.id,
    modelId: "image-a",
    displayName: "Image A",
    supportedRatios: ["1:1"],
    maxImages: 1,
    sortOrder: 10,
    enabled: true,
    isDefault: true
  }, audit);
  const second = store.createModel({
    providerId: provider.id,
    modelId: "image-b",
    displayName: "Image B",
    supportedRatios: ["1:1", "16:9"],
    maxImages: 2,
    sortOrder: 20,
    enabled: true,
    isDefault: true
  }, audit);

  assert.equal(store.getModel(first.id).isDefault, false);
  assert.equal(store.getModel(second.id).isDefault, true);
  assert.throws(() => store.updateModel(second.id, { revision: 0, displayName: "stale" }, audit), /revision/i);
});

test("provider store prevents referenced provider deletion and audits mutations", () => {
  const store = createImageProviderStore(db);
  const provider = store.getProvider(store.listProviders()[0].id);

  assert.throws(() => store.deleteProvider(provider.id, { revision: provider.revision }, audit), /model/i);
  assert.ok(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE entity_type IN ('image_provider', 'image_model')").get().count >= 3);
  const providerAudit = db.prepare("SELECT after_json FROM audit_logs WHERE entity_type = 'image_provider' ORDER BY created_at LIMIT 1").get();
  assert.doesNotMatch(providerAudit.after_json, /v1\.payload/);
});

test("image-provider migrations create tables and expand the timeout", () => {
  assert.equal(db.prepare("PRAGMA user_version").get().user_version, 17);
  assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version = 14").get());
  assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE version = 15").get());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'image_providers'").get());
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'image_models'").get());
});
