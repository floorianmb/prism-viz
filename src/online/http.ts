// prism.http(): HTTP requests sent by the host on behalf of a block, through
// Obsidian's requestUrl (no CORS, works on desktop and mobile). Only active
// when the user switched on Settings → Prism → Online access → API requests.

import { requestUrl } from "obsidian";
import type { HttpRequest, HttpResponse } from "../protocol";

export const HTTP_TIMEOUT = 30000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const PER_MINUTE = 60;
const CONCURRENT = 4;
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
/** Set by the HTTP stack; a block cannot choose them. */
const FORBIDDEN_HEADERS = new Set(["host", "content-length", "connection", "transfer-encoding", "upgrade", "keep-alive", "te", "trailer"]);

/** Request budget of one block (keyed by its frame). */
class Gate {
	private started: number[] = [];
	private active = 0;

	enter() {
		const now = Date.now();
		this.started = this.started.filter((t) => now - t < 60000);
		if (this.started.length >= PER_MINUTE) throw new Error(`prism.http: more than ${PER_MINUTE} requests per minute from this block`);
		if (this.active >= CONCURRENT) throw new Error(`prism.http: at most ${CONCURRENT} requests at a time per block`);
		this.started.push(now);
		this.active++;
	}

	leave() {
		this.active--;
	}
}

const gates = new WeakMap<object, Gate>();

export const HTTP_OFF_MESSAGE = "prism.http is off. Online access → API requests must be enabled in Settings → Prism.";

/**
 * Holds a block's requests until the reader clicks "Run requests" below the
 * block. A click releases the requests to the hosts shown in the bar, for the
 * current render; a request to any other host shows the bar again. A
 * re-render asks again. Command-line renders and PDF export never show the
 * bar, so their requests are never sent.
 */
export class HttpApproval {
	private approved = new Set<string>();
	private waiting: { host: string; resume: () => void }[] = [];
	private bar: HTMLElement | null = null;

	/** `anchor`: the bar is inserted after this element. */
	constructor(private anchor: () => HTMLElement | null, private interactive: boolean) {}

	wait(url: string): Promise<void> {
		const host = hostOf(url);
		if (this.approved.has(host)) return Promise.resolve();
		return new Promise((resume) => {
			this.waiting.push({ host, resume });
			this.show();
		});
	}

	/** New render or unload: the approval ends; held requests are dropped and never sent. */
	reset() {
		this.approved.clear();
		this.waiting = [];
		this.bar?.remove();
		this.bar = null;
	}

	/** Releases the requests to the hosts the bar showed when it was clicked. */
	private approve(hosts: string[]) {
		hosts.forEach((host) => this.approved.add(host));
		const released = this.waiting.filter((w) => this.approved.has(w.host));
		this.waiting = this.waiting.filter((w) => !this.approved.has(w.host));
		this.bar?.remove();
		this.bar = null;
		released.forEach((w) => w.resume());
		if (this.waiting.length) this.show();
	}

	private show() {
		const anchor = this.interactive ? this.anchor() : null;
		if (!anchor) return;
		if (!this.bar) {
			this.bar = createDiv({ cls: "prism-http-bar" });
			anchor.after(this.bar);
		}
		this.bar.empty();
		const hosts = Array.from(new Set(this.waiting.map((w) => w.host)));
		const text = this.bar.createSpan({ cls: "prism-http-text" });
		text.appendText(this.approved.size ? "This block also wants to send requests to " : "This block wants to send requests to ");
		text.createEl("b", { text: hosts.join(", ") });
		text.appendText(".");
		const run = this.bar.createEl("button", { cls: "mod-cta", text: "Run requests" });
		run.addEventListener("click", (e) => {
			e.stopPropagation();
			this.approve(hosts);
		});
	}
}

/** Validates and sends a block's request. `owner` identifies the block for rate limiting; `approval` holds it until the reader agrees. */
export async function sendHttp(owner: object, raw: unknown, approval: HttpApproval | null): Promise<HttpResponse> {
	const req = validate(raw);
	if (approval) await approval.wait(req.url);
	let gate = gates.get(owner);
	if (!gate) gates.set(owner, (gate = new Gate()));
	gate.enter();
	let timer = 0;
	try {
		const response = await Promise.race([
			requestUrl({ url: req.url, method: req.method, headers: req.headers, body: req.body, throw: false }),
			new Promise<never>((_, reject) => {
				timer = window.setTimeout(() => reject(new Error(`prism.http: no response from ${hostOf(req.url)} within ${HTTP_TIMEOUT / 1000} s`)), HTTP_TIMEOUT);
			}),
		]);
		if (response.arrayBuffer.byteLength > MAX_RESPONSE_BYTES) {
			throw new Error(`prism.http: response from ${hostOf(req.url)} is larger than ${MAX_RESPONSE_BYTES / 1024 / 1024} MB`);
		}
		const headers: Record<string, string> = {};
		for (const [name, value] of Object.entries(response.headers ?? {})) headers[name.toLowerCase()] = String(value);
		return {
			url: req.url,
			status: response.status,
			ok: response.status >= 200 && response.status < 300,
			headers,
			text: req.method === "HEAD" ? "" : response.text,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(message.startsWith("prism.http") ? message : `prism.http: request to ${hostOf(req.url)} failed (${message})`);
	} finally {
		window.clearTimeout(timer);
		gate.leave();
	}
}

function validate(raw: unknown): Required<Pick<HttpRequest, "url" | "method">> & HttpRequest {
	if (!raw || typeof raw !== "object") throw new Error("prism.http: invalid request");
	const r = raw as HttpRequest;
	let url: URL;
	try {
		url = new URL(String(r.url));
	} catch {
		throw new Error(`prism.http: invalid URL "${String(r.url)}" (absolute http:// or https:// URL expected)`);
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`prism.http: only http and https URLs are allowed (got ${url.protocol})`);
	if (url.username || url.password) throw new Error("prism.http: credentials in the URL are not allowed; send them in a header");
	const method = String(r.method || "GET").toUpperCase();
	if (!METHODS.includes(method)) throw new Error(`prism.http: unsupported method ${method}`);
	const headers: Record<string, string> = {};
	if (r.headers && typeof r.headers === "object") {
		for (const [name, value] of Object.entries(r.headers)) {
			if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) throw new Error(`prism.http: invalid header name "${name}"`);
			if (FORBIDDEN_HEADERS.has(name.toLowerCase())) continue;
			headers[name] = String(value);
		}
	}
	let body: string | undefined;
	if (r.body !== undefined && r.body !== null) {
		if (method === "GET" || method === "HEAD") throw new Error(`prism.http: ${method} requests cannot have a body`);
		body = String(r.body);
		if (body.length > MAX_BODY_BYTES) throw new Error(`prism.http: request body is larger than ${MAX_BODY_BYTES / 1024} KB`);
	}
	return { url: url.href, method, headers, body };
}

function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}
