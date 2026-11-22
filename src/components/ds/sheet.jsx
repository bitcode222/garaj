"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeftIcon, ChevronLeftIcon, Maximize2, XIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { MakeTile } from "@/components/ds/car";
import { Glass } from "@/components/ds/glass";
import { MakeLogo } from "@/components/ds/make-logo";
import { TONE_COLOR, makeCover, makeInk } from "@/lib/colors";
import { formatPlate } from "@/domain/vehicle";
import { KindMark, StateTag, kindText } from "@/components/ds/tone";
import { haptics } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Position in the global sheet stack. A sheet above another reuses the scrim below it. */
export const SheetDepth = createContext(0);

/**
 * A sheet reached by walking a visit's records (docs/VISIT-FLOW.md D4): the side it comes in
 * from ("forward" = from the right, "back" = from the left), the side it leaves to when the
 * next record replaces it, and `back()` to walk back along the way it came.
 */
export const SheetMotion = createContext({ enter: null, leave: null, back: null });

// Walking slides a short way and fades: the two records swap in place, the panel does not fly in from the edge.
const ENTER = {
	forward: "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-12",
	back: "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-12",
};
const LEAVE = {
	forward: "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-left-12",
	back: "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-12",
};

// The top bar's round buttons; without glass they keep this faint fill.
const SHEET_GLASS = "inline-flex shrink-0 items-center justify-center rounded-full bg-foreground/[0.07] text-foreground transition-transform active:scale-[0.97]";

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
 * Ref callback for the sheet's scroller. Radix's scroll lock (react-remove-scroll)
 * preventDefaults wheel/touchmove at a scroller's edges, which kills the native
 * rubber-band. Events that start inside the scroller never reach its document
 * listener; the page behind stays put through `overscroll-contain` and the overlay.
 */
function bounceThroughScrollLock(el) {
	if (!el) return;
	const stop = (event) => event.stopPropagation();
	el.addEventListener("wheel", stop, { passive: true });
	el.addEventListener("touchmove", stop, { passive: true });
	return () => {
		el.removeEventListener("wheel", stop);
		el.removeEventListener("touchmove", stop);
	};
}

/**
 * Create/edit surface: a bottom sheet on phones, a right-hand panel from md up.
 * Focus moves to the panel, not the first input, so the iOS keyboard does not
 * pop up before the user chooses a field. A record's sheet passes its `kind` (the title in its colour, after its
 * KindMark) and its `state` (a StateTag beside the title), docs/RECORD-COLORS.md.
 */
/**
 * A side panel (a full screen on a phone). A record of a visit passes its `bar` (the visit bar, docs/VISIT-BAR.md) and
 * its car's `make`: the bar opens the header, the title is the car with the record's number, after the maker's logo,
 * in the text colour, and the state is a pill at the right (the sheet look the owner picked, 7 Nov 2026). Without a
 * bar, `kind` and `state` colour and mark the title as before.
 */
