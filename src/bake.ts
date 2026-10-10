// Baked blocks: a PNG of each viz block, linked right below the block as a
// plain Markdown image. Where Prism does not run (Obsidian Publish, GitHub,
// other Markdown apps, Prism switched off) readers see the image; with Prism
// the image is hidden by styles.css and the live block shows instead.

/** Alt text that marks a baked image (styles.css hides images with it). */
export const BAKED_ALT = "Prism snapshot";

const BAKED_LINE = /^!\[Prism snapshot(?::[^\]]*)?\]\(([^)\s]+)\)\s*$/;

/** The link target of a baked image line, or null. */
export function bakedTarget(line: string): string | null {
	const m = BAKED_LINE.exec(line.trim());
	return m ? m[1] : null;
}

export function bakedLine(title: string, link: string): string {
	const alt = `${BAKED_ALT}: ${title}`.replace(/[[\]]/g, "");
	return `![${alt}](${link})`;
}

/** URL-encodes one path segment for a Markdown link (spaces, %, parentheses …). */
function encodeSegment(s: string): string {
	return encodeURIComponent(s).replace(/[()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Relative Markdown link from a note to a vault file. */
export function relativeLink(notePath: string, target: string): string {
	const from = notePath.split("/").slice(0, -1);
	const to = target.split("/");
	let common = 0;
	while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
	const up = from.slice(common).map(() => "..");
	return [...up, ...to.slice(common)].map((s) => (s === ".." ? s : encodeSegment(s))).join("/");
}

/** Vault path of a relative Markdown link in a note. */
export function resolveLink(notePath: string, link: string): string {
	let decoded: string;
	try {
		decoded = decodeURIComponent(link);
	} catch {
		decoded = link;
	}
	const parts = notePath.split("/").slice(0, -1);
	for (const s of decoded.split("/")) {
		if (s === "" || s === ".") continue;
		if (s === "..") parts.pop();
		else parts.push(s);
	}
	return parts.join("/");
}

/**
 * Puts `lines[at]` (the line after a block's closing fence) to a baked image
 * line: replaces an existing baked line there, otherwise inserts one. Edits
 * must be applied from the bottom of the note up.
 */
export function placeBaked(lines: string[], after: number, line: string) {
	if (bakedTarget(lines[after + 1] ?? "") !== null) lines[after + 1] = line;
	else lines.splice(after + 1, 0, line);
}
