// Computed columns (`compute: { pace: "pages / days" }` in chart and table
// specs): a small expression language, parsed by hand (never eval).
//   numbers, "text", column names (or `names with spaces`), + - * / %, unary -,
//   parentheses, round(x, digits) floor ceil abs min(…) max(…) days(from, to) today()

import { columnsOf } from "./chartSpec";
import { isoDay, localToday } from "./periods";

type Row = Record<string, unknown>;
type Node = (row: Row) => unknown;

const TOKEN = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|"([^"]*)"|'([^']*)'|`([^`]*)`|([\p{L}_][\p{L}\p{N}_.]*)|(.))/uy;

/** A number from a value (booleans are 1 and 0), else null. */
function num(v: unknown): number | null {
	if (typeof v === "boolean") return v ? 1 : 0;
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const finite = (n: number): number | null => (Number.isFinite(n) ? n : null);
const dayMs = (v: unknown): number | null => {
	const d = isoDay(v);
	return d ? Date.parse(d) : null;
};

const FUNCTIONS: Record<string, (args: unknown[]) => unknown> = {
	round: ([x, digits]) => {
		const n = num(x);
		const d = digits === undefined ? 0 : num(digits);
		if (n === null || d === null) return null;
		const f = 10 ** d;
		return finite(Math.round(n * f) / f);
	},
	floor: ([x]) => (num(x) === null ? null : Math.floor(num(x) as number)),
	ceil: ([x]) => (num(x) === null ? null : Math.ceil(num(x) as number)),
	abs: ([x]) => (num(x) === null ? null : Math.abs(num(x) as number)),
	min: (args) => (args.length && args.every((a) => num(a) !== null) ? Math.min(...args.map((a) => num(a) as number)) : null),
	max: (args) => (args.length && args.every((a) => num(a) !== null) ? Math.max(...args.map((a) => num(a) as number)) : null),
	days: ([a, b]) => {
		const x = dayMs(a);
		const y = dayMs(b);
		return x === null || y === null ? null : Math.round((y - x) / 86400000);
	},
	today: () => localToday(),
};

function parse(expr: string): { fn: Node; columns: string[] } {
	const text = String(expr);
	const tokens: { kind: string; value: string; at: number }[] = [];
	for (let pos = 0; pos < text.length; ) {
		TOKEN.lastIndex = pos;
		const m = TOKEN.exec(text);
		if (!m) break; // only trailing whitespace is left
		const at = m.index + m[0].length - m[0].trimStart().length;
		const kinds = ["num", "str", "str", "col", "id", "op"];
		const i = [1, 2, 3, 4, 5, 6].find((k) => m[k] !== undefined) as number;
		tokens.push({ kind: kinds[i - 1], value: m[i], at });
		pos = TOKEN.lastIndex;
	}
	let p = 0;
	const columns: string[] = [];
	const fail = (what?: string): never => {
		const t = tokens[p];
		throw new Error(`${what ?? (t ? `unexpected "${t.value}"` : "unexpected end")} at ${t ? t.at : text.length} in "${text}"`);
	};
	const isOp = (v: string) => tokens[p]?.kind === "op" && tokens[p].value === v;
	const arith = (a: Node, b: Node, f: (x: number, y: number) => number | null): Node => (row) => {
		const x = num(a(row));
		const y = num(b(row));
		return x === null || y === null ? null : f(x, y);
	};

	const primary = (): Node => {
		const t = tokens[p];
		if (!t) return fail();
		if (t.kind === "num") {
			p++;
			const n = Number(t.value);
			return () => n;
		}
		if (t.kind === "str") {
			p++;
			return () => t.value;
		}
		if (t.kind === "col" || (t.kind === "id" && !(tokens[p + 1]?.kind === "op" && tokens[p + 1].value === "("))) {
			p++;
			columns.push(t.value);
			return (row) => (Object.prototype.hasOwnProperty.call(row, t.value) ? row[t.value] : null);
		}
		if (t.kind === "id") {
			const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, t.value) ? FUNCTIONS[t.value] : null;
			if (!fn) return fail(`unknown function "${t.value}"`);
			p += 2;
			const args: Node[] = [];
			if (!isOp(")")) {
				do args.push(sum());
				while (isOp(",") && ++p);
			}
			if (!isOp(")")) return fail();
			p++;
			return (row) => fn(args.map((a) => a(row)));
		}
		if (isOp("(")) {
			p++;
			const inner = sum();
			if (!isOp(")")) return fail();
			p++;
			return inner;
		}
		return fail();
	};
	const unary = (): Node => {
		if (isOp("-")) {
			p++;
			const inner = unary();
			return (row) => (num(inner(row)) === null ? null : -(num(inner(row)) as number));
		}
		return primary();
	};
	const product = (): Node => {
		let left = unary();
		while (isOp("*") || isOp("/") || isOp("%")) {
			const op = tokens[p++].value;
			left = arith(left, unary(), op === "*" ? (x, y) => finite(x * y) : op === "/" ? (x, y) => (y === 0 ? null : finite(x / y)) : (x, y) => (y === 0 ? null : finite(x % y)));
		}
		return left;
	};
	const sum = (): Node => {
		let left = product();
		while (isOp("+") || isOp("-")) {
			const plus = tokens[p++].value === "+";
			left = arith(left, product(), plus ? (x, y) => finite(x + y) : (x, y) => finite(x - y));
		}
		return left;
	};
	const fn = sum();
	if (p < tokens.length) fail();
	return { fn, columns };
}

/** Compiles an expression to a function of a row; throws on a syntax error. */
export function compileExpression(expr: string): (row: Record<string, unknown>) => unknown {
	return parse(expr).fn;
}

/**
 * Rows with the computed columns added (in key order, so later ones may use
 * earlier ones). A non-string value is a constant. Throws on a syntax error or
 * a column that no row has.
 */
export function computeRows(rows: Row[], compute: Record<string, unknown>): Row[] & { columns: string[] } {
	const columns = columnsOf(rows).slice();
	// columnsOf only samples the first rows of untyped (e.g. JSON) data.
	const known = new Set([...columns, ...rows.flatMap((r) => Object.keys(r))]);
	const steps = Object.entries(compute).map(([name, expr]) => {
		let parsed: ReturnType<typeof parse> = { fn: () => expr, columns: [] };
		if (typeof expr === "string") {
			try {
				parsed = parse(expr);
			} catch (e) {
				throw new Error(`compute "${name}": ${(e as Error).message}`);
			}
		}
		if (rows.length) {
			for (const c of parsed.columns) {
				if (!known.has(c)) throw new Error(`prism.chart: compute "${name}": column "${c}" not found (columns: ${Array.from(known).join(", ")})`);
			}
		}
		known.add(name);
		if (!columns.includes(name)) columns.push(name);
		return { name, fn: parsed.fn };
	});
	const out = rows.map((r) => {
		const row = { ...r };
		for (const s of steps) row[s.name] = s.fn(row);
		return row;
	}) as Row[] & { columns: string[] };
	out.columns = columns;
	return out;
}
