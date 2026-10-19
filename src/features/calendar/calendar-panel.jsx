"use client";

import { useRef } from "react";
import { ArrowLeftRight, ArrowUpDown, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { addMonthsISO } from "@/domain/dates";
import { fmtDate } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { monthGrid } from "./utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const COLOR_BY = [
	{ value: "status", label: "Stare" },
	{ value: "mechanic", label: "Mecanic" },
	{ value: "service", label: "Operație" },
];

/**
 * The mini month (D18): ⌃ ⌄ and the wheel over it change the month; the days in view are a band;
 * today is a brand pill; a dot under a day with bookings (fuller with more), or, while searching,
 * a brand dot under the days with a match (`matchDays`); a click goes there. `fill`: it grows with
 * the box it is in (the floating mini calendar, resizable).
 */
export function MiniMonth({ month, onMonth, today, range, busy, matchDays = null, onPick, fill = false }) {
	const wheel = useRef({ sum: 0, at: 0 });
	const days = monthGrid(`${month}-01`);
	const step = (direction) => onMonth(addMonthsISO(`${month}-01`, direction).slice(0, 7));
	return (
		<div
			className={cn(fill && "@container flex h-full min-h-0 flex-col")}
			onWheel={(event) => {
				// A trackpad sends many small deltas: a month per 60 px of scrolling, never more than one per 250 ms.
				const w = wheel.current;
				w.sum += event.deltaY;
				if (Math.abs(w.sum) < 60 || event.timeStamp - w.at < 250) return;
				w.at = event.timeStamp;
				step(Math.sign(w.sum));
				w.sum = 0;
			}}
		>
			<div className="mb-1.5 flex items-center justify-between pl-1">
				<span className="text-sm font-semibold first-letter:uppercase">{fmtDate(`${month}-01`, "MMMM yyyy")}</span>
				<span className="flex">
					<Button variant="ghost" size="icon" className="size-8" onClick={() => step(-1)} aria-label="Minicalendar: luna anterioară">
						<ChevronUp />
					</Button>
					<Button variant="ghost" size="icon" className="size-8" onClick={() => step(1)} aria-label="Minicalendar: luna următoare">
						<ChevronDown />
					</Button>
				</span>
			</div>
			<div role="grid" aria-label={`Luna ${fmtDate(`${month}-01`, "MMMM yyyy")}`} className={cn("grid grid-cols-7 text-center text-xs", fill && "min-h-0 flex-1 grid-rows-[auto_repeat(6,minmax(0,1fr))] @[22rem]:text-sm")}>
				{WEEKDAYS.map((name, i) => (
					<span key={i} className="pb-1 text-2xs font-medium text-muted-foreground" aria-hidden>
						{name}
					</span>
				))}
				{days.map((day, i) => {
					const inBand = range && day >= range.from && day <= range.to;
					const column = i % 7;
					const count = busy.get(day)?.length ?? 0;
					const found = matchDays?.has(day) ?? false;
					const isToday = day === today;
					return (
						<button
							key={day}
							type="button"
							onClick={() => onPick(day)}
							aria-label={`${fmtDate(day, "EEEE, d MMMM")}${matchDays ? (found ? ", are rezultate" : "") : count ? `, ${count} programări` : ""}`}
							className={cn(
								"relative flex items-center justify-center tabular-nums transition-colors hover:text-foreground",
								fill ? "h-full min-h-7" : "h-8",
								day.slice(0, 7) !== month ? "text-muted-foreground/60" : "text-foreground",
								matchDays && !found && "text-muted-foreground/50",
								inBand && "bg-accent",
								inBand && (column === 0 || day === range.from) && "rounded-l-md",
								inBand && (column === 6 || day === range.to) && "rounded-r-md",
							)}
						>
							<span className={cn("flex size-6 items-center justify-center rounded-full @[22rem]:size-7", isToday ? "bg-brand font-semibold text-brand-foreground" : found ? "font-semibold ring-1 ring-brand" : "hover:bg-accent")}>{Number(day.slice(8))}</span>
							{matchDays
								? found && <span className="absolute bottom-0.5 size-1 rounded-full bg-brand" aria-hidden />
								: count > 0 && <span className={cn("absolute bottom-0.5 size-1 rounded-full", isToday ? "bg-brand" : count > 5 ? "bg-foreground" : count > 2 ? "bg-foreground/60" : "bg-foreground/30")} aria-hidden />}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** A checkbox in its colour, as Notion's calendars: the colour is the box. `pill`: a compact chip (the settings row). */
function ColorCheck({ checked, onChange, toneName, outline = false, label, pill = false }) {
	return (
		<label className={cn("flex cursor-pointer items-center gap-2.5 rounded-md text-sm transition-colors hover:bg-accent/60", pill ? "min-h-8 border px-2" : "min-h-9 px-1.5 max-md:min-h-11")}>
			<input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
			<span
				className={cn(
					"flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50",
					checked ? (outline ? "border-dashed border-foreground/60 bg-card" : cn("border-transparent text-white", tone(toneName).solid)) : "border-foreground/30 bg-transparent",
				)}
				aria-hidden
			>
				{checked && <Check className={cn("size-3", outline && "text-foreground")} strokeWidth={3} />}
			</span>
			<span className={cn("min-w-0 truncate", !pill && "flex-1")}>{label}</span>
		</label>
	);
}

function Group({ title, children, row = false }) {
	return (
		<section aria-label={title} className="min-w-0 space-y-0.5">
			<h3 className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">{title}</h3>
			<div className={cn(row ? "flex flex-wrap gap-1.5" : "space-y-0.5")}>{children}</div>
		</section>
	);
}

function Segmented({ label, value, options, onChange }) {
	return (
		<div role="radiogroup" aria-label={label} className="inline-flex h-9 w-full items-center gap-1 rounded-lg bg-muted p-1">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					role="radio"
					aria-checked={value === option.value}
					onClick={() => onChange(option.value)}
					className={cn("inline-flex h-full flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors", value === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
				>
					{option.icon && <option.icon className="size-3.5" aria-hidden />} {option.label}
				</button>
			))}
		</div>
	);
}

/**
 * The calendar's settings (D18): the mechanics and the statuses shown, as coloured checkboxes, and
 * how it is drawn. `layout`: "columns" (the collapsible under the desktop header: chips side by
 * side) or "stack" (the phone's sheet, under the mini month).
 */
export function CalendarSettings({ layout = "stack", staff, hiddenStaff, onStaff, hasUnassigned, hiddenStatuses, onStatus, prefs, onPrefs, direction, onDirection }) {
	const row = layout === "columns";
	return (
		<div className={cn(row ? "grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(16rem,0.9fr)]" : "flex flex-col gap-5")}>
			{staff.length > 0 && (
				<Group title="Mecanici" row={row}>
					{staff.map((s) => (
						<ColorCheck key={s.id} pill={row} checked={!hiddenStaff.includes(s.id)} onChange={(on) => onStaff(s.id, on)} toneName={s.color} label={s.name} />
					))}
					{hasUnassigned && <ColorCheck pill={row} checked={!hiddenStaff.includes("none")} onChange={(on) => onStaff("none", on)} toneName="neutral" label="Nealocat" />}
				</Group>
			)}
			<Group title="Stări" row={row}>
				{Object.entries(APPOINTMENT_STATUS).map(([key, meta]) => (
					<ColorCheck key={key} pill={row} checked={!hiddenStatuses.includes(key)} onChange={(on) => onStatus(key, on)} toneName={meta.tone} outline={key === "scheduled"} label={key === "scheduled" ? "Programat (de confirmat)" : meta.label} />
				))}
			</Group>
			<Group title="Afișare">
				<div className="space-y-2.5 px-1.5 pb-1">
					<div>
						<p className="mb-1.5 text-sm">Derulare prin zile și luni</p>
						<Segmented
							label="Derulare"
							value={direction}
							onChange={onDirection}
							options={[
								{ value: "horizontal", label: "Orizontal", icon: ArrowLeftRight },
								{ value: "vertical", label: "Vertical", icon: ArrowUpDown },
							]}
						/>
					</div>
					<div>
						<p className="mb-1.5 text-sm">Colorează după</p>
						<Segmented label="Colorează după" value={prefs.colorBy} onChange={(colorBy) => onPrefs({ colorBy })} options={COLOR_BY} />
					</div>
				</div>
				<label className={cn("flex min-h-9 items-center justify-between gap-2 px-1.5 text-sm max-md:min-h-11", direction === "vertical" && "opacity-60")} title={direction === "vertical" ? "Rândul de mașini în service apare la derularea stânga–dreapta" : undefined}>
					<span>
						Mașini în service
						{direction === "vertical" && <span className="block text-2xs text-muted-foreground">doar la stânga–dreapta</span>}
					</span>
					<Switch checked={prefs.showService !== false} onCheckedChange={(on) => onPrefs({ showService: on })} disabled={direction === "vertical"} />
				</label>
				<label className="flex min-h-9 items-center justify-between gap-2 px-1.5 text-sm max-md:min-h-11">
					Confirmă la mutare
					<Switch checked={Boolean(prefs.confirmDrop)} onCheckedChange={(on) => onPrefs({ confirmDrop: on })} />
				</label>
			</Group>
		</div>
	);
}
