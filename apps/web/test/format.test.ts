import { describe, expect, it } from "vitest";
import { annualDeadline, daysUntil, likelyIncomeYear, maskId, safeNext } from "@/lib/format";

describe("safeNext", () => {
  it("keeps links within the site", () => {
    expect(safeNext("/app/settings?x=1")).toBe("/app/settings?x=1");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined])("rejects %j", (bad) => {
    expect(safeNext(bad)).toBe("/app");
  });
});

describe("annualDeadline", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it("is 20 January the following year", () => {
    expect(iso(annualDeadline(2025))).toBe("2026-01-20"); // a Tuesday
    expect(iso(annualDeadline(2026))).toBe("2027-01-20"); // a Wednesday
  });

  it("moves to Monday when it falls on a weekend", () => {
    expect(iso(annualDeadline(2029))).toBe("2030-01-21"); // the 20th is a Sunday
    expect(iso(annualDeadline(2031))).toBe("2032-01-20"); // a Tuesday: no move
    expect(iso(annualDeadline(2034))).toBe("2035-01-22"); // the 20th is a Saturday
  });
});

describe("daysUntil", () => {
  it("counts whole days", () => {
    expect(daysUntil(new Date(Date.UTC(2027, 0, 20)), new Date(2026, 10, 4, 22, 30))).toBe(77);
    expect(daysUntil(new Date(Date.UTC(2027, 0, 20)), new Date(2027, 0, 20))).toBe(0);
  });
});

describe("likelyIncomeYear", () => {
  it("is last year until the deadline, then this year", () => {
    expect(likelyIncomeYear(new Date(2027, 0, 15))).toBe(2026);
    expect(likelyIncomeYear(new Date(2027, 0, 21))).toBe(2027);
    expect(likelyIncomeYear(new Date(2026, 10, 4))).toBe(2026);
  });
});

describe("maskId", () => {
  it("hides the last four digits of a CPR number, and leaves a CVR", () => {
    expect(maskId("0101584455")).toBe("010158-••••");
    expect(maskId("87654303")).toBe("87654303");
    expect(maskId(undefined)).toBe("");
  });
});
