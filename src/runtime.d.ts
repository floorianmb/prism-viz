/** Iframe runtime scripts, bundled to text by esbuild (see esbuild.config.mjs). */
declare module "runtime:*" {
	const source: string;
	export default source;
}
