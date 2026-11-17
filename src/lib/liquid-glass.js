/*
 * Liquid glass the browser's compositor draws (docs/LIQUID-GLASS.md).
 *
 * No snapshot of the page, no WebGL, no animation loop: a pane reads the live backdrop through `backdrop-filter`.
 * On Chromium its rim bends the backdrop through an SVG displacement map (a few thousand pixels, written as a BMP
 * by hand when the browser is idle, cached per size); elsewhere it is the same pane without the bending (blur,
 * saturation, tint, rim, sheen). JavaScript runs only when a pane is made or changes size.
 *
 * Safe by construction: a browser without `backdrop-filter` gets nothing (the element keeps its own look), any
 * error leaves the element as it was, and "reduce transparency" turns the pane solid.
 *
 *   const off = liquidGlass(el, { strength: 40, frost: 1, tint: "rgba(255,255,255,0.1)" });
 *   off(); // removes everything it added
 */

const NS = "http://www.w3.org/2000/svg";
let defs = null;
let seq = 0;
const maps = new Map(); // size key → { id, refs, ready, el, url }
const panes = new Map(); // element → state

const isChromium = () => {
	const brands = navigator.userAgentData?.brands;
	if (brands) return brands.some((b) => b.brand === "Chromium");
	return /Chrome\/\d/.test(navigator.userAgent); // iOS browsers say CriOS/FxiOS: WebKit, no refraction
};

/** Whether this browser can draw the glass at all (blur behind an element). */
export const glassSupported = () =>
	typeof window !== "undefined" && typeof CSS !== "undefined" && (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));

function svgDefs() {
	if (defs?.isConnected) return defs;
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("width", "0");
	svg.setAttribute("height", "0");
	svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
	defs = document.createElementNS(NS, "defs");
	svg.appendChild(defs);
	document.body.appendChild(svg);
	return defs;
}

// The rim's pull for t = 0 (the edge) … 1 (where the flat middle begins), from a squircle rim of height
// (1 - (1 - t)^4)^(1/4): its slope is steep at the edge and 0 where it meets the flat. Computed once.
const RIM = new Float32Array(257);
for (let k = 0; k <= 256; k++) {
	const u = 1 - k / 256;
	RIM[k] = k >= 256 ? 0 : Math.min(1, (0.35 * u ** 3) / Math.max(1e-4, 1 - u ** 4) ** 0.75);
}
const idle = (fn) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 200 }) : setTimeout(fn, 1));

/**
 * The displacement map of a rounded rectangle w×h (css px), corner radius r: flat in the middle, and in a band `bevel`
 * px wide along the edge a convex rim whose slope pulls the backdrop inward (R = x, G = y, 128 = still). Pulling
 * inward keeps every read inside the pane, so the edge never shows a seam. A 24-bit BMP written by hand, at most
 * 128 px across (the filter stretches it, the field is smooth): no canvas, no encoder, no GPU.
 */
function mapURL(w, h, r, bevel) {
	const s = Math.min(1, 128 / Math.max(w, h));
	const W = Math.max(2, Math.round(w * s));
	const H = Math.max(2, Math.round(h * s));
	const row = (W * 3 + 3) & ~3;
	const bytes = new Uint8Array(54 + row * H);
	const v = new DataView(bytes.buffer);
	bytes[0] = 0x42; // "BM"
	bytes[1] = 0x4d;
	v.setUint32(2, bytes.length, true);
	v.setUint32(10, 54, true);
	v.setUint32(14, 40, true);
	v.setInt32(18, W, true);
	v.setInt32(22, -H, true); // rows top to bottom
	v.setUint16(26, 1, true);
	v.setUint16(28, 24, true);
	v.setUint32(34, row * H, true);
	const hx = w / 2;
	const hy = h / 2;
	const rr = Math.min(r, hx, hy);
	for (let j = 0; j < H; j++) {
		for (let i = 0; i < W; i++) {
			const px = ((i + 0.5) / W) * w - hx;
			const py = ((j + 0.5) / H) * h - hy;
			const qx = Math.abs(px) - (hx - rr);
			const qy = Math.abs(py) - (hy - rr);
			const ox = Math.max(qx, 0);
			const oy = Math.max(qy, 0);
			const outside = Math.hypot(ox, oy);
			const sdf = outside + Math.min(Math.max(qx, qy), 0) - rr; // < 0 inside
			let nx = 0;
			let ny = 0;
			if (qx > 0 && qy > 0) {
				nx = (ox / outside) * Math.sign(px);
				ny = (oy / outside) * Math.sign(py);
			} else if (qx > qy) nx = Math.sign(px);
			else ny = Math.sign(py);
			const t = Math.min(1, Math.max(0, -sdf / bevel));
			const m = RIM[(t * 256) | 0];
			const k = 54 + j * row + i * 3; // B, G, R
			bytes[k] = 128;
			bytes[k + 1] = 128 - ny * m * 127;
			bytes[k + 2] = 128 - nx * m * 127;
		}
	}
	return URL.createObjectURL(new Blob([bytes], { type: "image/bmp" }));
}

