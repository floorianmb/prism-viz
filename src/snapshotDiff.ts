// Compares a block's new snapshot with its previous one, so a command-line
// render can tell an agent that a block looks different now (e.g. a layout
// broke although no error was reported).

export interface Pixels {
	width: number;
	height: number;
	/** RGBA, 4 bytes per pixel. */
	data: Uint8ClampedArray;
}

/** How a block's snapshot changed since the previous render (render result → blocks[].change). */
export interface SnapshotChange {
	/** When the previous snapshot was taken. */
	since?: string;
	/** Share of pixels that differ, in percent (0–100, one decimal); pixels outside the smaller image count as changed. */
	pixels: number;
	/** Image size before and after, in CSS pixels. */
	before: { width: number; height: number };
	after: { width: number; height: number };
}

/** A channel has to differ by more than this to count (antialiasing noise). */
const TOLERANCE = 24;

/** Percent of differing pixels over the area both images cover together. */
export function pixelDiff(a: Pixels, b: Pixels): number {
	const width = Math.max(a.width, b.width);
	const height = Math.max(a.height, b.height);
	if (!width || !height) return 0;
	const w = Math.min(a.width, b.width);
	const h = Math.min(a.height, b.height);
	let changed = width * height - w * h;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * a.width + x) * 4;
			const j = (y * b.width + x) * 4;
			if (
				Math.abs(a.data[i] - b.data[j]) > TOLERANCE ||
				Math.abs(a.data[i + 1] - b.data[j + 1]) > TOLERANCE ||
				Math.abs(a.data[i + 2] - b.data[j + 2]) > TOLERANCE ||
				Math.abs(a.data[i + 3] - b.data[j + 3]) > TOLERANCE
			)
				changed++;
		}
	}
	return Math.round((changed / (width * height)) * 1000) / 10;
}

/** Decodes a PNG into pixels (Obsidian's window: createImageBitmap + canvas). */
export async function decodePng(bytes: ArrayBuffer): Promise<Pixels> {
	const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("2D canvas is not available");
		ctx.drawImage(bitmap, 0, 0);
		return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
	} finally {
		bitmap.close();
	}
}

export async function compareSnapshots(before: ArrayBuffer, after: ArrayBuffer, since?: string): Promise<SnapshotChange> {
	const [a, b] = await Promise.all([decodePng(before), decodePng(after)]);
	return { since, pixels: pixelDiff(a, b), before: { width: a.width, height: a.height }, after: { width: b.width, height: b.height } };
}
