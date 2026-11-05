import { describe, expect, it } from "vitest";
import { parseOAuthProviders, ssoDomain } from "../src/lib/auth-options";

describe("parseOAuthProviders", () => {
  it("is empty when nothing is set up", () => {
    expect(parseOAuthProviders(undefined)).toEqual([]);
    expect(parseOAuthProviders("")).toEqual([]);
  });
  it("reads the list and ignores spacing, case and unknown names", () => {
    expect(parseOAuthProviders(" Azure, google ,github")).toEqual(["google", "azure"]);
  });
});

describe("ssoDomain", () => {
  it("takes the domain from an address", () => {
    expect(ssoDomain(" Anna@Nordlys.DK ")).toBe("nordlys.dk");
  });
  it("refuses anything else", () => {
    for (const bad of ["", "anna", "anna@", "anna@nordlys", "a b@nordlys.dk", "a@b@nordlys.dk"]) expect(ssoDomain(bad)).toBeNull();
  });
});
