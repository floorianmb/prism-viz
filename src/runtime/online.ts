// prism.http() inside the block. The block itself stays offline: the request
// is handed to the host, which sends it only when the user enabled
// Settings → Prism → Online access → API requests (see src/online/http.ts).

import type { HttpRequest, HttpResponse } from "../protocol";

type Request = <T>(method: string, payload: Record<string, unknown>, timeoutMs?: number) => Promise<T>;

export interface HttpOptions {
	method?: string;
	headers?: Record<string, string>;
	/** Query parameters appended to the URL. */
	query?: Record<string, string | number | boolean | null | undefined>;
	/** String body, or an object/array sent as JSON. */
	body?: unknown;
}

export interface PrismHttpResponse extends HttpResponse {
	json<T = unknown>(): T;
}

/** Host timeout (30 s) plus a margin for the message round trip. */
const TIMEOUT = 35000;

export function createHttp(request: Request) {
	async function http(url: string, options: HttpOptions = {}): Promise<PrismHttpResponse> {
		const headers: Record<string, string> = { ...(options.headers ?? {}) };
		let target = String(url);
		if (options.query) {
			const u = new URL(target);
			for (const [k, v] of Object.entries(options.query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
			target = u.href;
		}
		let body: string | undefined;
		if (options.body !== undefined && options.body !== null) {
			if (typeof options.body === "string") body = options.body;
			else {
				body = JSON.stringify(options.body);
				if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
			}
		}
		const req: HttpRequest = { url: target, method: options.method, headers, body };
		const res = await request<HttpResponse>("http", { request: req }, TIMEOUT);
		return {
			...res,
			json<T>() {
				try {
					return JSON.parse(res.text) as T;
				} catch {
					throw new Error(`prism.http: response of ${res.url} is not valid JSON (status ${res.status})`);
				}
			},
		};
	}
	/** GET (or other method) and parse JSON; rejects on a non-2xx status. */
	http.json = async <T = unknown>(url: string, options: HttpOptions = {}): Promise<T> => {
		const res = await http(url, { ...options, headers: { Accept: "application/json", ...(options.headers ?? {}) } });
		if (!res.ok) throw new Error(`prism.http: ${res.status} from ${res.url}${res.text ? ` – ${res.text.slice(0, 200)}` : ""}`);
		return res.json<T>();
	};
	return http;
}
