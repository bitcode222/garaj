import { useGlass } from "@/components/ds/glass";
import { MakeLogo } from "@/components/ds/make-logo";
import { Plate } from "@/components/ds/plate";
import { formatPlate } from "@/domain/vehicle";
import { makeColor, makeCover, makeInk } from "@/lib/colors";
import { cn } from "@/lib/utils";

// The car's colour (docs/DESIGN.md §1, rule 1): a job, a car and their pages take the make's colour, the way a
// podcast takes its artwork's. These are the pieces that carry it.

/** The art behind a logo: the make's colour glowing from the top right into the deepened cover. */
export function makeArt(make) {
	return `radial-gradient(circle at 100% 0, ${makeColor(make)}, color-mix(in srgb, ${makeCover(make)} 75%, #000) 80%)`;
}

/** A square of the make's colour with its logo, for list rows and cards. */
export function MakeTile({ make, size = 40, className }) {
	return (
		<span
			aria-hidden
			className={cn("inline-flex shrink-0 items-center justify-center", className)}
			style={{ width: size, height: size, borderRadius: size * 0.26, background: `linear-gradient(135deg, ${makeColor(make)}, ${makeCover(make)})`, color: makeInk(make) }}
		>
			<MakeLogo make={make} className="text-current" style={{ width: size * 0.56, height: size * 0.56 }} />
		</span>
	);
}

/** The make's logo large, on its art, for a page's header. */
export function MakeArt({ make, size = 120, className }) {
	return (
		<span
			aria-hidden
			className={cn("inline-flex shrink-0 items-center justify-center", className)}
			style={{ width: size, height: size, borderRadius: size * 0.22, background: makeArt(make), color: makeInk(make) }}
		>
			<MakeLogo make={make} className="text-current" style={{ width: size * 0.52, height: size * 0.52 }} />
		</span>
	);
}

/**
 * A record as a cover: the car's colour, its logo and plate, a short status, what it is about, and one button for the
 * next step (white on the colour). `menu` is the round "…" beside it.
 */
/** `statusColor` paints the status label in a state's colour (a booking still to accept: STATE.wait); grey glass otherwise. */
/** The dashboard carousels' covers: 280 wide, a third taller than wide (4:3). */
export const COVER_WIDTH = 280;
export const COVER_HEIGHT = Math.round((COVER_WIDTH * 4) / 3);

export function CarCover({ make, car, plate, code, status, statusColor, eyebrow, title, detail, action, menu, onOpen, outline = false, width = 238, height = 280, className }) {
	const ink = makeInk(make);
	const art = Math.round(height * 0.5);
	return (
		<article
			data-card
			className={cn("relative flex shrink-0 flex-col gap-0.5 rounded-[14px] p-3", outline && "text-foreground [outline:1.5px_dashed_color-mix(in_srgb,var(--foreground)_25%,transparent)] [outline-offset:-1.5px]", className)}
			style={outline ? { width, height } : { width, height, background: makeCover(make), color: ink }}
		>
			<button type="button" onClick={onOpen} className={cn("flex min-h-0 flex-1 flex-col gap-0.5 text-left outline-none focus-visible:ring-2 rounded-[10px]", outline ? "focus-visible:ring-ring" : "focus-visible:ring-white/70")}>
				<span className="relative mb-2 flex shrink-0 items-center justify-center rounded-[9px]" style={{ height: art, background: makeArt(make), color: ink }}>
					<MakeLogo make={make} className="-translate-y-2 text-current" style={{ width: art * 0.46, height: art * 0.46 }} />
					{code && (
						<span translate="no" className="absolute top-2.5 left-2.5 rounded-[5px] bg-black/30 px-2 py-0.5 text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-white tabular-nums">
							{code}
						</span>
					)}
					{status && (
						<span className={cn("absolute top-2.5 right-2.5 rounded-[5px] px-2 py-0.5 text-[11px] font-medium text-white", !statusColor && "bg-black/30")} style={statusColor ? { background: statusColor } : undefined}>
							{status}
						</span>
					)}
					<CarLine car={car} plate={plate} className="absolute right-2.5 bottom-2.5 left-2.5 text-[12.5px]" />
				</span>
				{eyebrow && <span className="truncate text-[11px] font-semibold tracking-[0.05em] uppercase opacity-70">{eyebrow}</span>}
				<span className="line-clamp-2 text-[15px] leading-tight font-semibold">{title}</span>
				{detail && <span className="truncate text-[12.5px] opacity-70">{detail}</span>}
			</button>
			{(action || menu) && (
				<div className="flex items-center gap-2 pt-2.5">
					{action}
					{menu}
				</div>
			)}
		</article>
	);
}

