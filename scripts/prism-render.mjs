#!/usr/bin/env node
// Renders the viz blocks of a note in the running Obsidian app and prints the
// result as JSON – for AI agents that edit notes from the command line.
//
//   node .obsidian/plugins/prism-viz/scripts/prism-render.mjs "Folder/Note.md" [--no-snapshot] [--width 720] [--timeout 60] [--reload]
//   node .obsidian/plugins/prism-viz/scripts/prism-render.mjs --reload      (only reload Prism, e.g. after npm run build)
//   node .obsidian/plugins/prism-viz/scripts/prism-render.mjs --all [folder] (every note with viz blocks; prints a summary)
//
// Exit codes: 0 = ok/warning, 1 = errors in blocks, 2 = render failed,
// 3 = no answer (Obsidian not running or Prism disabled), 4 = usage error.
// Requires Obsidian (desktop) with Prism enabled. The note does not need to be open.

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
	const i = args.indexOf(name);
	return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !["--width", "--timeout"].includes(args[i - 1]));

if ((!positional.length && !flag("--reload") && !flag("--all")) || flag("--help")) {
	console.error(
		'Usage: prism-render.mjs "<note path>" [--no-snapshot] [--width 720] [--timeout 60] [--reload]\n' +
			"       prism-render.mjs --reload\n" +
			"       prism-render.mjs --all [folder] [--snapshot]"
	);
	process.exit(4);
}

// <vault>/.obsidian/plugins/prism-viz/scripts/prism-render.mjs
const vaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
if (!fs.existsSync(path.join(vaultRoot, ".obsidian"))) {
	console.error(`Could not find the vault root (expected .obsidian in ${vaultRoot}).`);
	process.exit(4);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function openUri(uri) {
	const [cmd, cmdArgs] =
		process.platform === "darwin"
			? ["open", ["-g", uri]] // -g: do not bring Obsidian to the foreground
			: process.platform === "win32"
			? ["rundll32", ["url.dll,FileProtocolHandler", uri]] // avoids cmd.exe treating & as a separator
			: ["xdg-open", [uri]];
	spawn(cmd, cmdArgs, { stdio: "ignore", detached: true }).on("error", (err) => {
		console.error(`Could not open ${uri}: ${err.message}`);
		process.exit(3);
	}).unref();
}

// --reload: load a freshly built main.js and wait until the new instance reports in .prism/plugin.json.
if (flag("--reload")) {
	const infoFile = path.join(vaultRoot, ".prism", "plugin.json");
	const since = Date.now();
	openUri(`obsidian://prism?vault=${encodeURIComponent(path.basename(vaultRoot))}&reload=1`);
	let info = null;
	while (Date.now() - since < 20000) {
		try {
			info = JSON.parse(fs.readFileSync(infoFile, "utf8"));
			if (Date.parse(info.loadedAt) >= since) break;
		} catch {
			/* not written yet */
		}
		info = null;
		await sleep(300);
	}
	if (!info) {
		console.error("Prism did not report a reload within 20s. Is Obsidian running with this vault open and Prism enabled?");
		process.exit(3);
	}
	console.error(`Prism ${info.version} reloaded at ${info.loadedAt}.`);
	if (!positional.length && !flag("--all")) process.exit(0);
	await sleep(500);
}

const width = parseInt(option("--width", "720"), 10) || 720;
const timeout = parseInt(option("--timeout", "60"), 10) || 60;

/** Renders one note (vault path) in Obsidian; resolves with the result, or null if Obsidian did not answer. */
async function renderNote(target, snapshot) {
	const id = `cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
	const query = new URLSearchParams({ vault: path.basename(vaultRoot), render: target, id, width: String(width), timeout: String(timeout) });
	if (!snapshot) query.set("snapshot", "0");
	openUri(`obsidian://prism?${query.toString().replace(/\+/g, "%20")}`);
	const resultFile = path.join(vaultRoot, ".prism", "renders", `${id}.json`);
	const deadline = Date.now() + (timeout + 20) * 1000;
	let result = null;
	while (Date.now() < deadline) {
		try {
			result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
		} catch {
			result = null;
		}
		if (result && result.status !== "running") {
			for (const block of result.blocks ?? []) if (block.snapshot) block.snapshotFile = path.join(vaultRoot, block.snapshot);
			return result;
		}
		await sleep(400);
	}
	return result ? { ...result, status: "timeout" } : null;
}

// --all: every visible note below the vault (or a folder) that contains a viz block.
if (flag("--all")) {
	const base = positional[0] ? path.resolve(vaultRoot, positional[0]) : vaultRoot;
	const notes = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith(".md") && /^\s*(`{3,}|~{3,})\s*viz\b/im.test(fs.readFileSync(full, "utf8"))) notes.push(path.relative(vaultRoot, full).split(path.sep).join("/"));
		}
	};
	walk(base);
	const summary = [];
	let worst = 0;
	for (const note of notes.sort()) {
		const result = await renderNote(note, flag("--snapshot"));
		if (!result) {
			console.error("No answer from Obsidian. Is it running with this vault open and Prism enabled?");
			process.exit(3);
		}
		// Only quoted examples (e.g. inside a ```` fence): nothing to render.
		if (result.status === "failed" && !(result.blocks ?? []).length && /no viz blocks/.test(result.message ?? "")) {
			summary.push({ note, status: "skipped", blocks: 0, problems: [] });
			console.error(`skipped  ${note} (viz only inside other code blocks)`);
			continue;
		}
		const problems = (result.blocks ?? []).flatMap((b) => b.errors.map((e) => ({ block: b.block, kind: e.kind, line: e.line, message: e.message })));
		summary.push({ note, status: result.status, blocks: (result.blocks ?? []).length, problems });
		worst = Math.max(worst, result.status === "failed" || result.status === "timeout" ? 2 : result.status === "error" ? 1 : 0);
		console.error(`${result.status.padEnd(8)} ${note} (${(result.blocks ?? []).length} blocks${problems.length ? `, ${problems.length} problems` : ""})`);
	}
	console.log(JSON.stringify({ notes: summary.length, ok: summary.filter((s) => s.status === "ok").length, results: summary }, null, 2));
	process.exit(worst);
}

// Accept absolute paths, paths relative to the cwd, or vault-relative paths.
let target = positional[0];
const fromCwd = path.resolve(process.cwd(), target);
if (path.isAbsolute(target) || fs.existsSync(fromCwd)) {
	const abs = path.isAbsolute(target) ? target : fromCwd;
	const rel = path.relative(vaultRoot, abs);
	if (rel.startsWith("..")) {
		console.error(`${abs} is not inside the vault ${vaultRoot}.`);
		process.exit(4);
	}
	target = rel;
}
target = target.split(path.sep).join("/");

const result = await renderNote(target, !flag("--no-snapshot"));
if (!result) {
	console.error(`No answer from Obsidian after ${timeout + 20}s. Is Obsidian running with this vault open and Prism enabled?`);
	process.exit(3);
}
if (result.status === "timeout") {
	console.error(`Render ${result.id} is still running after ${timeout + 20}s.`);
	process.exit(3);
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "failed" ? 2 : result.status === "error" ? 1 : 0);
