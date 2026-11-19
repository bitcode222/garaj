"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Glass } from "@/components/ds/glass";
import { PHONE, PhoneNavBar } from "@/components/ds/nav-bar";
import { useLocalPreference, useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";

// The text levels and small parts of the design language (docs/DESIGN.md §1, §3): page title 26 → section 15.5 with
// "›" and a grey line → card → row. A state is a dot with words; an area's kind is its colour in small capitals.

/**
 * The page's title, its grey line, and what sits at its right (a switch, chips, a search). On a phone it is the
 * iPhone's: the nav row above (round glass buttons, `actions`, default "+"), the title large (34 bold) until it scrolls
 * under the row, which then shows it small; `inline` keeps it small in the row from the start (as Atelier).
 * `phoneTitle` replaces the large title on a phone (Azi's greeting).
 */
export function PageTitle({ title, subtitle, children, className, actions, inline = false, phoneTitle }) {
	const phone = useMediaQuery(PHONE);
	const heading = useRef(null);
	const [gone, setGone] = useState(false);
	useEffect(() => {
		const el = heading.current;
		if (!phone || inline || !el) return;
		// The title is "gone" once its last line has passed under the 44 px row.
		const observer = new IntersectionObserver(([entry]) => setGone(!entry.isIntersecting && entry.boundingClientRect.top < 120), { rootMargin: "-56px 0px 0px 0px" });
		observer.observe(el);
		return () => observer.disconnect();
	}, [phone, inline]);
	return (
		<div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
			{phone && <PhoneNavBar title={title} collapsed={inline || gone} actions={actions} />}
			{phone && <div aria-hidden className="h-7 w-full" />}
			<div className="min-w-0">
				<h1 ref={heading} className={cn("text-[1.625rem] leading-tight font-semibold tracking-tight text-balance", "max-md:text-[34px] max-md:leading-[41px] max-md:font-bold max-md:tracking-[0.01em]", inline && "max-md:sr-only")}>
					{phone && phoneTitle ? phoneTitle : title}
				</h1>
				{subtitle && <p className="mt-0.5 text-[13.5px] text-muted-foreground">{subtitle}</p>}
			</div>
			{children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
		</div>
	);
}

/** A section's title; with `href` it reads "Title ›" and opens the whole list. */
export function SectionHeader({ title, subtitle, href, children, className }) {
	const heading = (
		<h2 className="flex items-center gap-0.5 text-[15.5px] font-semibold tracking-tight">
			{title}
			{href && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
		</h2>
	);
	return (
		<div className={cn("flex items-end justify-between gap-3", className)}>
			<div className="min-w-0">
				{href ? (
					<Link href={href} className="rounded-sm outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring">
						{heading}
					</Link>
				) : (
					heading
				)}
				{subtitle && <p className="mt-px text-[12.5px] text-muted-foreground">{subtitle}</p>}
			</div>
			{children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
		</div>
	);
}

/** A state: a small dot in its colour (src/lib/colors.js STATE) and its words. */
export function StatusDot({ color, children, className }) {
	return (
		<span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap", className)}>
			<span className="size-[7px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
			{children}
		</span>
	);
}

/** A record's kind in its area's colour, small capitals (Lucrare, Factură…). */
export function KindLabel({ color, children, className }) {
	return (
		<span className={cn("text-[11px] font-bold tracking-[0.05em] uppercase", className)} style={{ color }}>
			{children}
		</span>
	);
}

/** One number of the day: a grey label, the figure, and a coloured line under it. */
export function StatCard({ label, value, note, color, className }) {
	return (
		<div className={cn("flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card px-3.5 py-3", className)}>
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="text-[22px] leading-tight font-semibold tracking-tight tabular-nums">{value}</span>
			{note && (
				<span className="truncate text-xs font-medium" style={{ color }}>
					{note}
				</span>
			)}
		</div>
	);
}

/**
 * Where the owner kept two looks for one page (docs/DESIGN.md §4): a small segmented switch, remembered on this
 * device under `storageKey`. Returns [value, element].
 */
export function useViewSwitch(storageKey, options) {
	const values = options.map((option) => option.value);
	const [value, setValue] = useLocalPreference(storageKey, values[0], values);
	const element = (
		<Glass preset="pill" role="radiogroup" aria-label="Cum arată pagina" className="inline-flex h-[30px] items-center gap-0.5 rounded-[8px] bg-muted p-0.5 pointer-coarse:h-10">
			{options.map((option) => {
				const on = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={on}
						onClick={() => setValue(option.value)}
						className={cn(
							"inline-flex h-full items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-150",
							on ? "bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.1)]" : "text-muted-foreground hover:text-foreground",
						)}
					>
						{option.icon && <option.icon className="size-3.5" aria-hidden />}
						{option.label}
					</button>
				);
			})}
		</Glass>
	);
	return [value, element];
}

/** A keyboard key, as in the sidebar's "⌘K". */
export function KeyHint({ children, className }) {
	return <kbd className={cn("rounded-[5px] border px-1.5 font-sans text-[11px] leading-[17px] text-muted-foreground", className)}>{children}</kbd>;
}