/** On a cover's art: "Dacia Logan • B 385 RAK" as plain text, a small dot between the car and its plate. */
export function CarLine({ car, plate, className }) {
	if (!car && !plate) return null;
	return (
		<span className={cn("flex min-w-0 items-center gap-1.5 font-semibold", className)}>
			{car && <span className="truncate">{car}</span>}
			{car && plate && <span className="size-1 shrink-0 rounded-full bg-current opacity-70" aria-hidden />}
			{plate && (
				<span translate="no" className="shrink-0 whitespace-nowrap uppercase">
					{formatPlate(plate)}
				</span>
			)}
		</span>
	);
}

/** The one button on a cover (36 px on a card, `large` on a page's head): white on the car's colour; on an outlined cover, the page's ink. */
export function CoverButton({ icon: Icon, large, outline = false, ref, children, ...props }) {
	// Liquid glass: clear with a white tint on the car's colour (its text takes the ink), dark glass on an outlined cover.
	const glass = useGlass(outline ? "ink" : "clear", { outer: ref });
	return (
		<button ref={glass} type="button" className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium transition-transform active:scale-[0.98]", outline ? "bg-foreground text-background" : "bg-white text-zinc-900 [&.lg-pane]:text-[inherit]", large ? "h-8 px-3 text-[13px] pointer-coarse:h-10" : "h-9 px-3.5 text-[13.5px] pointer-coarse:h-11")} {...props}>
			{Icon && <Icon className={large ? "size-3.5" : "size-4"} aria-hidden />}
			{children}
		</button>
	);
}

/** The classes of a round button on a car's colour, for a link that looks like one. `light`: "outline" on an outlined cover. */
export const coverIconClass = (light, large = false) =>
	cn("inline-flex shrink-0 items-center justify-center rounded-full", large ? "size-8 pointer-coarse:size-10" : "size-9 pointer-coarse:size-11", light === "outline" ? "bg-foreground/[0.07] ring-1 ring-foreground/10 ring-inset" : light ? "bg-black/10" : "bg-white/15 ring-1 ring-white/20 ring-inset");

/** A round button on a car's colour (call, "…"), of liquid glass; `href` makes it a link (tel:). */
export function CoverIconButton({ icon: Icon, label, light, large, href, ref, ...props }) {
	const glass = useGlass(light === "outline" ? "pill" : "clear", { outer: ref });
	const Tag = href ? "a" : "button";
	return (
		<Tag ref={glass} {...(href ? { href } : { type: "button" })} aria-label={label} className={coverIconClass(light, large)} {...props}>
			<Icon className={large ? "size-3.5" : "size-4"} aria-hidden />
		</Tag>
	);
}

/**
 * The head of a car's page (a job, an estimate, the car itself): the cover colour fading into the page, the logo on
 * its art, then the plate and status, an eyebrow, the title, a line of facts and the actions.
 */
export function CarHeader({ make, plate, status, eyebrow, title, facts, actions, footer, back, className }) {
	return (
		<header
			className={cn("-mx-4 -mt-4 px-4 pt-5 pb-10 md:-mx-6 md:-mt-6 md:px-6 lg:-mx-8 lg:-mt-8 lg:px-8", className)}
			style={{ background: `linear-gradient(to bottom, ${makeCover(make)} 0, ${makeCover(make)} 72%, var(--background) 100%)`, color: makeInk(make) }}
		>
			{back}
			<div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-6">
				<MakeArt make={make} size={104} className="hidden md:inline-flex" />
				<div className="flex min-w-0 flex-1 flex-col gap-1.5">
					<div className="flex flex-wrap items-center gap-2">
						{plate && <Plate value={plate} size="sm" />}
						{status && <span className="rounded-[5px] bg-black/30 px-2 py-0.5 text-xs font-medium text-white">{status}</span>}
					</div>
					{eyebrow && <span className="text-[11px] font-semibold tracking-[0.05em] uppercase opacity-70">{eyebrow}</span>}
					<h1 className="text-[1.625rem] leading-tight font-semibold tracking-tight text-balance">{title}</h1>
					{facts && <p className="text-sm opacity-75">{facts}</p>}
					{actions && <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div>}
					{footer}
				</div>
			</div>
		</header>
	);
}