function filterFor(w, h, r, bevel, strength, aberration) {
	const key = `${w}x${h}x${r}x${bevel}x${strength}x${aberration ? 1 : 0}`;
	const hit = maps.get(key);
	if (hit) {
		hit.refs++;
		return hit;
	}
	const id = `lg-${++seq}`;
	const url = mapURL(w, h, r, bevel);
	const f = document.createElementNS(NS, "filter");
	f.setAttribute("id", id);
	f.setAttribute("color-interpolation-filters", "sRGB");
	const img = `<feImage href="${url}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>`;
	const shift = (scale, out) => `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="${out}"/>`;
	f.innerHTML = aberration
		? img +
			shift(strength * 1.08, "r") +
			shift(strength, "g") +
			shift(strength * 0.92, "b") +
			`<feColorMatrix in="r" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r1"/>` +
			`<feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g1"/>` +
			`<feColorMatrix in="b" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b1"/>` +
			`<feBlend in="r1" in2="g1" mode="screen" result="rg"/><feBlend in="rg" in2="b1" mode="screen"/>`
		: img + shift(strength, "out");
	svgDefs().appendChild(f);
	const entry = { id, key, el: f, url, refs: 1 };
	maps.set(key, entry);
	return entry;
}
function release(entry) {
	if (!entry || --entry.refs > 0) return;
	entry.el.remove();
	URL.revokeObjectURL(entry.url);
	maps.delete(entry.key);
}

let sizes = null; // one ResizeObserver for every pane
function watch(el) {
	sizes ||= new ResizeObserver((list) => {
		for (const e of list) {
			const pane = panes.get(e.target);
			if (pane) idle(() => pane.layout());
		}
	});
	sizes.observe(el);
}

const STYLE_ID = "liquid-glass-style";
function injectStyle() {
	if (document.getElementById(STYLE_ID)) return;
	const s = document.createElement("style");
	s.id = STYLE_ID;
	// Unlayered, so it wins over the utilities the element had (its opaque background, its shadow). The rim and the
	// sheen are painted once and kept by the compositor; nothing here animates. Colours follow --lg-* when set.
	s.textContent = `
.lg-pane{isolation:isolate;background-color:var(--lg-tint)!important;
  box-shadow:inset 0 1px 0 var(--lg-rim,rgba(255,255,255,.55)),inset 0 -1px 0 var(--lg-rim-low,rgba(255,255,255,.18)),inset 0 0 0 1px var(--lg-edge,rgba(255,255,255,.22)),var(--lg-shadow,0 10px 28px -12px rgba(0,0,0,.35))!important}
.lg-pane::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(120% 70% at 30% 0%,var(--lg-sheen,rgba(255,255,255,.28)),transparent 60%),linear-gradient(180deg,rgba(255,255,255,.06),transparent 40%,rgba(0,0,0,.04))}
@media (prefers-reduced-transparency: reduce){.lg-pane{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background-color:var(--lg-solid)!important}.lg-pane::before{display:none}}`;
	document.head.appendChild(s);
}

/**
 * Make `el` a pane of liquid glass; returns the function that undoes it. Options (all optional):
 * strength  px the rim bends the backdrop (40) · bevel  px width of the rim (auto: 70 % of the radius, ≥ 12)
 * frost  px of blur (1) · saturate  (1.6) · tint  CSS colour over the glass ("rgba(255,255,255,0.10)")
 * solid  colour when transparency is reduced ("rgba(245,245,247,0.96)") · aberration  colour fringe at the rim (false)
 * refract  false: the pane without the bending, everywhere.
 */
export function liquidGlass(el, options = {}) {
	if (!el || !glassSupported()) return () => {};
	panes.get(el)?.destroy();
	const o = { strength: 40, frost: 1, saturate: 1.6, tint: "rgba(255,255,255,0.10)", solid: "rgba(245,245,247,0.96)", aberration: false, refract: true, ...options };
	const touched = [];
	const set = (name, value) => {
		if (!touched.includes(name)) touched.push(name);
		el.style.setProperty(name, value);
	};
	let entry = null;
	let last = "";
	let refract = false;
	const plain = `blur(${o.frost}px) saturate(${o.saturate})`;
	const state = {
		layout() {
			if (!refract || panes.get(el) !== state || !el.isConnected) return;
			try {
				const w = Math.round(el.offsetWidth);
				const h = Math.round(el.offsetHeight);
				if (!w || !h) return;
				const r = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
				const bevel = Math.round(o.bevel ?? Math.max(12, Math.min(r * 0.7 + 6, Math.min(w, h) / 2)));
				const key = `${w}x${h}x${r}x${bevel}`;
				if (key === last) return;
				last = key;
				const next = filterFor(w, h, r, bevel, o.strength, o.aberration);
				set("backdrop-filter", `url(#${next.id}) ${plain}`);
				release(entry);
				entry = next;
			} catch {
				refract = false; // keep the plain pane
				set("backdrop-filter", plain);
			}
		},
		destroy() {
			sizes?.unobserve(el);
			release(entry);
			entry = null;
			panes.delete(el);
			el.classList.remove("lg-pane");
			for (const name of touched) el.style.removeProperty(name);
		},
	};
	try {
		injectStyle();
		el.classList.add("lg-pane");
		if (getComputedStyle(el).position === "static") set("position", "relative"); // for the sheen
		set("--lg-tint", o.tint);
		set("--lg-solid", o.solid);
		set("-webkit-backdrop-filter", plain);
		set("backdrop-filter", plain);
		panes.set(el, state);
		refract = o.refract && isChromium();
		if (refract) {
			idle(() => state.layout()); // never in the way of the first paint
			watch(el);
		}
	} catch {
		state.destroy();
		return () => {};
	}
	return () => state.destroy();
}
