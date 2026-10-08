// Stylesheets of the runtime widgets: prism.table, prism.monitor and note links
// in diagrams. Every block's srcdoc includes them (src/document.ts), so the
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

export const MONITOR_CSS = `
.pm{grid-template-columns:repeat(2,minmax(0,1fr))}
.pm .kpi{font-variant-numeric:tabular-nums;white-space:nowrap}
`;

export const NOTE_LINK_CSS =
	".prism-note-link{cursor:pointer}.prism-note-link-text{color:var(--link-color,var(--text-accent));text-decoration:underline;text-underline-offset:2px}" +
	"svg .prism-note-link-text{fill:var(--link-color,var(--text-accent))}";
