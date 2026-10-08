// Operating-system figures for Obsidian's processes and for web views, from
// Electron's app.getAppMetrics() via the remote module. Desktop only; every
// function returns null where that is unavailable (mobile, no remote).

import { Platform } from "obsidian";
import type { PerfProcess } from "../protocol";

interface ProcessMetric {
	pid: number;
	type: string;
	cpu: { percentCPUUsage: number };
	memory: { workingSetSize: number };
}

interface Remote {
	app: { getAppMetrics(): ProcessMetric[] };
	getCurrentWebContents(): { getOSProcessId(): number };
	webContents: { fromId(id: number): { getOSProcessId(): number } | undefined };
}

function remote(): Remote | null {
	if (!Platform.isDesktopApp) return null;
	try {
		const electron = (window as Window & { require?: (id: string) => { remote?: Remote } }).require?.("electron");
		return electron?.remote ?? null;
	} catch {
		return null;
	}
}

const toProcess = (m: ProcessMetric): PerfProcess => ({ cpu: m.cpu.percentCPUUsage, memory: m.memory.workingSetSize * 1024 });

export interface ProcessSample {
	byPid: Map<number, PerfProcess>;
	window: PerfProcess | null;
	gpu: PerfProcess | null;
	app: PerfProcess;
}

/** One sample of all of Obsidian's processes. CPU is relative to the previous call. */
export function sampleProcesses(): ProcessSample | null {
	const r = remote();
	if (!r) return null;
	try {
		const metrics = r.app.getAppMetrics();
		const byPid = new Map(metrics.map((m) => [m.pid, toProcess(m)] as const));
		const gpu = metrics.find((m) => m.type === "GPU");
		const app = metrics.reduce((sum, m) => ({ cpu: sum.cpu + m.cpu.percentCPUUsage, memory: sum.memory + m.memory.workingSetSize * 1024 }), { cpu: 0, memory: 0 });
		return { byPid, window: byPid.get(r.getCurrentWebContents().getOSProcessId()) ?? null, gpu: gpu ? toProcess(gpu) : null, app };
	} catch (err) {
		console.warn("Prism: process metrics unavailable", err);
		return null;
	}
}

/** Process id of a web view's guest contents. */
export function pidOfContents(webContentsId: number): number | null {
	try {
		return remote()?.webContents.fromId(webContentsId)?.getOSProcessId() ?? null;
	} catch {
		return null;
	}
}
