/**
 * Encryption of personal data at rest. See docs/security.md.
 *
 * Envelope encryption with AES-256-GCM: each workspace has its own data key, stored in the
 * database encrypted by a master key that lives only in the server's environment. Someone who
 * gets a copy of the database gets no CPR numbers. The "associated data" binds each ciphertext
 * to where it belongs, so it can't be moved to another company or workspace and still open.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";
const WRAP_CONTEXT = "medak:workspace-key";

export class CryptoConfigError extends Error {}

function masterKey(): Buffer {
  const encoded = process.env.MEDAK_MASTER_KEY ?? "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new CryptoConfigError("MEDAK_MASTER_KEY must be 32 bytes in base64");
  return key;
}

/** Encrypt. The result is `v1.<iv>.<tag>.<ciphertext>` in base64url. */
export function seal(plain: string | Uint8Array, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(typeof plain === "string" ? Buffer.from(plain, "utf8") : plain), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** Decrypt. Throws if the data was changed, or doesn't belong to this key and context. */
export function open(sealed: string, key: Buffer, context: string): Buffer {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) throw new Error("Unknown encrypted format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
}

/** A new data key for a workspace, encrypted with the master key, ready to store. */
export function newWrappedKey(): string {
  return seal(randomBytes(32), masterKey(), WRAP_CONTEXT);
}

export function unwrapKey(wrapped: string): Buffer {
  return open(wrapped, masterKey(), WRAP_CONTEXT);
}

export const caseContext = (workspaceId: string, companyId: string) => `medak:case:${workspaceId}:${companyId}`;
export const submissionContext = (workspaceId: string, companyId: string) => `medak:submission:${workspaceId}:${companyId}`;

/** A random token for an invitation link, with the hash that is stored instead of it. */
export function newInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
