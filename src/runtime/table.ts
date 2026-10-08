// Interactive data table for prism.table() and ```viz table blocks: search,
// click-to-sort headers, locale number formatting, source links and
// confidence badges. Sort order and search text persist in the block state.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ColumnFormat = "text" | "number" | "integer" | "percent" | "eur" | "usd" | "date" | "link" | "badge";

export interface TableColumn {
	key: string;
	label?: string;
	format?: ColumnFormat;
	/** Decimal places for number formats. */
	digits?: number;
}

export interface TableSpec {
	source?: string | Record<string, unknown>[];
	rows?: Record<string, unknown>[];
	/** Column keys, or objects with label/format. Default: all columns. */
	columns?: (string | TableColumn)[];
	/** Shorthand: { column: format } for columns not listed in `columns`. */
	format?: Record<string, ColumnFormat>;
	/** Initial sort, "-col" descending. */
	sort?: string;
	filter?: Record<string, unknown>;
	/** Show the search box (default: more than 8 rows). */
	search?: boolean;
	/** Rows per page (default 25). */
	pageSize?: number;
	title?: string;
}

export interface TableDeps {
	locale: string;
	stateGet(key: string, fallback?: unknown): unknown;
	stateSet(key: string, value: unknown): void;
	resize(): void;
}

const SPEC_KEYS = new Set(["source", "rows", "columns", "format", "sort", "filter", "search", "pageSize", "title"]);

export function tableWarnings(spec: TableSpec, columns: string[]): string[] {
	const out: string[] = [];
	for (const key of Object.keys(spec)) if (!SPEC_KEYS.has(key)) out.push(`prism.table: unknown key "${key}" (known: ${Array.from(SPEC_KEYS).join(", ")})`);
	const wanted = [
		...(spec.columns ?? []).map((c) => (typeof c === "string" ? c : c.key)),
		...Object.keys(spec.format ?? {}),
		...Object.keys(spec.filter ?? {}),
		spec.sort?.replace(/^-/, ""),
	].filter(Boolean) as string[];
	for (const c of wanted) if (columns.length && !columns.includes(c)) out.push(`prism.table: column "${c}" not found (columns: ${columns.join(", ")})`);
	return out;
}

/** "Title (https://…)" → { text, url }; a bare URL → { text: host, url }. */
export function linkParts(value: unknown): { text: string; url: string } | null {
	const s = String(value ?? "").trim();
	const titled = /^(.*?)\s*\((https?:\/\/[^\s)]+)\)\s*$/.exec(s);
	if (titled && titled[1]) return { text: titled[1], url: titled[2] };
	if (/^https?:\/\/\S+$/.test(s)) {
		try {
			return { text: new URL(s).host, url: s };
		} catch {
			return { text: s, url: s };
		}
	}
	return null;
}

/** Guesses a format from the column name and values. */
function guessFormat(key: string, values: unknown[]): ColumnFormat {
	const present = values.filter((v) => v !== null && v !== undefined && v !== "");
	if (/^(source|url|link|quelle)s?$/i.test(key) || (present.length && present.every((v) => linkParts(v)))) return "link";
	if (/^(confidence|status|priority)$/i.test(key)) return "badge";
	if (present.length && present.every((v) => typeof v === "number")) {
		if (/year|jahr/i.test(key)) return "text";
		return present.every((v) => Number.isInteger(v)) ? "integer" : "number";
	}
	if (present.length && present.every((v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))) return "date";
	return "text";
}

