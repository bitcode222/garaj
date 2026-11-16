import { MakeLogo } from "@/components/ds/make-logo";
import { Plate } from "@/components/ds/plate";
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
export function CarCover({ make, plate, status, eyebrow, title, detail, action, menu, onOpen, width = 238, height = 280, className }) {
	const ink = makeInk(make);
	const art = Math.round(height * 0.42);
	return (
		<article
			data-card
			className={cn("relative flex shrink-0 flex-col gap-0.5 rounded-[14px] p-3", className)}
			style={{ width, height, background: makeCover(make), color: ink }}
		>
			<button type="button" onClick={onOpen} className="flex min-h-0 flex-1 flex-col gap-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-[10px]">
				<span className="relative mb-2 flex shrink-0 items-center justify-center rounded-[9px]" style={{ height: art, background: makeArt(make) }}>
					<MakeLogo make={make} className="-translate-y-2 text-current" style={{ width: art * 0.46, height: art * 0.46 }} />
					{status && <span className="absolute top-2.5 right-2.5 rounded-[5px] bg-black/30 px-2 py-0.5 text-[11px] font-medium text-white">{status}</span>}
					{plate && <Plate value={plate} size="sm" className="absolute bottom-2.5 left-2.5" />}
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

/** The one button on a cover: white on the car's colour. */
export function CoverButton({ icon: Icon, children, ...props }) {
	return (
		<button type="button" className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] bg-white px-2.5 text-xs font-medium text-zinc-900 transition-transform active:scale-[0.98] pointer-coarse:h-9" {...props}>
			{Icon && <Icon className="size-3.5" aria-hidden />}
			{children}
		</button>
	);
}

/** A round button on a car's colour (call, "…"). */
export function CoverIconButton({ icon: Icon, label, light, ...props }) {
	return (
		<button
			type="button"
			aria-label={label}
			className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] pointer-coarse:size-9", light ? "bg-black/10" : "bg-white/15 ring-1 ring-white/20 ring-inset")}
			{...props}
		>
			<Icon className="size-3.5" aria-hidden />
		</button>
	);
}

/**
 * The head of a car's page (a job, an estimate, the car itself): the cover colour fading into the page, the logo on
 * its art, then the plate and status, an eyebrow, the title, a line of facts and the actions.
 */
export function CarHeader({ make, plate, status, eyebrow, title, facts, actions, footer, className }) {
	return (
		<header
			className={cn("-mx-4 px-4 pt-6 pb-10 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8", className)}
			style={{ background: `linear-gradient(to bottom, ${makeCover(make)} 0, ${makeCover(make)} 72%, var(--background) 100%)`, color: makeInk(make) }}
		>
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
