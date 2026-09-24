import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function createSecretBox(masterKey) {
  const key = Buffer.isBuffer(masterKey) && masterKey.length === 32
    ? Buffer.from(masterKey)
    : typeof masterKey === "string" && /^[a-f0-9]{64}$/i.test(masterKey)
      ? Buffer.from(masterKey, "hex")
      : null;
  if (!key) throw new Error("NIKE_IMAGE_CONFIG_KEY must be a 32-byte key or 64-character hex value");

  return {
    encrypt(plaintext) {
      if (typeof plaintext !== "string") throw new Error("Invalid provider secret");
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return ["v1", nonce.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
    },
    decrypt(payload) {
      try {
        if (typeof payload !== "string") throw new Error();
        const parts = payload.split(".");
        if (parts.length !== 4 || parts[0] !== "v1" || parts.slice(1).some((part) => !/^[A-Za-z0-9_-]*$/.test(part))) throw new Error();
        const [nonce, ciphertext, tag] = parts.slice(1).map((part) => Buffer.from(part, "base64url"));
        if (nonce.length !== 12 || tag.length !== 16 || [nonce, ciphertext, tag].some((part, index) => part.toString("base64url") !== parts[index + 1])) throw new Error();
        const decipher = createDecipheriv("aes-256-gcm", key, nonce);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("Unable to decrypt provider secret");
      }
    }
  };
}
