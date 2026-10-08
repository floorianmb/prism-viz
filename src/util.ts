/** cyrb53: fast, well-distributed 53-bit string hash, returned as hex. */
export function hash(input: string, seed = 0): string {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < input.length; i++) {
		const ch = input.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function randomToken(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Makes script source safe to embed inside an inline <script> element.
 * `</script` would close the element and `<!--` can switch the HTML parser into
 * the "script data escaped" state. `\x3C` is `<` inside strings, template
 * literals and regular expressions, so the code keeps its meaning.
 */
export function escapeScript(code: string): string {
	return code.replace(/<(\/script|!--)/gi, "\\x3C$1");
}

/** JSON that can be embedded in an inline <script> element. */
export function scriptJson(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
		.replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

export function countNewlines(text: string): number {
	let n = 0;
	for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
	return n;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
	let timer: number | null = null;
	const wrapped = (...args: A) => {
		if (timer !== null) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timer = null;
			fn(...args);
		}, ms);
	};
	wrapped.flush = (...args: A) => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		fn(...args);
	};
	wrapped.cancel = () => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
	};
	return wrapped;
}

export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
	const comma = dataUrl.indexOf(",");
	const binary = atob(dataUrl.slice(comma + 1));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

export function sanitizeFileName(name: string): string {
	return name.replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "viz";
}
