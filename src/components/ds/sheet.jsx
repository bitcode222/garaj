"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeftIcon, ChevronLeftIcon, XIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** Position in the global sheet stack. A sheet above another reuses the scrim below it. */
export const SheetDepth = createContext(0);

const DISMISS_DISTANCE = 100; // px dragged right
const DISMISS_VELOCITY = 0.6; // px/ms, a quick flick
const LEAVE_MS = 180;

/**
 * Swipe-right-to-dismiss for the phone panel (the system edge-swipe back also
 * closes it, through the sheet's history entry). Spread the returned `handlers`
 * on the header (buttons inside keep working); `style` goes on the panel. Mouse
 * and md+ layouts are untouched.
 */
function useSwipeDismiss(open, onOpenChange) {
	const [dy, setDy] = useState(0);
	const [state, setState] = useState("idle"); // idle · dragging · settling · settled · leaving
	const start = useRef(null);
	const timer = useRef(0);

	// A re-opened sheet starts fresh (adjusting state during render, not in an effect).
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setDy(0);
			setState("idle");
		}
	}
	useEffect(() => () => clearTimeout(timer.current), []);

	const finish = (event) => {
		const gesture = start.current;
		start.current = null;
		if (!gesture || state !== "dragging") return;
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		const elapsed = Math.max(1, event.timeStamp - gesture.time);
		const flick = dy / elapsed > DISMISS_VELOCITY && dy > 30;
		if (event.type !== "pointercancel" && (dy > DISMISS_DISTANCE || flick)) {
			setState("leaving");
			setDy(window.innerWidth);
			timer.current = window.setTimeout(() => onOpenChange(false), LEAVE_MS);
		} else {
			setState(dy === 0 ? "settled" : "settling");
			setDy(0);
		}
	};

	const handlers = {
		onPointerDown(event) {
			if (event.pointerType === "mouse" || !window.matchMedia("(max-width: 767px)").matches) return;
			if (event.target.closest("button, a, input, select, textarea, [role=button]")) return;
			start.current = { x: event.clientX, time: event.timeStamp, crossed: false };
			event.currentTarget.setPointerCapture?.(event.pointerId);
			setState("dragging");
		},
		onPointerMove(event) {
			const gesture = start.current;
			if (!gesture) return;
			const delta = event.clientX - gesture.x;
			// Pulling left resists instead of moving the panel off its anchor.
			setDy(delta > 0 ? delta : delta / 8);
			if (delta > DISMISS_DISTANCE && !gesture.crossed) {
				gesture.crossed = true;
				haptics.thud();
			} else if (delta < DISMISS_DISTANCE && gesture.crossed) {
				gesture.crossed = false;
			}
		},
		onPointerUp: finish,
		onPointerCancel: finish,
	};

	// After the first drag the enter keyframes must stay off, or they would replay on snap-back.
	const style =
		state === "idle"
			? undefined
			: state === "settled"
				? { animation: "none" }
				: {
					transform: `translateX(${dy}px)`,
					transition: state === "dragging" ? "none" : state === "leaving" ? `transform ${LEAVE_MS}ms ease-in` : "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
					// The enter/exit keyframes would snap the panel back to 0 first.
					animation: "none",
				};

	return { handlers, style, onTransitionEnd: (event) => event.target === event.currentTarget && state === "settling" && setState("settled") };
}

/**
 * Create/edit surface: a bottom sheet on phones, a right-hand panel from md up.
 * Focus moves to the panel, not the first input, so the iOS keyboard does not
 * pop up before the user chooses a field.
 */
export function Sheet({ open, onOpenChange, title, description, headerActions, footer, size = "md", className, children }) {
	const contentRef = useRef(null);
	const depth = useContext(SheetDepth);
	const swipe = useSwipeDismiss(open, onOpenChange);
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				{depth === 0 && <DialogPrimitive.Overlay className="scrim" />}
				<DialogPrimitive.Content
					ref={contentRef}
					tabIndex={-1}
					style={swipe.style}
					onTransitionEnd={swipe.onTransitionEnd}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						contentRef.current?.focus();
					}}
					className={cn(
						"fixed z-50 flex flex-col bg-card text-card-foreground shadow-2xl outline-none",
						// Phone: a full-height screen that pushes in from the right, lifted above the keyboard.
						"inset-x-0 bottom-(--kb) h-(--vvh) max-h-dvh duration-300",
						"data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
						// md and up: a side panel.
						"md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-full md:border-l",
						size === "xl" ? "md:max-w-4xl" : size === "lg" ? "md:max-w-2xl" : "md:max-w-md",
						depth > 0 && "shadow-[0_0_0_1px_var(--border),-24px_0_48px_-12px_oklch(0_0_0/0.25)]",
						className,
					)}
				>
					<div className="shrink-0 touch-pan-y px-4 pt-[calc(0.5rem+var(--safe-top))] pb-3 md:px-6 md:pt-5" {...swipe.handlers}>
						{/* Top bar: back and the sheet's controls on the left, close (md+) on the right. */}
						<div className="-mx-2 flex min-h-11 items-center gap-0.5 md:min-h-9">
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className={cn(
									"flex h-11 items-center gap-0.5 rounded-md pr-3 pl-1.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent md:h-9 md:pl-2 md:text-sm md:gap-1",
									depth === 0 && "md:hidden",
								)}
								aria-label="Înapoi"
							>
								<ChevronLeftIcon className="size-6 md:hidden" />
								<ArrowLeftIcon className="size-4 max-md:hidden" />
								<span>Înapoi</span>
							</button>
							{headerActions}
							<DialogPrimitive.Close
								className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-md:hidden md:size-9"
								aria-label="Închide"
							>
								<XIcon className="size-4" />
							</DialogPrimitive.Close>
						</div>
						<div className="mt-1 min-w-0">
							<DialogPrimitive.Title className="text-heading">{title}</DialogPrimitive.Title>
							<DialogPrimitive.Description className={description ? "mt-0.5 text-sm text-muted-foreground" : "sr-only"}>
								{description ?? title}
							</DialogPrimitive.Description>
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-6"><SheetDepth.Provider value={depth + 1}>{children}</SheetDepth.Provider></div>
					{footer && (
						<div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] md:px-6 md:pb-5 [&>*]:max-md:flex-1">
							{footer}
						</div>
					)}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
