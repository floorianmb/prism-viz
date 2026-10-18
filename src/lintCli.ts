/// <reference types="node" />
// Entry of scripts/prism-lint.mjs: lintNote plus a file-based helper for the command line.
import * as fs from "fs";
import * as path from "path";
import { lintNote, type LintResult } from "./lint";

/** Lints a note file; data files are read relative to `vaultRoot`. */
export function lintNoteFile(file: string, vaultRoot: string, notePath = file): LintResult {
	const files = {
		readText(p: string) {
			try {
				const full = path.resolve(vaultRoot, p);
				const rel = path.relative(vaultRoot, full);
				if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
				return fs.readFileSync(full, "utf8");
			} catch {
				return null;
			}
		},
	};
	return lintNote(fs.readFileSync(file, "utf8"), files, notePath);
}

export { lintNote };
