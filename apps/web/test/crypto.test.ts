import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { caseContext, newInviteToken, newWrappedKey, open, seal, sha256Hex, submissionContext, unwrapKey } from "@/server/crypto";

const key = randomBytes(32);
const CPR = "0101584455";

describe("seal and open", () => {
  it("round-trips, and the ciphertext does not contain the plain text", () => {
    const sealed = seal(CPR, key, "ctx");
    expect(sealed).not.toContain(CPR);
    expect(Buffer.from(sealed.split(".")[3]!, "base64url").toString("latin1")).not.toContain(CPR);
    expect(open(sealed, key, "ctx").toString()).toBe(CPR);
  });

  it("gives a different result every time", () => {
    expect(seal(CPR, key, "ctx")).not.toBe(seal(CPR, key, "ctx"));
  });

  it("refuses the wrong key", () => {
    expect(() => open(seal(CPR, key, "ctx"), randomBytes(32), "ctx")).toThrow();
  });

  it("refuses data moved to another company or workspace", () => {
    const sealed = seal(CPR, key, caseContext("ws1", "c1"));
    expect(() => open(sealed, key, caseContext("ws1", "c2"))).toThrow();
    expect(() => open(sealed, key, caseContext("ws2", "c1"))).toThrow();
    expect(() => open(sealed, key, submissionContext("ws1", "c1"))).toThrow();
  });

  it("refuses data that was changed", () => {
    const sealed = seal(CPR, key, "ctx");
    const parts = sealed.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0]! ^= 1;
    parts[3] = body.toString("base64url");
    expect(() => open(parts.join("."), key, "ctx")).toThrow();
  });

  it("refuses unknown formats", () => {
    expect(() => open("v9.a.b.c", key, "ctx")).toThrow(/format/);
    expect(() => open("nonsense", key, "ctx")).toThrow(/format/);
  });
});

describe("workspace keys", () => {
  beforeEach(() => {
    process.env.MEDAK_MASTER_KEY = randomBytes(32).toString("base64");
  });

  it("gives each workspace its own key, stored encrypted", () => {
    const a = newWrappedKey();
    const b = newWrappedKey();
    expect(unwrapKey(a)).toHaveLength(32);
    expect(unwrapKey(a).equals(unwrapKey(b))).toBe(false);
  });

  it("can't be read without the master key", () => {
    const wrapped = newWrappedKey();
    process.env.MEDAK_MASTER_KEY = randomBytes(32).toString("base64");
    expect(() => unwrapKey(wrapped)).toThrow();
  });

  it("refuses to run with a missing or weak master key", () => {
    process.env.MEDAK_MASTER_KEY = "";
    expect(() => newWrappedKey()).toThrow(/32 bytes/);
    process.env.MEDAK_MASTER_KEY = Buffer.from("short").toString("base64");
    expect(() => newWrappedKey()).toThrow(/32 bytes/);
  });
});

describe("invite tokens", () => {
  it("stores only a hash of a long random token", () => {
    const { token, hash } = newInviteToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hash).toBe(sha256Hex(token));
    expect(hash).not.toContain(token);
    expect(newInviteToken().token).not.toBe(token);
  });
});
