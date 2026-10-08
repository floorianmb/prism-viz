// Infinite-loop protection for user scripts.
//
// Sandboxed srcdoc iframes usually share the renderer process (and main
// thread) with Obsidian, so a busy loop in a block would freeze the app.
// Before rendering, every loop in the block's inline scripts gets a call to
// `__prismLoop(id)` at the start of its body (see prelude.ts). The inserted
// text contains no line breaks, so error line numbers stay correct.

import { parse } from "acorn";

const LOOPS = new Set(["WhileStatement", "DoWhileStatement", "ForStatement", "ForInStatement", "ForOfStatement"]);
const JS_TYPES = /^\s*$|^\s*(text|application)\/(javascript|ecmascript)\s*$|^\s*module\s*$/i;
const SCRIPT = /(<script\b([^>]*)>)([\s\S]*?)(<\/script\s*>)/gi;

interface AstNode {
	type: string;
	start: number;
	end: number;
	body?: AstNode | AstNode[];
	[key: string]: unknown;
}

/** Returns the code with loop guards, or the original code if it cannot be parsed. */
export function guardScript(code: string, module: boolean, nextId: () => number): string {
	let ast: AstNode;
	try {
		ast = parse(code, { ecmaVersion: "latest", sourceType: module ? "module" : "script", allowHashBang: true }) as unknown as AstNode;
	} catch {
		return code; // Leave syntax errors to the browser, which reports them with line numbers.
	}
	const inserts: { at: number; text: string }[] = [];
	const visit = (node: unknown) => {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node)) {
			node.forEach(visit);
			return;
		}
		const n = node as AstNode;
		if (typeof n.type !== "string") return;
		if (LOOPS.has(n.type) && n.body && !Array.isArray(n.body)) {
			const body = n.body;
			const call = `__prismLoop(${nextId()});`;
			if (body.type === "BlockStatement") inserts.push({ at: body.start + 1, text: call });
			else {
				inserts.push({ at: body.start, text: `{${call}` });
				inserts.push({ at: body.end, text: "}" });
			}
		}
		for (const key of Object.keys(n)) {
			if (key !== "type" && key !== "start" && key !== "end") visit(n[key]);
		}
	};
	visit(ast);
	if (!inserts.length) return code;
	inserts.sort((a, b) => b.at - a.at);
	let out = code;
	for (const { at, text } of inserts) out = out.slice(0, at) + text + out.slice(at);
	return out;
}

/** Adds loop guards to all inline JavaScript `<script>` elements of an HTML string. */
export function guardHtml(html: string): string {
	let id = 0;
	const nextId = () => ++id;
	return html.replace(SCRIPT, (match, open: string, attrs: string, code: string, close: string) => {
		if (/\bsrc\s*=/i.test(attrs)) return match;
		const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1] ?? "";
		if (!JS_TYPES.test(type)) return match;
		if (!/\b(for|while|do)\b/.test(code)) return match;
		return open + guardScript(code, /module/i.test(type), nextId) + close;
	});
}
