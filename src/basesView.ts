// "Prism chart" view for Obsidian Bases (1.10+): charts the entries of a .base
// file, aggregated by a property, without writing any code. Rendering goes
// through the declarative chart path (prism.chart) of a normal Prism frame.

import * as obsidian from "obsidian";
import type { BasesAllOptions, BasesEntry, QueryController } from "obsidian";
import type PrismPlugin from "../main";
import { emptyOptions } from "./options";
import { BlockSpec, PrismFrame } from "./frame";
import { toText } from "./util";
import { buildSpec } from "./basesSpec";


export const BASES_VIEW_TYPE = "prism-chart";

/** Plain JSON value of a Bases Value (lists become arrays). */
function plain(value: obsidian.Value | null): unknown {
	const o = obsidian as unknown as Record<string, (abstract new (...args: never[]) => unknown) | undefined>;
	const is = (name: string) => {
		const cls = o[name];
		return !!cls && value instanceof cls;
	};
	if (!value || is("NullValue")) return null;
	if (is("ListValue")) {
		const list = value as obsidian.ListValue;
		return Array.from({ length: list.length() }, (_, i) => plain(list.get(i)));
	}
	if (is("NumberValue")) return Number(value.toString());
	if (is("BooleanValue")) return value.toString() === "true";
	const text = value.toString();
	return text === "" ? null : text;
}

function options(): BasesAllOptions[] {
	return [
		{
			type: "dropdown",
			key: "chartType",
			displayName: "Chart type",
			default: "bar",
			options: { bar: "Bar", hbar: "Horizontal bar", line: "Line", area: "Area", pie: "Pie", doughnut: "Doughnut", polarArea: "Polar area", calendar: "Calendar", map: "Map" },
		},
		{ type: "property", key: "x", displayName: "Group by", placeholder: "file.name" },
		{ type: "property", key: "y", displayName: "Value (empty: count notes)" },
		{
			type: "dropdown",
			key: "aggregate",
			displayName: "Aggregate values",
			default: "sum",
			options: { sum: "Sum", avg: "Average", min: "Minimum", max: "Maximum" },
		},
		{ type: "property", key: "series", displayName: "Split into series (optional)" },
		{ type: "toggle", key: "stacked", displayName: "Stacked", default: false },
		{ type: "dropdown", key: "sort", displayName: "Sort", default: "label", options: { label: "By label", value: "By value, largest first" } },
		{ type: "slider", key: "limit", displayName: "Max. groups", default: 30, min: 3, max: 100, step: 1 },
		{ type: "text", key: "geo", displayName: "GeoJSON file (map)", placeholder: "data/europe.geojson" },
		{ type: "text", key: "geoKey", displayName: "Region property (map, optional)" },
		{ type: "slider", key: "height", displayName: "Height", default: 320, min: 160, max: 900, step: 20 },
	];
}

export function registerBasesView(plugin: PrismPlugin) {
	const host = plugin as PrismPlugin & { registerBasesView?: (id: string, reg: obsidian.BasesViewRegistration) => boolean };
	const Base = (obsidian as unknown as { BasesView?: typeof obsidian.BasesView }).BasesView;
	if (typeof host.registerBasesView !== "function" || !Base) return;

	// Defined here: `BasesView` only exists at runtime in Obsidian 1.10+.
	class PrismBasesView extends Base {
		type = BASES_VIEW_TYPE;
		private frame: PrismFrame | null = null;
		private lastSource = "";

		constructor(controller: QueryController, private containerEl: HTMLElement) {
			super(controller);
			this.containerEl.addClass("prism-bases-view");
		}

		onDataUpdated(): void {
			const config = this.config;
			const xId = config.getAsPropertyId("x") ?? "file.name";
			const yId = config.getAsPropertyId("y");
			const sId = config.getAsPropertyId("series");
			const entries = this.data.data.map((entry: BasesEntry) => ({
				x: plain(entry.getValue(xId)),
				y: yId ? plain(entry.getValue(yId)) : null,
				s: sId ? plain(entry.getValue(sId)) : undefined,
				path: entry.file.path,
			}));
			const spec = buildSpec({
				chartType: toText(config.get("chartType"), "bar"),
				entries,
				xName: config.getDisplayName(xId),
				yName: yId ? config.getDisplayName(yId) : undefined,
				hasSeries: !!sId,
				aggregate: toText(config.get("aggregate"), "sum"),
				sort: config.get("sort") === "value" ? "value" : "label",
				limit: Number(config.get("limit")) || 30,
				stacked: !!config.get("stacked"),
				height: Number(config.get("height")) || 320,
				geo: toText(config.get("geo"), "").trim(),
				geoKey: toText(config.get("geoKey"), "").trim(),
			});
			const source = JSON.stringify(spec);
			if (source === this.lastSource) return;
			this.lastSource = source;
			if (this.frame) {
				this.frame.setSource(source);
				return;
			}
			const options = emptyOptions();
			options.libs.push("chart");
			const blockSpec: BlockSpec = {
				kind: "embed",
				source,
				options,
				sourcePath: this.app.workspace.getActiveFile()?.path ?? "Bases",
				blockKey: `base:${this.app.workspace.getActiveFile()?.path ?? ""}#${config.name}`,
				contentStartLine: 1,
			};
			this.frame = this.addChild(new PrismFrame(plugin, this.containerEl.createDiv(), blockSpec));
		}
	}

	host.registerBasesView(BASES_VIEW_TYPE, {
		name: "Prism chart",
		icon: "bar-chart-3",
		factory: (controller, containerEl) => new PrismBasesView(controller, containerEl),
		options,
	});
}
