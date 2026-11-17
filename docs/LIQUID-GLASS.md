# Liquid glass

Glass on the web app's floating surfaces, light enough for any device. Library: `src/lib/liquid-glass.js` (2.5 KB
minified and gzipped). Safe point before it: the git tag `pre-liquid-glass` (main as of 17 Nov 2026).

## 1. Why not liquidGL

The owner asked whether [liquidGL](https://github.com/naughtyduk/liquidGL) (v3.0.0, MIT) is fast enough for
low-end devices. It is not, as shipped (measured 17 Nov 2026, headless Chrome, a phone viewport 390×844 @2x, a
Garaj-like list of 300 cards, a glass tab bar and pill):

| | liquidGL (default) | CSS `backdrop-filter` | `liquid-glass.js` |
|---|---|---|---|
| Size (min + gzip) | ~46 KB | 0 | 2.5 KB |
| Weak GPU (SwiftShader): idle / scrolling | 29 / 35 fps | 60 / 60 fps | 60 / 60 fps |
| Weak GPU: dropped frames while scrolling | 6 | 0 | 0 |
| CPU 6× slower: start | 381 ms, long tasks up to 135 ms | 0 | 3 ms, none |
| CPU 6× slower: the page grows | ~200 ms each, dropped frames | none | none |
| Main thread at idle (fast CPU) | 55 ms/s | 10 ms/s | 13 ms/s |

Why: it rasterises the whole page into a texture with its own ~9,000-line renderer (again whenever the page's height
changes), runs two `requestAnimationFrame` loops that read layout every frame, redraws every frame with the specular
on, caps the snapshot at the GPU's texture size (a 29,000 px page came out at 28 % resolution), shows stale content
unless each changing element is registered, and has no low-power or reduced-motion fallback.

## 2. How `liquid-glass.js` works

- The pane is drawn by the compositor through `backdrop-filter`: it reads the live page behind it (video, animation,
  React updates), with no snapshot and no loop.
- The liquid edge (Chromium: Chrome, Edge, Android): an SVG `feDisplacementMap` whose map is a rounded rectangle with
  a squircle rim pulling the backdrop inward, so every read stays inside the pane (no seams). The map is at most
  128 px across, written as a BMP by hand (no canvas, no encoder, no GPU), when the browser is idle, cached per size.
- Safari, Firefox and every iPhone browser (no SVG filters in `backdrop-filter`): the same pane without the bending
  (blur, saturation, tint, rim, sheen).
- Fallbacks: no `backdrop-filter` → nothing changes (the element keeps its own look); any error → the plain pane or
  nothing; `prefers-reduced-transparency: reduce` → a solid pane.
- Optional colour fringe at the rim (`aberration: true`): three displacements, still compositor-only, measured at the
  same cost.
- Not included, by design: the moving specular, fluid touch and drag (each needs a per-frame loop).

## 3. Measuring it again

`scripts/glass-bench/`: `index.html` (the list page, `?mode=none|css|lite&n=300&ab=1`), `lab.html` (grid lines behind
a large pane, to see the bend), `run.mjs` (fresh Chrome per run: CPU throttling, idle and touch-scroll frame times,
main-thread time, the page growing; a weak GPU with SwiftShader). Usage is at the top of `run.mjs`.