export function Sheet({ open, onOpenChange, title, description, headerActions, onFullPage, kind, state, bar, make, tint, cover, outlined = false, centered = false, footer, footerClassName, className, children }) {
	// A sheet about one car takes its colour (docs/DESIGN.md §1): its head is washed with the car's cover colour, fading
	// into the sheet, and its logo sits on a tile of that colour. `tint` names the car for sheets without a visit bar.
	const car = tint ?? (bar ? make : null);
	// Sheets "A" (the owner's picks, 16–20 Nov 2026): the head is in the car's colour, as its card; the body is white with
	// grey groups under big titles (rounds 5 and 6, "S2 Alb" and "T5 Titluri mari").
	// `outlined` (a booking, owner 21 Nov 2026): no colour on the head, only a dashed edge that fades out.
	const carClass = car && !outlined ? (makeInk(car) === "#ffffff" ? "car-sheet-dark" : "car-sheet-light") : null;
	const contentRef = useRef(null);
	const depth = useContext(SheetDepth);
	const motion = useContext(SheetMotion);
	const walked = Boolean(motion.enter || motion.leave);
	const swipe = useSwipeDismiss(open, onOpenChange);
	// From tablet up a car's top bar sits above its colour, on the sheet; on a phone it stays on the colour and takes its ink.
	const wide = useMediaQuery("(min-width: 48rem)");
	const barOnColor = Boolean(carClass) && !wide;
	const glassPreset = barOnColor ? "clear" : "pill";
	// The head: back, the sheet's controls and close, then the title (a car's: CarHead).
	const head = (
					<div
						className={cn("shrink-0 touch-pan-y", car ? "relative isolate px-5 pt-[calc(1.25rem+var(--safe-top))] pb-20 md:px-[60px] md:pt-[116px]" : "px-10 pt-[calc(3.5rem+var(--safe-top))] pb-10 md:px-10 md:pt-14", centered && "md:pb-6")}
						{...swipe.handlers}
					>
						{/* The car's colour fades into the sheet below the head's content, which stays on the solid part. */}
						{car && <span aria-hidden className={cn("sheet-head-fade", outlined && "sheet-head-dashed")} style={outlined ? undefined : { background: makeCover(car) }} />}
						{/* Top bar: back and the sheet's controls on the left; "Toate detaliile" and close (md+), round liquid glass, on the right. */}
						<div className={cn("-mx-2 flex min-h-11 items-center gap-0.5 md:min-h-10", car && "md:absolute md:inset-x-9 md:top-5 md:mx-0", barOnColor && carClass)} style={barOnColor ? { color: makeInk(car) } : undefined}>
							<button
								type="button"
								// Reached by walking a visit, Back walks back the way it came; otherwise it closes.
								onClick={() => (motion.back ? motion.back() : onOpenChange(false))}
								className={cn(
									"flex h-11 items-center gap-0.5 rounded-md pr-3 pl-1.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent md:h-9 md:pl-2 md:text-sm md:gap-1",
									depth === 0 && !motion.back && "md:hidden",
								)}
								aria-label="Înapoi"
							>
								<ChevronLeftIcon className="size-6 md:hidden" />
								<ArrowLeftIcon className="size-4 max-md:hidden" />
								<span>Înapoi</span>
							</button>
							{headerActions}
							<div className="ml-auto flex shrink-0 items-center gap-2">
								{onFullPage && (
									<Glass as="button" preset={glassPreset} type="button" onClick={onFullPage} className={cn(SHEET_GLASS, "h-11 gap-2 px-4 text-[13.5px] font-medium md:h-10")}>
										<Maximize2 className="size-4" aria-hidden />
										Toate detaliile
									</Glass>
								)}
								<Glass as={DialogPrimitive.Close} preset={glassPreset} className={cn(SHEET_GLASS, "size-10 max-md:hidden")} aria-label="Închide">
									<XIcon className="size-4" />
								</Glass>
							</div>
						</div>
						{car ? (
							<CarHead className={carClass} style={outlined ? undefined : { color: makeInk(car) }} car={car} cover={cover} outlined={outlined} title={title} description={description} state={state} footer={footer} />
						) : (
						<div className="mt-1 min-w-0">
							{bar && <div className="-mx-1 mt-2 mb-4">{bar}</div>}
							{bar ? (
								<div className="flex min-w-0 items-start gap-2.5">
									<MakeTile make={make} size={28} className="mt-px" />
									<DialogPrimitive.Title className="min-w-0 flex-1 text-heading break-words text-foreground">{title}</DialogPrimitive.Title>
									{state && (
										<span className="mt-px flex shrink-0 items-center rounded-full border bg-card px-2.5 py-1">
											<StateTag state={state} size="sm" />
										</span>
									)}
								</div>
							) : (
								<div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
									{tint ? <MakeTile make={tint} size={28} /> : kind && <KindMark kind={kind} size="sm" />}
									<DialogPrimitive.Title className={cn("text-heading", kind && kindText(kind))}>{title}</DialogPrimitive.Title>
									{state && <StateTag state={state} size="md" />}
								</div>
							)}
							<DialogPrimitive.Description className={description ? "mt-0.5 text-sm text-muted-foreground" : "sr-only"}>
								{description ?? title}
							</DialogPrimitive.Description>
						</div>
						)}
					</div>
	);
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				{/* Radix mounts its scroll lock in the Overlay, so stacked sheets need one too (unblurred) or they cannot scroll. */}
					{/* Walking keeps one scrim: the arriving record's shows at once, the leaving one's goes at once. */}
					<DialogPrimitive.Overlay className={cn("scrim", depth === 0 && "sheet-blur", motion.enter && "data-[state=open]:animate-none", motion.leave && "data-[state=closed]:hidden")} />
				<DialogPrimitive.Content
					ref={contentRef}
					tabIndex={-1}
					style={swipe.style}
					onTransitionEnd={swipe.onTransitionEnd}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						contentRef.current?.focus();
					}}
					// A record left by walking must not pull the focus back to the page behind the next one.
					onCloseAutoFocus={(event) => motion.leave && event.preventDefault()}
					// Pressing a toast (its "Anulează") is not a click outside the sheet: the sheet stays open.
					onPointerDownOutside={(event) => event.target?.closest?.("[data-sonner-toaster]") && event.preventDefault()}
					onInteractOutside={(event) => event.target?.closest?.("[data-sonner-toaster]") && event.preventDefault()}
					className={cn(
						car && "sheet-a",
						"fixed z-50 flex flex-col bg-card text-card-foreground shadow-[0_0_48px_0_oklch(0_0_0/0.06)] outline-none dark:shadow-[0_0_48px_0_rgb(0_0_0/0.35)]",
						// Phone: a full-height screen that pushes in from the right, lifted above the keyboard.
						"inset-x-0 bottom-(--kb) h-(--vvh) max-h-dvh duration-300",
						walked
							? cn(motion.enter ? ENTER[motion.enter] : "data-[state=open]:animate-in data-[state=open]:slide-in-from-right", motion.leave ? LEAVE[motion.leave] : "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right")
							: "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
						// md and up: a side panel.
						"md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-full md:border-l dark:border-white/[0.06]",
						// A car's sheet is 40 rem (640 px) wide (owner, 21 Nov 2026); other sheets 42 rem.
						car ? "md:max-w-[40rem]" : "md:max-w-2xl",
						// Centred (Recepție in Atelier "Etape", docs/DESIGN.md §4): a card in the middle of the window, md and up.
						centered &&
							"md:inset-auto md:top-[5vh] md:left-1/2 md:h-auto md:max-h-[90dvh] md:-translate-x-1/2 md:overflow-hidden md:rounded-2xl md:border md:[--tw-enter-translate-x:0] md:[--tw-exit-translate-x:0] md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95",
						depth > 0 && "shadow-[0_0_0_1px_var(--border),-16px_0_40px_-12px_oklch(0_0_0/0.06)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.06),-16px_0_40px_-12px_oklch(0_0_0/0.15)]",
						className,
					)}
				>
					{!car && head}
					<div ref={bounceThroughScrollLock} className="min-h-0 flex-1 overflow-y-scroll overscroll-contain">
						{/* A car's head scrolls away with its body (owner, 20 Nov 2026); other sheets keep theirs fixed. */}
						{car && head}
						{/* 1px taller than the viewport: short content still scrolls, so WebKit rubber-bands it. */}
						<div className={cn("min-h-[calc(100%+1px)]", car ? "sheet-a-body px-4 pt-2 pb-10 md:px-[60px] md:pb-[76px]" : "px-10 pb-10")}>
							<SheetDepth.Provider value={depth + 1}>{children}</SheetDepth.Provider>
						</div>
					</div>
					{footer && !car && (
						<div className={cn("flex shrink-0 flex-wrap justify-end gap-2 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] md:px-6 md:pb-5 [&>*]:max-md:flex-1", footerClassName)}>
							{footer}
						</div>
					)}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

