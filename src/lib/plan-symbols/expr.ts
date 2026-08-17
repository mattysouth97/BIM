// src/lib/plan-symbols/expr.ts
//
// A tiny, safe evaluator for NumericField expression strings: tokenizer +
// recursive-descent parser + direct interpretation. No eval(), no Function(),
// no access to anything but the supplied params. Grammar:
//
//   expr   := term (("+" | "-") term)*
//   term   := unary (("*" | "/") unary)*
//   unary  := "-" unary | primary
//   primary:= number | identifier | identifier "(" args ")" | "(" expr ")"
//   args   := expr ("," expr)*
//
// Identifiers must be either a known function name (min, max, abs, neg) or a
// key present in the supplied params — anything else is rejected by name, so
// "process", "constructor", "__proto__" etc. all fail as unknown identifiers.
// Number literals are digits-and-one-dot only (no exponent, no hex), so a
// stray "1e999" tokenizes as the number 1 followed by the unknown identifier
// "e999" and is rejected as a syntax/identifier error rather than silently
// becoming Infinity.

export class ExprError extends Error {
  constructor(
    message: string,
    public readonly expr: string,
  ) {
    super(message);
    this.name = "ExprError";
  }
}

/** Defensive ceiling on expression source length — these are mm formulas, not programs. */
const MAX_EXPR_LENGTH = 200;

type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

const NUMBER_RE = /^\d+(\.\d+)?/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    const rest = src.slice(i);
    const numMatch = NUMBER_RE.exec(rest);
    if (numMatch) {
      tokens.push({ kind: "num", value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    const idMatch = IDENT_RE.exec(rest);
    if (idMatch) {
      tokens.push({ kind: "id", value: idMatch[0] });
      i += idMatch[0].length;
      continue;
    }
    throw new ExprError(`unexpected character "${ch}" at position ${i}`, src);
  }
  return tokens;
}

const FUNCTIONS: Record<string, (args: number[]) => number> = {
  min: (args) => {
    if (args.length < 1) throw new Error("min() needs at least one argument");
    return Math.min(...args);
  },
  max: (args) => {
    if (args.length < 1) throw new Error("max() needs at least one argument");
    return Math.max(...args);
  },
  abs: (args) => {
    if (args.length !== 1) throw new Error("abs() takes exactly one argument");
    return Math.abs(args[0]);
  },
  neg: (args) => {
    if (args.length !== 1) throw new Error("neg() takes exactly one argument");
    return -args[0];
  },
};

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly params: Readonly<Record<string, number>>,
    private readonly src: string,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new ExprError("unexpected end of expression", this.src);
    this.pos++;
    return tok;
  }

  parse(): number {
    const value = this.parseExpr();
    if (this.pos !== this.tokens.length) {
      throw new ExprError(`unexpected trailing input at token ${this.pos}`, this.src);
    }
    return value;
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const tok = this.peek();
      if (tok?.kind === "op" && (tok.value === "+" || tok.value === "-")) {
        this.next();
        const rhs = this.parseTerm();
        value = tok.value === "+" ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    for (;;) {
      const tok = this.peek();
      if (tok?.kind === "op" && (tok.value === "*" || tok.value === "/")) {
        this.next();
        const rhs = this.parseUnary();
        if (tok.value === "/") {
          if (rhs === 0) throw new ExprError("division by zero", this.src);
          value = value / rhs;
        } else {
          value = value * rhs;
        }
      } else {
        return value;
      }
    }
  }

  private parseUnary(): number {
    const tok = this.peek();
    if (tok?.kind === "op" && tok.value === "-") {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tok = this.next();
    if (tok.kind === "num") return tok.value;
    if (tok.kind === "lparen") {
      const value = this.parseExpr();
      const close = this.next();
      if (close.kind !== "rparen") throw new ExprError("expected closing parenthesis", this.src);
      return value;
    }
    if (tok.kind === "id") {
      const nextTok = this.peek();
      if (nextTok?.kind === "lparen") {
        const fn = FUNCTIONS[tok.value];
        if (!fn) throw new ExprError(`unknown function: ${tok.value}`, this.src);
        this.next(); // consume "("
        const args = this.parseArgs();
        const close = this.next();
        if (close.kind !== "rparen") throw new ExprError("expected closing parenthesis", this.src);
        try {
          return fn(args);
        } catch (err) {
          throw new ExprError(err instanceof Error ? err.message : String(err), this.src);
        }
      }
      if (!Object.prototype.hasOwnProperty.call(this.params, tok.value)) {
        throw new ExprError(`unknown identifier: ${tok.value}`, this.src);
      }
      return this.params[tok.value];
    }
    throw new ExprError("expected a number, identifier, or parenthesised expression", this.src);
  }

  private parseArgs(): number[] {
    const args: number[] = [];
    if (this.peek()?.kind === "rparen") return args;
    args.push(this.parseExpr());
    while (this.peek()?.kind === "comma") {
      this.next();
      args.push(this.parseExpr());
    }
    return args;
  }
}

/** Evaluate a NumericField expression string against params. mm-valued, deterministic. */
export function evaluateExpr(expr: string, params: Readonly<Record<string, number>>): number {
  if (expr.length === 0) throw new ExprError("empty expression", expr);
  if (expr.length > MAX_EXPR_LENGTH) {
    throw new ExprError(`expression exceeds ${MAX_EXPR_LENGTH} characters`, expr);
  }
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new ExprError("empty expression", expr);
  const parser = new Parser(tokens, params, expr);
  const result = parser.parse();
  if (!Number.isFinite(result)) {
    throw new ExprError(`expression did not evaluate to a finite number: ${expr}`, expr);
  }
  return result;
}

/** Resolve a NumericField: pass numbers through, evaluate expression strings. */
export function resolveNumeric(field: number | string, params: Readonly<Record<string, number>>): number {
  if (typeof field === "number") {
    if (!Number.isFinite(field)) {
      throw new ExprError(`numeric field is not finite: ${field}`, String(field));
    }
    return field;
  }
  return evaluateExpr(field, params);
}
