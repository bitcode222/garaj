// Car make logos for the native iPhone app: one template SVG image set per make, from the same
// CC0 simple-icons paths the web app uses (src/lib/car-logo-paths.js).
//   node scripts/ios-logos.mjs
import { register } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

register(new URL("./alias-loader.mjs", import.meta.url));
const { LOGO_PATHS } = await import("../src/lib/car-logo-paths.js");

const dir = new URL("../ios-native/Garaj/Resources/Assets.xcassets/Makes/", import.meta.url);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(new URL("Contents.json", dir), JSON.stringify({ info: { author: "xcode", version: 1 }, properties: { "provides-namespace": true } }, null, 2));
for (const [key, d] of Object.entries(LOGO_PATHS)) {
	const set = new URL(`${key}.imageset/`, dir);
	mkdirSync(set, { recursive: true });
	writeFileSync(new URL(`${key}.svg`, set), `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${d}"/></svg>\n`);
	writeFileSync(new URL("Contents.json", set), JSON.stringify({
		images: [{ filename: `${key}.svg`, idiom: "universal" }],
		info: { author: "xcode", version: 1 },
		properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" },
	}, null, 2));
}
console.log(`${Object.keys(LOGO_PATHS).length} make logos written`);
