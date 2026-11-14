// Node resolve hook: "@/x" → src/x(.js), so scripts can import app modules (used by ios-fixtures.mjs).
const SRC = new URL("../src/", import.meta.url);
export async function resolve(spec, ctx, next) {
	if (spec.startsWith("@/")) spec = new URL(spec.slice(2), SRC).href;
	try {
		return await next(spec, ctx);
	} catch (error) {
		if (!spec.endsWith(".js") && (spec.startsWith("file:") || spec.startsWith("."))) return next(`${spec}.js`, ctx);
		throw error;
	}
}
