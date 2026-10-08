// Library sources from libs/ are embedded as strings at build time (see esbuild.config.mjs).
declare module "libtext:*" {
	const source: string;
	export default source;
}
