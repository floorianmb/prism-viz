// Read-only access to data files for prism.data(): path resolution and the
// allowlist check. Notes, hidden files and folders outside the configured
// data folders are never readable.

export const DATA_EXTENSIONS = ["csv", "tsv", "json", "geojson", "yaml", "yml", "txt"];
export const MAX_DATA_BYTES = 10 * 1024 * 1024;

/** Resolves `raw` (vault-relative, or ./ ../ relative to the block's file) to a normalized vault path. */
export function resolveDataPath(raw: string, sourcePath: string): string {
	let path = String(raw).trim().replace(/\\/g, "/");
	if (!path) throw new Error("prism.data: empty path");
	if (path.startsWith("./") || path.startsWith("../")) {
		const folder = sourcePath.includes("/") ? sourcePath.slice(0, sourcePath.lastIndexOf("/")) : "";
		path = folder ? `${folder}/${path}` : path;
	}
	const parts: string[] = [];
	for (const segment of path.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (!parts.length) throw new Error(`prism.data: "${raw}" points outside the vault`);
			parts.pop();
		} else parts.push(segment);
	}
	return parts.join("/");
}

/** A read outside the data folders; `folder` is the folder the user could allow. */
export class DataAccessError extends Error {
	constructor(message: string, readonly folder: string) {
		super(message);
	}
}

function folderOf(path: string): string {
	return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "/";
}

/** Throws a descriptive error unless `path` may be read. */
export function checkDataAccess(path: string, folders: string[]): void {
	if (!folders.length) {
		throw new DataAccessError(`prism.data is off: add a data folder in Settings → Prism → Data folders (needed: ${folderOf(path)}).`, folderOf(path));
	}
	if (path.split("/").some((s) => s.startsWith("."))) throw new Error(`prism.data: hidden paths are not readable (${path})`);
	const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
	if (!DATA_EXTENSIONS.includes(ext)) {
		throw new Error(`prism.data: .${ext || "?"} files are not readable (allowed: ${DATA_EXTENSIONS.map((e) => "." + e).join(", ")})`);
	}
	if (!folders.some((f) => isInFolder(path, f))) {
		throw new DataAccessError(`prism.data: ${path} is outside the data folders (${folders.join(", ")}). Add its folder in Settings → Prism → Data folders.`, folderOf(path));
	}
}

export function isInFolder(path: string, folder: string): boolean {
	const f = folder.replace(/^\/+|\/+$/g, "");
	return f === "" || path === f || path.startsWith(f + "/");
}

export function extensionOf(path: string): string {
	return path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
}
