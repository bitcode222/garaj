"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** Position in the global sheet stack. A sheet above another reuses the scrim below it. */
export const SheetDepth = createContext(0);

const DISMISS_DISTANCE = 110; // px dragged down
const DISMISS_VELOCITY = 0.6; // px/ms, a quick flick
const LEAVE_MS = 180;

/**
 * Swipe-down-to-dismiss for the phone bottom sheet. Spread the returned `handlers`
 * on the grabber and header (buttons inside them keep working); `style` goes on
 * the panel. Mouse and md+ layouts are untouched: the panel is a side drawer there.
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
		const elapsed = Math.max(1, performance.now() - gesture.time);
		const flick = dy / elapsed > DISMISS_VELOCITY && dy > 30;
		if (event.type !== "pointercancel" && (dy > DISMISS_DISTANCE || flick)) {
			setState("leaving");
			setDy(window.innerHeight);
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
			start.current = { y: event.clientY, time: performance.now(), crossed: false };
			event.currentTarget.setPointerCapture?.(event.pointerId);
			setState("dragging");
		},
		onPointerMove(event) {
			const gesture = start.current;
			if (!gesture) return;
			const delta = event.clientY - gesture.y;
			// Pulling up resists instead of moving the sheet off its anchor.
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
					transform: `translateY(${dy}px)`,
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
						"inset-x-0 bottom-(--kb) max-h-[min(92dvh,calc(var(--vvh)-var(--safe-top)-0.5rem))] border-t duration-300",
						"max-md:data-[state=closed]:animate-out max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:animate-in max-md:data-[state=open]:slide-in-from-bottom",
						"md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-full md:border-t-0 md:border-l",
						"md:data-[state=closed]:animate-out md:data-[state=closed]:slide-out-to-right md:data-[state=open]:animate-in md:data-[state=open]:slide-in-from-right",
						size === "xl" ? "md:max-w-4xl" : size === "lg" ? "md:max-w-2xl" : "md:max-w-md",
						depth > 0 && "shadow-[0_0_0_1px_var(--border),-24px_0_48px_-12px_oklch(0_0_0/0.25)]",
						className,
					)}
				>
					<div className="flex shrink-0 touch-none justify-center pt-2 pb-1 md:hidden" aria-hidden {...swipe.handlers}>
						<div className="h-1 w-10 rounded-full bg-border" />
					</div>
					<div className="shrink-0 touch-pan-x px-4 pt-1 pb-3 md:px-6 md:pt-5" {...swipe.handlers}>
						{/* Top bar: back (when stacked) and the sheet's controls on the left, close on the right. */}
						<div className="-mx-2 flex min-h-10 items-center gap-0.5 md:min-h-9">
							{depth > 0 && (
								<button
									type="button"
									onClick={() => onOpenChange(false)}
									className="flex h-10 items-center gap-1 rounded-md pr-3 pl-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-9"
									aria-label="Înapoi"
								>
									<ArrowLeftIcon className="size-4" /> Înapoi
								</button>
							)}
							{headerActions}
							<DialogPrimitive.Close
								className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
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