/**
 * The head of a car's sheet (sheet "A", the owner's pick, 19 Nov 2026), as its card: on the car's colour, the bare logo
 * at the left, beside it the state and number, the title, the plate and car, and the people;
 * under them the main button and the round ones (`footer`). No visit bar: the record's "…" reaches the others (20 Nov 2026).
 */
function CarHead({ className, style, car, cover, outlined, title, description, state, footer }) {
	const lines = (cover?.lines ?? []).filter(Boolean);
	return (
		<div className={cn("mt-2 min-w-0", className)} style={style}>
			{/* By importance: where the job stands, what it is, which car (the plate first, as the shop calls it), then who. The number is reference only. */}
			<div className="flex min-w-0 items-center gap-5 md:gap-8">
				<MakeLogo make={car} className="ml-1 size-16 shrink-0 text-2xl text-foreground md:ml-3 md:size-20" />
				<div className="flex min-w-0 flex-1 flex-col">
					{(state || cover?.code) && (
						<div className="mb-2 flex min-w-0 items-center gap-2">
							{state && (
								<span className={cn("inline-flex items-center gap-1.5 rounded-[6px] px-2 py-0.5 text-xs font-medium", outlined ? "bg-foreground/[0.07] text-foreground" : "bg-black/25 text-white")}>
									<span className="size-1.5 rounded-full" style={{ background: TONE_COLOR[state.tone] ?? TONE_COLOR.neutral }} aria-hidden />
									{state.text}
								</span>
							)}
							{cover?.code && <span translate="no" className="ml-auto text-xs font-medium tracking-[0.04em] whitespace-nowrap tabular-nums opacity-70">{cover.code}</span>}
						</div>
					)}
					<DialogPrimitive.Title className="text-2xl leading-tight font-bold tracking-tight break-words">{title}</DialogPrimitive.Title>
					{cover?.car && (
						<p className="mt-1.5 truncate text-[15px] font-medium">
							{cover.plate && <span translate="no" className="font-bold whitespace-nowrap uppercase">{formatPlate(cover.plate)}</span>}
							{cover.plate && <span className="opacity-60"> · </span>}
							{cover.car}
						</p>
					)}
					{lines.length > 0 && <p className="mt-0.5 truncate text-[13.5px] opacity-75">{lines.join(" · ")}</p>}
					<DialogPrimitive.Description className={description ? "mt-0.5 text-[13.5px] opacity-75" : "sr-only"}>{description ?? title}</DialogPrimitive.Description>
				</div>
			</div>
			{footer && <div data-sheet-actions className="mt-6 flex flex-wrap items-center gap-2 [&>:first-child]:flex-1 [&>:first-child]:justify-center [&_p]:basis-full [&_p]:text-xs">{footer}</div>}
		</div>
	);
}
