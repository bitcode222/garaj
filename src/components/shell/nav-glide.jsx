"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useGlass } from "@/components/ds/glass";

// The selected route's pane of liquid glass (docs/LIQUID-GLASS.md). One pane for the whole list: it lies over the rows,
// so what it passes bends at its rim, and it moves on a spring that keeps its speed when a new route is picked mid-way.
const RESPONSE = 0.36; // seconds
const DAMPING = 0.88;
const STIFFNESS = (2 * Math.PI / RESPONSE) ** 2;
const FRICTION = 2 * DAMPING * (2 * Math.PI / RESPONSE);

/** Goes inside the positioned list. `target`: the `data-nav-row` of the row to sit on (none: the pane fades away). */
export function NavGlide({ target }) {
	const pane = useRef(null);
	const glass = useGlass("nav", { outer: pane });
	const motion = useRef({ x: 0, y: 0, to: 0, speed: 0, frame: 0, time: 0, shown: false });

	useLayoutEffect(() => {
		const el = pane.current;
		const list = el?.parentElement;
		if (!el || !list) return;
		const m = motion.current;
		const paint = () => {
			const stretch = Math.min(0.22, Math.abs(m.speed) / 5000);
			el.style.transform = `translate3d(${m.x}px, ${m.y}px, 0) scale(${1 - stretch / 4}, ${1 + stretch})`;
		};
		const tick = (time) => {
			const dt = Math.min(1 / 30, (time - m.time) / 1000 || 1 / 60);
			m.time = time;
			for (let i = 0; i < 4; i++) {
				m.speed += (-STIFFNESS * (m.y - m.to) - FRICTION * m.speed) * (dt / 4);
				m.y += m.speed * (dt / 4);
			}
			if (Math.abs(m.y - m.to) < 0.2 && Math.abs(m.speed) < 4) {
				m.y = m.to;
				m.speed = 0;
				m.frame = 0;
				paint();
				return;
			}
			paint();
			m.frame = requestAnimationFrame(tick);
		};
		const place = (jump) => {
			const row = [...list.querySelectorAll("[data-nav-row]")].find((node) => node.dataset.navRow === target);
			if (!row || !list.offsetWidth) {
				cancelAnimationFrame(m.frame);
				m.frame = 0;
				m.speed = 0;
				m.shown = false;
				el.style.opacity = "0";
				return;
			}
			const box = list.getBoundingClientRect();
			const rect = row.getBoundingClientRect();
			m.x = rect.left - box.left;
			m.to = rect.top - box.top;
			el.style.width = `${rect.width}px`;
			el.style.height = `${rect.height}px`;
			el.style.opacity = "1";
			if (jump || !m.shown || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
				cancelAnimationFrame(m.frame);
				m.frame = 0;
				m.y = m.to;
				m.speed = 0;
				paint();
			} else if (!m.frame) {
				m.time = performance.now();
				m.frame = requestAnimationFrame(tick);
			}
			m.shown = true;
		};
		place(false);
		// The list changing size (the sidebar shown again, the font arriving): straight to its place.
		let first = true;
		const sizes = new ResizeObserver(() => {
			// Its first report only repeats the size just measured, unless the list was still hidden then.
			if (!first || !m.shown) place(true);
			first = false;
		});
		sizes.observe(list);
		return () => sizes.disconnect();
	}, [target]);

	useEffect(() => {
		const m = motion.current;
		return () => {
			cancelAnimationFrame(m.frame);
			m.frame = 0;
		};
	}, []);

	return <span ref={glass} aria-hidden className="pointer-events-none absolute top-0 left-0 z-10 rounded-[8px] bg-foreground/[0.07] opacity-0 transition-opacity duration-150 will-change-transform [--lg-shadow:0_1px_3px_rgb(0_0_0/0.16)] motion-reduce:transition-none" />;
}
