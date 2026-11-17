"use client";

import Link from "next/link";
import { ChevronRight, Search as SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The iPhone app's building blocks for the phone (owner, 17 Nov 2026; docs/DESIGN.md "Telefon ca iPhone"), copied from
// ios-native/Garaj/Views/Components.swift: inset grouped lists, their bold section headers, icon squares, state pills
// and the empty state. Sizes are the iPhone's points (body 17, footnote 13, title3 20).

/** A section header as the iPhone's: title3 bold, an optional grey line under it. */
export function IosHeader({ title, subtitle, className }) {
	return (
		<div className={cn("px-1 pb-1.5", className)}>
			<h2 className="text-[20px] leading-[25px] font-bold">{title}</h2>
			{subtitle && <p className="text-[15px] leading-5 text-muted-foreground">{subtitle}</p>}
		</div>
	);
}

/** The small grey capitals over a group (search results, settings). */
export function IosCaps({ children, className }) {
	return <h2 className={cn("px-4 pb-1.5 text-[13px] font-semibold tracking-[0.02em] text-muted-foreground uppercase", className)}>{children}</h2>;
}

/** An inset grouped section: its header, then its rows on one rounded card, separators inset past the icon. */
export function IosGroup({ title, subtitle, caps, children, className }) {
	return (
		<section className={cn("flex flex-col", className)} aria-label={typeof title === "string" ? title : caps}>
			{title && <IosHeader title={title} subtitle={subtitle} />}
			{caps && <IosCaps>{caps}</IosCaps>}
			<ul className="overflow-hidden rounded-[20px] bg-card [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-x-0 [&>li+li]:before:top-0 [&>li+li]:before:ml-[var(--inset,16px)] [&>li+li]:before:h-px [&>li+li]:before:bg-border">{children}</ul>
		</section>
	);
}

/** The coloured square with a white symbol (30 pt, radius 8), as the iPhone's IconSquare. */
export function IosIconSquare({ icon: Icon, color, className }) {
	return (
		<span className={cn("flex size-[30px] shrink-0 items-center justify-center rounded-[8px]", className)} style={{ background: color }}>
			<Icon className="size-[18px] text-white" strokeWidth={2.25} aria-hidden />
		</span>
	);
}

/** A Settings-style row: icon square, title, a muted value, the chevron. A link or a button. */
export function IosRow({ href, onClick, icon, color, title, detail, value, trailing, chevron = true, className }) {
	const body = (
		<>
			{icon && <IosIconSquare icon={icon} color={color} />}
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[17px] leading-[22px]">{title}</span>
				{detail && <span className="block truncate text-[12px] leading-4 text-muted-foreground">{detail}</span>}
			</span>
			{value != null && <span className="shrink-0 text-[17px] text-muted-foreground tabular-nums">{value}</span>}
			{trailing}
			{chevron && <ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />}
		</>
	);
	const cls = cn("flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left active:bg-foreground/[0.06]", className);
	return (
		<li style={icon ? { "--inset": "58px" } : undefined}>
			{href ? (
				<Link href={href} className={cls}>
					{body}
				</Link>
			) : (
				<button type="button" onClick={onClick} className={cls}>
					{body}
				</button>
			)}
		</li>
	);
}

/** The search field as the iPhone's `.searchable`: a grey capsule with the magnifier, 17 pt. */
export function IosSearchField({ value, onChange, placeholder, autoFocus, className }) {
	return (
		<label className={cn("flex h-11 items-center gap-2 rounded-full bg-foreground/[0.07] px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring", className)}>
			<SearchIcon className="size-[18px] shrink-0" strokeWidth={2.25} aria-hidden />
			<input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder} className="min-w-0 flex-1 bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground" />
		</label>
	);
}

/** A state as the iPhone's pill: the colour as a light fill, the word in that colour. */
export function IosPill({ color, children, className }) {
	return (
		<span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-[7px] px-2 text-[13px] font-medium whitespace-nowrap", className)} style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color: `color-mix(in srgb, ${color} 80%, var(--foreground))` }}>
			{children}
		</span>
	);
}

/** ContentUnavailableView: the grey symbol, the bold line, the grey sentence, centred. */
export function IosEmpty({ icon: Icon, title, children, className }) {
	return (
		<div className={cn("flex flex-col items-center gap-1 px-8 py-6 text-center", className)}>
			{Icon && <Icon className="mb-2 size-11 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
			<p className="text-[20px] leading-[25px] font-bold">{title}</p>
			{children && <p className="text-[17px] leading-[22px] text-muted-foreground">{children}</p>}
		</div>
	);
}
