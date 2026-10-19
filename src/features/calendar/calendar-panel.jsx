"use client";

import { useRef } from "react";
import { ArrowLeftRight, ArrowUpDown, Check, ChevronDown, ChevronUp, PanelLeftClose, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { addMonthsISO } from "@/domain/dates";
import { fmtDate } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { openCommandMenu } from "@/components/shell/command-state";
import { monthGrid } from "./utils";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const COLOR_BY = [
	{ value: "status", label: "Stare" },
	{ value: "mechanic", label: "Mecanic" },
	{ value: "service", label: "Operație" },
];

/**
 * The mini month (D18): ⌃ ⌄ and the wheel over it change the month; the days in view are a band;
 * today is a brand pill; a dot under a day with bookings (fuller with more); a click goes there.
 */
function MiniMonth({ month, onMonth, today, range, busy, onPick }) {
	const wheel = useRef({ sum: 0, at: 0 });
	const days = monthGrid(`${month}-01`);
	const step = (direction) => onMonth(addMonthsISO(`${month}-01`, direction).slice(0, 7));
	return (
		<div
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
			<div role="grid" aria-label={`Luna ${fmtDate(`${month}-01`, "MMMM yyyy")}`} className="grid grid-cols-7 text-center text-xs">
				{WEEKDAYS.map((name, i) => (
					<span key={i} className="pb-1 text-2xs font-medium text-muted-foreground" aria-hidden>
						{name}
					</span>
				))}
				{days.map((day, i) => {
					const inBand = range && day >= range.from && day <= range.to;
					const column = i % 7;
					const count = busy.get(day)?.length ?? 0;
					const isToday = day === today;
					return (
						<button
							key={day}
							type="button"
							onClick={() => onPick(day)}
							aria-label={`${fmtDate(day, "EEEE, d MMMM")}${count ? `, ${count} programări` : ""}`}
							className={cn(
								"relative flex h-8 items-center justify-center tabular-nums transition-colors hover:text-foreground",
								day.slice(0, 7) !== month ? "text-muted-foreground/60" : "text-foreground",
								inBand && "bg-accent",
								inBand && (column === 0 || day === range.from) && "rounded-l-md",
								inBand && (column === 6 || day === range.to) && "rounded-r-md",
							)}
						>
							<span className={cn("flex size-6 items-center justify-center rounded-full", isToday ? "bg-brand font-semibold text-brand-foreground" : "hover:bg-accent")}>{Number(day.slice(8))}</span>
							{count > 0 && <span className={cn("absolute bottom-0.5 size-1 rounded-full", isToday ? "bg-brand" : count > 5 ? "bg-foreground" : count > 2 ? "bg-foreground/60" : "bg-foreground/30")} aria-hidden />}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** A checkbox in its colour, as Notion's calendars: the colour is the box. */
function ColorCheck({ checked, onChange, toneName, outline = false, label, hint }) {
	return (
		<label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm transition-colors hover:bg-accent/60 max-md:min-h-11">
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
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{hint && <span className="text-2xs text-muted-foreground tabular-nums">{hint}</span>}
		</label>
	);
}

function Group({ title, children }) {
	return (
		<section aria-label={title} className="space-y-0.5">
			<h3 className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">{title}</h3>
			{children}
		</section>
	);
}

/**
 * The calendar's left panel (docs/APPOINTMENTS-AND-NAV.md D18), Notion Calendar's: search and a
 * new booking on top, the mini month, then the mechanics and the statuses as coloured
 * checkboxes, and how the calendar is drawn. On a phone it is the content of a sheet.
 */
export function CalendarPanel({ month, onMonth, today, range, busy, onPick, staff, hiddenStaff, onStaff, hasUnassigned, hiddenStatuses, onStatus, prefs, onPrefs, onCreate, onClose, direction, onDirection }) {
	return (
		<div className="flex flex-col gap-5">
			<div className="flex items-center gap-1">
				{onClose && (
					<Button variant="ghost" size="icon-sm" className="mr-auto" onClick={onClose} aria-label="Ascunde panoul" title="Ascunde panoul">
						<PanelLeftClose />
					</Button>
				)}
				<Button variant="ghost" size="icon-sm" className={cn(!onClose && "ml-auto")} onClick={() => openCommandMenu()} aria-label="Caută" title="Caută (⌘K)">
					<Search />
				</Button>
				<Button variant="ghost" size="icon-sm" onClick={onCreate} aria-label="Programare nouă" title="Programare nouă">
					<Plus />
				</Button>
			</div>
			<MiniMonth month={month} onMonth={onMonth} today={today} range={range} busy={busy} onPick={onPick} />
			{staff.length > 0 && (
				<Group title="Mecanici">
					{staff.map((s) => (
						<ColorCheck key={s.id} checked={!hiddenStaff.includes(s.id)} onChange={(on) => onStaff(s.id, on)} toneName={s.color} label={s.name} />
					))}
					{hasUnassigned && <ColorCheck checked={!hiddenStaff.includes("none")} onChange={(on) => onStaff("none", on)} toneName="neutral" label="Nealocat" />}
				</Group>
			)}
			<Group title="Stări">
				{Object.entries(APPOINTMENT_STATUS).map(([key, meta]) => (
					<ColorCheck key={key} checked={!hiddenStatuses.includes(key)} onChange={(on) => onStatus(key, on)} toneName={meta.tone} outline={key === "scheduled"} label={key === "scheduled" ? "Programat (de confirmat)" : meta.label} />
				))}
			</Group>
			<Group title="Afișare">
				<div className="px-1.5 pb-1">
					<p className="mb-1.5 text-sm">Derulare prin zile și luni</p>
					<div role="radiogroup" aria-label="Derulare" className="inline-flex h-9 w-full items-center gap-1 rounded-lg bg-muted p-1">
						{[
							{ value: "horizontal", label: "Orizontal", icon: ArrowLeftRight },
							{ value: "vertical", label: "Vertical", icon: ArrowUpDown },
						].map((option) => (
							<button
								key={option.value}
								type="button"
								role="radio"
								aria-checked={direction === option.value}
								onClick={() => onDirection(option.value)}
								className={cn("inline-flex h-full flex-1 items-center justify-center gap-1 rounded-md text-xs font-medium transition-colors", direction === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
							>
								<option.icon className="size-3.5" aria-hidden /> {option.label}
							</button>
						))}
					</div>
				</div>
				<div className="px-1.5 pb-1">
					<p className="mb-1.5 text-sm">Colorează după</p>
					<div role="radiogroup" aria-label="Colorează după" className="inline-flex h-9 w-full items-center gap-1 rounded-lg bg-muted p-1">
						{COLOR_BY.map((option) => (
							<button
								key={option.value}
								type="button"
								role="radio"
								aria-checked={prefs.colorBy === option.value}
								onClick={() => onPrefs({ colorBy: option.value })}
								className={cn("h-full flex-1 rounded-md text-xs font-medium transition-colors", prefs.colorBy === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
							>
								{option.label}
							</button>
						))}
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