function compare(a: unknown, b: unknown): number {
	const empty = (v: unknown) => v === null || v === undefined || v === "";
	if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

const BADGE_TONES: Record<string, string> = {
	high: "success",
	medium: "warning",
	low: "error",
	hoch: "success",
	mittel: "warning",
	niedrig: "error",
	done: "success",
	open: "warning",
};

const UNIT_FORMATS: Record<string, ColumnFormat> = { "€": "eur", "%": "percent", $: "usd" };

export function renderTable(
	container: HTMLElement,
	input: Record<string, unknown>[] & { columns?: string[]; units?: Record<string, string> },
	spec: TableSpec,
	deps: TableDeps
) {
	const allColumns = Array.isArray(input.columns) ? input.columns : Array.from(new Set(input.slice(0, 50).flatMap((r) => Object.keys(r))));
	let rows = input.slice();
	if (spec.filter) rows = rows.filter((r) => Object.entries(spec.filter as object).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
	const cols = (spec.columns ?? allColumns).map((c) => {
		const col: TableColumn = typeof c === "string" ? { key: c } : c;
		const unit = input.units?.[col.key];
		const format = col.format ?? spec.format?.[col.key] ?? (unit && UNIT_FORMATS[unit]) ?? guessFormat(col.key, rows.map((r) => r[col.key]));
		// Currencies show cents only if the column has them.
		const cents = rows.some((r) => typeof r[col.key] === "number" && !Number.isInteger(r[col.key]));
		const digits = col.digits ?? (format === "eur" || format === "usd" ? (cents ? 2 : 0) : undefined);
		return { key: col.key, label: col.label ?? col.key, format, digits };
	});
	const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat(deps.locale, opts);
	const fmt = {
		integer: nf({ maximumFractionDigits: 0 }),
		number: (d?: number) => nf({ minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 2 }),
		percent: (d?: number) => nf({ style: "percent", maximumFractionDigits: d ?? 1 }),
		currency: (code: string, d = 0) => nf({ style: "currency", currency: code, minimumFractionDigits: d, maximumFractionDigits: d }),
		date: new Intl.DateTimeFormat(deps.locale, { year: "numeric", month: "2-digit", day: "2-digit" }),
	};

	const pageSize = Math.max(5, Number(spec.pageSize) || 25);
	let sort = String(deps.stateGet("tableSort", spec.sort ?? "") || "");
	let query = String(deps.stateGet("tableQuery", "") || "");
	let shown = pageSize;

	container.replaceChildren();
	container.classList.add("prism-table");
	if (spec.title) container.append(Object.assign(document.createElement("div"), { className: "label", textContent: spec.title }));
	const bar = container.appendChild(document.createElement("div"));
	bar.className = "row prism-table-bar";
	const showSearch = spec.search ?? rows.length > 8;
	const search = document.createElement("input");
	search.type = "search";
	search.placeholder = deps.locale.startsWith("de") ? "Suchen …" : "Search …";
	search.value = query;
	if (showSearch) bar.append(search);
	const count = bar.appendChild(document.createElement("span"));
	count.className = "faint";
	const scroller = container.appendChild(document.createElement("div"));
	scroller.className = "prism-table-scroll";
	const table = scroller.appendChild(document.createElement("table"));
	const thead = table.createTHead().insertRow();
	const tbody = table.createTBody();
	const more = container.appendChild(document.createElement("button"));
	more.className = "prism-table-more";

	const cell = (td: HTMLTableCellElement, value: unknown, col: (typeof cols)[number]) => {
		if (value === null || value === undefined || value === "") {
			td.textContent = "–";
			td.className = "faint";
			return;
		}
		switch (col.format) {
			case "integer":
			case "number":
			case "percent":
			case "eur":
			case "usd": {
				const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
				if (!Number.isFinite(n)) {
					td.textContent = String(value);
					break;
				}
				td.textContent =
					col.format === "integer"
						? fmt.integer.format(n)
						: col.format === "number"
						? fmt.number(col.digits).format(n)
						: col.format === "percent"
						? fmt.percent(col.digits).format(Math.abs(n) > 1 ? n / 100 : n)
						: fmt.currency(col.format.toUpperCase(), col.digits).format(n);
				td.className = "num";
				break;
			}
			case "date": {
				const d = new Date(String(value));
				td.textContent = isNaN(d.getTime()) ? String(value) : fmt.date.format(d);
				break;
			}
			case "link": {
				const link = linkParts(value);
				if (!link) {
					td.textContent = String(value);
					break;
				}
				td.className = "link";
				const a = document.createElement("a");
				a.href = link.url;
				a.textContent = link.text;
				a.title = link.url;
				td.append(a);
				break;
			}
			case "badge": {
				const badge = document.createElement("span");
				const tone = BADGE_TONES[String(value).toLowerCase()];
				badge.className = `badge${tone ? ` prism-badge-${tone}` : ""}`;
				badge.textContent = String(value);
				td.append(badge);
				break;
			}
			default:
				td.textContent = String(value);
		}
	};

	const draw = () => {
		const q = query.trim().toLowerCase();
		let view = q ? rows.filter((r) => cols.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))) : rows.slice();
		if (sort) {
			const desc = sort.startsWith("-");
			const key = sort.replace(/^-/, "");
			view = view.slice().sort((a, b) => compare(a[key], b[key]) * (desc ? -1 : 1));
		}
		thead.replaceChildren();
		for (const col of cols) {
			const th = document.createElement("th");
			th.textContent = col.label;
			th.tabIndex = 0;
			th.className = ["integer", "number", "percent", "eur", "usd"].includes(col.format) ? "num" : "";
			const active = sort.replace(/^-/, "") === col.key;
			if (active) th.dataset.sort = sort.startsWith("-") ? "desc" : "asc";
			const toggle = () => {
				sort = !active ? col.key : sort.startsWith("-") ? "" : `-${col.key}`;
				deps.stateSet("tableSort", sort);
				draw();
			};
			th.onclick = toggle;
			th.onkeydown = (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					toggle();
				}
			};
			thead.append(th);
		}
		tbody.replaceChildren();
		for (const r of view.slice(0, shown)) {
			const tr = tbody.insertRow();
			for (const col of cols) cell(tr.insertCell(), r[col.key], col);
		}
		count.textContent = q ? `${view.length} / ${rows.length}` : `${rows.length}`;
		more.hidden = view.length <= shown;
		more.textContent = deps.locale.startsWith("de") ? `${Math.min(pageSize, view.length - shown)} weitere anzeigen` : `Show ${Math.min(pageSize, view.length - shown)} more`;
		deps.resize();
	};
	search.oninput = () => {
		query = search.value;
		shown = pageSize;
		deps.stateSet("tableQuery", query);
		draw();
	};
	more.onclick = () => {
		shown += pageSize;
		draw();
	};
	draw();
}

export const TABLE_CSS = `
.prism-table-bar{margin-bottom:6px}
.prism-table-bar input[type=search]{flex:1;min-width:140px;max-width:320px}
.prism-table-scroll{overflow-x:auto}
.prism-table table{margin:0}
.prism-table th{cursor:pointer;user-select:none;white-space:nowrap}
.prism-table th[data-sort=asc]::after{content:" ▲";font-size:.75em;color:var(--text-accent)}
.prism-table th[data-sort=desc]::after{content:" ▼";font-size:.75em;color:var(--text-accent)}
.prism-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.prism-table td.link{min-width:11em}
.prism-table td a{overflow-wrap:break-word;word-break:normal;hyphens:auto}
.prism-table .prism-badge-success{color:var(--text-success);background:color-mix(in srgb,var(--color-green) 15%,transparent)}
.prism-table .prism-badge-warning{color:var(--text-warning);background:color-mix(in srgb,var(--color-yellow) 15%,transparent)}
.prism-table .prism-badge-error{color:var(--text-error);background:color-mix(in srgb,var(--color-red) 15%,transparent)}
.prism-table-more{margin-top:8px}
`;
