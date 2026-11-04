import { describe, expect, it } from "vitest";
import {
  classifyId, isPlausibleCpr, isValidCvr, isValidDateDmy, isValidDateYmd, isValidIsin, isValidTime,
} from "../src/checks.ts";
import { convertToDkk, fromFixedDigits, marketValueOre, toFixedDigits } from "../src/units.ts";

describe("toFixedDigits", () => {
  it.each([
    ["18.862,50", 2, "da", "1886250"],
    ["18862,5", 2, "da", "1886250"],
    ["18 862,50", 2, "da", "1886250"],
    ["18,862.50", 2, "en", "1886250"],
    ["15", 6, "da", "15000000"],
    ["125,75", 6, "da", "125750000"],
    ["0", 2, "da", "0"],
    ["0,05", 2, "da", "5"],
    [",5", 2, "da", "50"],
  ] as const)("%s (%i decimals, %s) → %s", (input, decimals, locale, expected) => {
    expect(toFixedDigits(input, decimals, locale)).toEqual({ ok: true, digits: expected });
  });

  it("rejects an English decimal point in Danish input instead of reading 100× too much", () => {
    expect(toFixedDigits("125.75", 2, "da")).toEqual({ ok: false, error: "invalid" });
  });

  it.each([
    ["", "empty"],
    ["-5", "negative"],
    ["1,234", "tooManyDecimals"],
    ["1,2,3", "invalid"],
    ["12.34.5", "invalid"],
    ["abc", "invalid"],
    ["5,", "invalid"],
  ] as const)("rejects %j in Danish with %s", (input, error) => {
    expect(toFixedDigits(input, 2, "da")).toEqual({ ok: false, error });
  });
});

describe("fromFixedDigits", () => {
  it("formats øre in both languages", () => {
    expect(fromFixedDigits("1886250", 2, "da")).toBe("18.862,50");
    expect(fromFixedDigits("1886250", 2, "en")).toBe("18,862.50");
    expect(fromFixedDigits("5", 2, "da")).toBe("0,05");
  });

  it("drops trailing zero decimals down to the minimum", () => {
    expect(fromFixedDigits("000000000150000000", 6, "da", 0)).toBe("150");
    expect(fromFixedDigits("125750000", 6, "da", 0)).toBe("125,75");
  });
});

describe("currency arithmetic", () => {
  it("converts to DKK at a rate per 100 units, rounding half up", () => {
    // 100,00 USD at 685,25 DKK per 100 USD = 685,25 DKK
    expect(convertToDkk(10000n, 685_250_000n)).toBe(68525n);
    // 0,01 USD at 685,25 → 0,068525 DKK → 7 øre
    expect(convertToDkk(1n, 685_250_000n)).toBe(7n);
  });

  it("computes market value from quantity and price", () => {
    expect(marketValueOre(150_000_000n, 125_750_000n)).toBe(1_886_250n);
  });
});

describe("identifier checks", () => {
  it("validates CVR numbers with modulus 11", () => {
    expect(isValidCvr("24256790")).toBe(true);
    expect(isValidCvr("22756214")).toBe(true);
    expect(isValidCvr("24256791")).toBe(false);
    expect(isValidCvr("04256790")).toBe(false);
  });

  it("accepts CPR numbers with a valid birth date, including substitute numbers", () => {
    expect(isPlausibleCpr("0101584455")).toBe(true);
    expect(isPlausibleCpr("2902001234")).toBe(true);
    expect(isPlausibleCpr("6101584455")).toBe(true);
    expect(isPlausibleCpr("3213584455")).toBe(false);
    expect(isPlausibleCpr("010158-4455")).toBe(false);
  });

  it("classifies field 11 values", () => {
    expect(classifyId("0024256790")).toEqual({ kind: "cvr", normalized: "24256790" });
    expect(classifyId("24256790")).toEqual({ kind: "cvr", normalized: "24256790" });
    expect(classifyId("0101584455")).toEqual({ kind: "cpr", normalized: "0101584455" });
    expect(classifyId("123")).toEqual({ kind: "invalid", normalized: "123" });
  });

  it("validates ISIN check digits", () => {
    expect(isValidIsin("US0378331005")).toBe(true);
    expect(isValidIsin("DE0007164600")).toBe(true);
    expect(isValidIsin("US0378331006")).toBe(false);
    expect(isValidIsin("us0378331005")).toBe(false);
  });

  it("validates dates and times", () => {
    expect(isValidDateYmd("20260229")).toBe(false);
    expect(isValidDateYmd("20280229")).toBe(true);
    expect(isValidDateDmy("31121980")).toBe(true);
    expect(isValidDateDmy("31111980")).toBe(false);
    expect(isValidTime("235959")).toBe(true);
    expect(isValidTime("240000")).toBe(false);
  });
});
