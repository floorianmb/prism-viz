// Library sources from libs/ are embedded as strings at build time (see esbuild.config.mjs).
declare module "libtext:*" {
	const source: string;
	export default source;
}

// Markdown files (CHANGELOG.md) are imported as text (loader in esbuild.config.mjs).
declare module "*.md" {
	const text: string;
	export default text;
}
