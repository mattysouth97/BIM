import { describe, expect, it } from "vitest";

import { evaluateExpr, ExprError, resolveNumeric } from "../expr";

describe("expr: arithmetic and functions", () => {
  it("evaluates +, -, *, / with standard precedence", () => {
    expect(evaluateExpr("2+3*4", {})).toBe(14);
    expect(evaluateExpr("(2+3)*4", {})).toBe(20);
    expect(evaluateExpr("10-4-1", {})).toBe(5);
    expect(evaluateExpr("20/4/5", {})).toBe(1);
  });

  it("evaluates unary negation, including chained", () => {
    expect(evaluateExpr("-5", {})).toBe(-5);
    expect(evaluateExpr("--5", {})).toBe(5);
    expect(evaluateExpr("3 - -2", {})).toBe(5);
  });

  it("resolves param identifiers by name", () => {
    expect(evaluateExpr("widthMm/2", { widthMm: 900 })).toBe(450);
    expect(evaluateExpr("widthMm + heightMm", { widthMm: 900, heightMm: 2100 })).toBe(3000);
  });

  it("evaluates min, max, abs, neg", () => {
    expect(evaluateExpr("min(3,7)", {})).toBe(3);
    expect(evaluateExpr("max(3,7,20,1)", {})).toBe(20);
    expect(evaluateExpr("abs(-9)", {})).toBe(9);
    expect(evaluateExpr("neg(9)", {})).toBe(-9);
    expect(evaluateExpr("min(widthMm,900)", { widthMm: 1200 })).toBe(900);
  });

  it("composes nested calls and parentheses", () => {
    expect(evaluateExpr("max(min(10,20), abs(-3))", {})).toBe(10);
  });

  it("ignores whitespace", () => {
    expect(evaluateExpr("  2 +  3 * ( 4 - 1 )  ", {})).toBe(11);
  });

  it("is pure: identical inputs always produce identical output", () => {
    const params = { widthMm: 1234.5 };
    const results = new Set(
      Array.from({ length: 5 }, () => evaluateExpr("widthMm/2 - min(widthMm,900)", params)),
    );
    expect(results.size).toBe(1);
  });
});

describe("expr: safety", () => {
  it("rejects unknown identifiers, including dangerous-looking ones", () => {
    expect(() => evaluateExpr("process", {})).toThrow(ExprError);
    expect(() => evaluateExpr("constructor", {})).toThrow(ExprError);
    expect(() => evaluateExpr("__proto__", {})).toThrow(ExprError);
    expect(() => evaluateExpr("window", {})).toThrow(ExprError);
  });

  it("rejects an identifier not present in the supplied params", () => {
    expect(() => evaluateExpr("heightMm", { widthMm: 900 })).toThrow(/unknown identifier/);
  });

  it("rejects unknown function calls", () => {
    expect(() => evaluateExpr("eval(1)", {})).toThrow(ExprError);
    expect(() => evaluateExpr("require(1)", {})).toThrow(ExprError);
  });

  it("rejects exponent notation by tokenizing it as number + unknown identifier", () => {
    expect(() => evaluateExpr("1e999", {})).toThrow(ExprError);
  });

  it("rejects malformed syntax", () => {
    expect(() => evaluateExpr("", {})).toThrow(ExprError);
    expect(() => evaluateExpr("1 +", {})).toThrow(ExprError);
    expect(() => evaluateExpr("(1+2", {})).toThrow(ExprError);
    expect(() => evaluateExpr("1 2", {})).toThrow(ExprError);
    expect(() => evaluateExpr("1 $ 2", {})).toThrow(ExprError);
  });

  it("rejects division by zero rather than returning Infinity", () => {
    expect(() => evaluateExpr("1/0", {})).toThrow(ExprError);
  });

  it("rejects expressions over the length ceiling", () => {
    const long = `1${"+1".repeat(150)}`;
    expect(long.length).toBeGreaterThan(200);
    expect(() => evaluateExpr(long, {})).toThrow(ExprError);
  });

  it("min/max/abs still reject a bad identifier inside their arguments", () => {
    expect(() => evaluateExpr("min(process,1)", {})).toThrow(ExprError);
  });
});

describe("resolveNumeric", () => {
  it("passes numbers through untouched", () => {
    expect(resolveNumeric(42, {})).toBe(42);
  });

  it("evaluates expression strings against params", () => {
    expect(resolveNumeric("widthMm/2", { widthMm: 800 })).toBe(400);
  });

  it("rejects a non-finite number literal", () => {
    expect(() => resolveNumeric(Number.POSITIVE_INFINITY, {})).toThrow(ExprError);
  });
});
