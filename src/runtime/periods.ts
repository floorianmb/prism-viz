// Dates grouped into periods (`group: week` etc. in chart specs). Periods are
// written as sortable text, so they work as chart labels, filter values and
// prism.shared selections: day 2026-10-18, week 2026-W42 (ISO), month 2026-10,
// quarter 2026-Q4, year 2026.

export const PERIODS = ["day", "week", "month", "quarter", "year"];

/** "YYYY-MM-DD" of a value that starts with a valid date (also "2026-10-18T09:00", "2026-10-18 Sat"), else null. */
export function isoDay(value: unknown): string | null {
	const m = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?=$|[T\s])/.exec(value.trim()) : null;
	if (!m) return null;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[0] : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO week year and number of a UTC date (weeks start on Monday, week 1 holds the first Thursday). */
function isoWeek(t: number): { year: number; week: number } {
	const d = new Date(t);
	const thursday = t + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000;
	const year = new Date(thursday).getUTCFullYear();
	return { year, week: 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * 86400000)) };
}

/** The period label of a date value, or null when the value is no date. */
export function periodOf(value: unknown, group: string): string | null {
	const day = isoDay(value);
	if (!day) return null;
	const [y, m, d] = day.split("-").map(Number);
	if (group === "year") return String(y);
	if (group === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
	if (group === "month") return `${y}-${pad(m)}`;
	if (group === "week") {
		const w = isoWeek(Date.UTC(y, m - 1, d));
		return `${w.year}-W${pad(w.week)}`;
	}
	return day;
}

/** First day (UTC ms) of a period label. */
function periodStart(label: string): number {
	let m = /^(\d{4})-W(\d{2})$/.exec(label);
	if (m) {
		const jan4 = Date.UTC(+m[1], 0, 4);
		const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86400000;
		return monday + (+m[2] - 1) * 7 * 86400000;
	}
	m = /^(\d{4})-Q(\d)$/.exec(label);
	if (m) return Date.UTC(+m[1], (+m[2] - 1) * 3, 1);
	m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(label);
	if (m) return Date.UTC(+m[1], m[2] ? +m[2] - 1 : 0, m[3] ? +m[3] : 1);
	return NaN;
}

/** The label of the period after `label`. */
export function nextPeriod(label: string, group: string): string {
	const t = periodStart(label);
	const d = new Date(t);
	const next =
		group === "year" ? Date.UTC(d.getUTCFullYear() + 1, 0, 1)
		: group === "quarter" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1)
		: group === "month" ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
		: t + (group === "week" ? 7 : 1) * 86400000;
	return periodOf(new Date(next).toISOString().slice(0, 10), group) as string;
}

/** Every period label from `first` to `last` (inclusive), at most `max` of them. */
export function periodRange(first: string, last: string, group: string, max = 5000): string[] {
	const out: string[] = [];
	for (let p = first; out.length < max && p <= last; p = nextPeriod(p, group)) out.push(p);
	return out;
}

/** Today in the reader's time zone as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
