// Stylesheets of the runtime widgets: prism.table, prism.monitor, the SVG chart
// types (calendar, map; their colors are set inline, see svgCharts.ts) and note
// links in diagrams. Every block's srcdoc includes them (src/document.ts), so the
// runtime never creates style elements itself.

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

export const SVG_CHART_CSS = `
.prism-svgchart svg{display:block;width:100%;height:auto;margin:0 auto;overflow:visible}
.prism-svgchart svg:focus{outline:none}
.prism-svgchart svg:focus-visible{outline:2px solid var(--interactive-accent);outline-offset:2px;border-radius:var(--radius-s,4px)}
.prism-map .region{stroke-width:.6px;vector-effect:non-scaling-stroke}
.prism-svgchart .is-active{cursor:pointer}
.prism-svgchart .is-active:hover,.prism-svgchart .is-focus{stroke:var(--text-normal);stroke-width:1.5px}
.prism-svgchart .is-selected{stroke:var(--interactive-accent);stroke-width:2px}
.prism-svgchart-legend{display:flex;justify-content:flex-end;align-items:center;gap:3px;margin-top:6px;font-size:var(--font-ui-smaller,12px);color:var(--text-muted)}
.prism-svgchart-legend i{display:inline-block;width:11px;height:11px;border-radius:2px}
.prism-svgchart-legend span{margin:0 4px;font-variant-numeric:tabular-nums}
.prism-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

export const MONITOR_CSS = `
.pm{grid-template-columns:repeat(2,minmax(0,1fr))}
.pm .kpi{font-variant-numeric:tabular-nums;white-space:nowrap}
`;

export const NOTE_LINK_CSS =
	".prism-note-link{cursor:pointer}.prism-note-link-text{color:var(--link-color,var(--text-accent));text-decoration:underline;text-underline-offset:2px}" +
	"svg .prism-note-link-text{fill:var(--link-color,var(--text-accent))}";
