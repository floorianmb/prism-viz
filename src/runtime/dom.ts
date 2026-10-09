// DOM helpers for the block runtime. Blocks run in a sandboxed iframe without
// Obsidian's globals, so these stand in for Obsidian's createEl, createDiv,
// createSpan, createSvg and instanceOf when the runtime builds its own elements.

function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (cls) el.className = cls;
	return el;
}

/** New detached HTML element, optionally with a class name. */
export const createEl = element;

/** New detached <div>. */
export const createDiv = (cls?: string): HTMLDivElement => element("div", cls);

/** New detached <span>. */
export const createSpan = (cls?: string): HTMLSpanElement => element("span", cls);

/** New detached SVG element. */
export function createSvg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
	return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

/** Whether a value is an HTML element (stands in for Obsidian's Node.instanceOf). */
export function isHtmlElement(value: unknown): value is HTMLElement {
	if (typeof value !== "object" || value === null) return false;
	const node = value as Partial<Element>;
	return node.nodeType === 1 && node.namespaceURI === "http://www.w3.org/1999/xhtml";
}

/** Whether a value is a <canvas> element. */
export function isCanvas(value: unknown): value is HTMLCanvasElement {
	return isHtmlElement(value) && value.tagName === "CANVAS";
}
