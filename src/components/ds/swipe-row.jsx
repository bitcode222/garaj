"use client";

import { useEffect, useRef, useState } from "react";
import { haptics } from "@/lib/haptics";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const ACTION_W = 84; // px per action button
const FULL_EXTRA = 72; // extra pull past the buttons that triggers the first action
const LOCK_PX = 10; // movement before the gesture picks horizontal or vertical
const PEEK_KEY = "garaj:swipe-hint";

// Only one row is open at a time. Module state lives behind these two functions
// so components never reassign it themselves.
let closeOpenRow = null;
const setOpenRow = (close) => {
	closeOpenRow = close;
};
const closeOthers = (self) => {
	if (closeOpenRow && closeOpenRow !== self) closeOpenRow();
};

/**
 * iOS-Mail style swipe actions for a list row. Touch only; mouse users keep the
 * row's own buttons. Actions: { key, label, icon: Icon, tone, onSelect }.
 *   leading  – revealed by swiping right; the first one also fires on a full swipe
 *   trailing – revealed by swiping left;  the first one is outermost and fires on a full swipe
 * The gesture waits for ~10 px of movement to decide: vertical means "scroll"
 * (hands over to the browser), horizontal means "swipe" (captures the pointer).
 * A swipe never counts as a tap, and tapping an open row only closes it.
 */
export function SwipeRow({ leading = [], trailing = [], peek = false, className, children }) {
	const [x, setX] = useState(0);
	const [dragging, setDragging] = useState(false);
	const root = useRef(null);
	const gesture = useRef(null);
	const swiped = useRef(false);
	const leadW = leading.length * ACTION_W;
	const trailW = trailing.length * ACTION_W;

	const close = () => setX(0);
	const open = (to) => {
		closeOthers(close);
		setOpenRow(to === 0 ? null : close);
		setX(to);
	};

	// Past the buttons the row resists (rubber band); a side without actions does not move.
	const limit = (raw) => {
		const max = leadW ? leadW + FULL_EXTRA : 0;
		const min = trailW ? -(trailW + FULL_EXTRA) : 0;
		if (raw > max) return max + (leadW ? (raw - max) * 0.2 : 0);
		if (raw < min) return min + (trailW ? (raw - min) * 0.2 : 0);
		return raw;
	};

	const run = (action) => {
		haptics.tap();
		open(0);
		action.onSelect();
	};

	const onPointerDown = (event) => {
		if (event.pointerType === "mouse" || (!leadW && !trailW)) return;
		gesture.current = { x: event.clientX, y: event.clientY, base: x, locked: null, crossed: false, time: event.timeStamp };
	};

	const onPointerMove = (event) => {
		const g = gesture.current;
		if (!g) return;
		const dx = event.clientX - g.x;
		const dy = event.clientY - g.y;
		if (!g.locked) {
			if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
			if (Math.abs(dx) > Math.abs(dy) * 1.3) {
				g.locked = "x";
				event.currentTarget.setPointerCapture?.(event.pointerId);
				closeOthers(close);
				setDragging(true);
			} else {
				gesture.current = null; // vertical: let the page scroll
				return;
			}
		}
		const next = limit(g.base + dx);
		g.pos = next;
		setX(next);
		const past = next >= leadW + FULL_EXTRA * 0.8 || next <= -(trailW + FULL_EXTRA * 0.8);
		if (past && !g.crossed) {
			g.crossed = true;
			haptics.thud();
		} else if (!past && g.crossed) {
			g.crossed = false;
		}
	};

	const finish = (event) => {
		const g = gesture.current;
		gesture.current = null;
		if (!g || g.locked !== "x") return;
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		setDragging(false);
		swiped.current = true;
		setTimeout(() => (swiped.current = false), 120);
		const at = g.pos ?? x;
		const flick = (at - g.base) / Math.max(1, event.timeStamp - g.time);
		if (event.type !== "pointercancel" && trailW && at <= -(trailW + FULL_EXTRA * 0.8)) return run(trailing[0]);
		if (event.type !== "pointercancel" && leadW && at >= leadW + FULL_EXTRA * 0.8) return run(leading[0]);
		if (trailW && (at < -trailW / 2 || (flick < -0.5 && at < -20))) return open(-trailW);
		if (leadW && (at > leadW / 2 || (flick > 0.5 && at > 20))) return open(leadW);
		open(0);
	};

	// An open row closes when anything else is touched or the page scrolls.
	useEffect(() => {
		if (x === 0) return;
		const away = (event) => {
			if (!root.current?.contains(event.target)) setX(0);
		};
		const scrolled = () => setX(0);
		document.addEventListener("pointerdown", away, true);
		window.addEventListener("scroll", scrolled, { passive: true });
		return () => {
			document.removeEventListener("pointerdown", away, true);
			window.removeEventListener("scroll", scrolled);
		};
	}, [x]);

	// First visit on a touch device: nudge the first row once to show it can be swiped.
	useEffect(() => {
		if (!peek || (!trailW && !leadW) || !window.matchMedia("(pointer: coarse)").matches) return;
		try {
			if (localStorage.getItem(PEEK_KEY)) return;
		} catch {
			return;
		}
		const sign = trailW ? -1 : 1;
		const timers = [
			setTimeout(() => setX(sign * 44), 1100),
			setTimeout(() => {
				setX(0);
				try {
					localStorage.setItem(PEEK_KEY, "1");
				} catch {
					// the hint just shows again next time
				}
			}, 1900),
		];
		return () => timers.forEach(clearTimeout);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const layer = (actions, side, width) => (
		<div
			className={cn("absolute inset-y-0 flex overflow-hidden", side === "left" ? "left-0" : "right-0 flex-row-reverse")}
			style={{ width, transition: dragging ? "none" : "width 280ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
			inert={width === 0 ? true : undefined}
			aria-hidden={width === 0}
		>
			{actions.map((action) => {
				const Icon = action.icon;
				return (
					<button
						key={action.key}
						type="button"
						onClick={() => run(action)}
						className={cn(
							"flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-white active:brightness-90",
							tone(action.tone).solid,
						)}
					>
						{Icon && <Icon className="size-5 shrink-0" aria-hidden />}
						<span className="max-w-full truncate">{action.label}</span>
					</button>
				);
			})}
		</div>
	);

	return (
		<div ref={root} className={cn("relative overflow-hidden", className)}>
			{leadW > 0 && layer(leading, "left", Math.max(x, 0))}
			{trailW > 0 && layer(trailing, "right", Math.max(-x, 0))}
			<div
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={finish}
				onPointerCancel={finish}
				onClickCapture={(event) => {
					if (swiped.current || x !== 0) {
						event.preventDefault();
						event.stopPropagation();
						if (!swiped.current) open(0);
					}
				}}
				// Opaque only while moved (to hide the actions); at rest it must not paint over the row dividers.
				className={cn("relative", (x !== 0 || dragging) && "bg-card")}
				style={{
					transform: x ? `translateX(${x}px)` : undefined,
					transition: dragging ? "none" : "transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)",
					touchAction: leadW || trailW ? "pan-y" : undefined,
				}}
			>
				{children}
			</div>
		</div>
	);
}
