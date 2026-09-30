"use client";

import { useDeferredValue, useState } from "react";
import { CalendarX2 } from "lucide-react";
import { EmptyState } from "@/components/ds/data";
import { SearchInput } from "@/components/ds/inputs";
import { ToneDot } from "@/components/ds/tone";
import { dayOfInstant } from "@/domain/dates";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { AppointmentCard } from "./appointment-card";
import { monthGrid } from "./utils";

const WEEKDAYS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const MONTHS = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];

export function MonthView({ date, today, byDay, toneOf, badge, onPickDay, onOpen }) {
	const cells = monthGrid(date);
	const month = date.slice(0, 7);
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-auto">
			<div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-card">
				{WEEKDAYS.map((d) => (
					<span key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
						{d}
					</span>
				))}
			</div>
			<div className="grid flex-1 grid-cols-7 grid-rows-6">
				{cells.map((day, i) => {
					const events = byDay.get(day) ?? [];
					const inMonth = day.startsWith(month);
					const isToday = day === today;
					return (
						<div
							key={day}
							role="button"
							tabIndex={0}
							onClick={() => onPickDay(day)}
							onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPickDay(day)}
							className={cn(
								"flex min-h-20 min-w-0 flex-col gap-1 border-t p-1 text-left transition-colors hover:bg-accent/40 md:min-h-28 md:p-1.5",
								i % 7 !== 0 && "border-l",
								!inMonth && "bg-muted/30",
							)}
						>
							<span
								className={cn(
									"flex size-6 items-center justify-center self-start rounded-full text-xs font-semibold tabular-nums",
									isToday && "bg-primary text-primary-foreground",
									!inMonth && !isToday && "text-muted-foreground/60",
								)}
							>
								{Number(day.slice(8))}
							</span>
							{/* phone: dots */}
							<span className="flex flex-wrap gap-0.5 px-0.5 md:hidden">
								{events.slice(0, 6).map((e) => (
									<ToneDot key={e.id} tone={toneOf(e)} className="size-1.5" />
								))}
							</span>
							{/* desktop: tinted badges */}
							<span className="hidden min-w-0 flex-col gap-1 md:flex">
								{events.slice(0, 3).map((e) => (
									<span
										key={e.id}
										role="button"
										tabIndex={-1}
										onClick={(ev) => {
											ev.stopPropagation();
											onOpen(e);
										}}
										className={cn(
											"flex h-6 min-w-0 items-center gap-1.5 rounded-md border px-1.5 text-xs",
											badge === "dot" ? "border-transparent bg-muted/60" : tone(toneOf(e)).block,
											(e.status === "cancelled" || e.status === "no_show") && "line-through opacity-50",
										)}
									>
										{badge === "dot" && <ToneDot tone={toneOf(e)} />}
										<span className="shrink-0 tabular-nums opacity-80">{fmtTime(e.start)}</span>
										<span className="truncate font-medium">{e.title}</span>
									</span>
								))}
								{events.length > 3 && <span className="px-1 text-xs font-medium text-muted-foreground">+{events.length - 3} încă</span>}
							</span>
							{events.length > 0 && <span className="mt-auto px-0.5 text-2xs text-muted-foreground tabular-nums md:hidden">{events.length}</span>}
						</div>
					);
				})}
			</div>
		</div>
	);
}

/** Year at a glance: day cells shaded by how booked they are. */
export function YearView({ date, today, byDay, onPickDay, onPickMonth }) {
	const year = date.slice(0, 4);
	const shade = (n) => (n === 0 ? "" : n <= 2 ? "bg-brand/15" : n <= 4 ? "bg-brand/35" : n <= 6 ? "bg-brand/60 text-white" : "bg-brand text-brand-foreground");
	return (
		<div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{MONTHS.map((name, index) => {
					const first = `${year}-${String(index + 1).padStart(2, "0")}-01`;
					const cells = monthGrid(first);
					const month = first.slice(0, 7);
					const total = cells.reduce((sum, d) => (d.startsWith(month) ? sum + (byDay.get(d)?.length ?? 0) : sum), 0);
					return (
						<section key={name} className="rounded-xl border bg-card">
							<button type="button" onClick={() => onPickMonth(first)} className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold hover:bg-accent/40">
								{name}
								<span className="text-xs font-normal text-muted-foreground">{plural(total, "programare", "programări")}</span>
							</button>
							<div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
								{WEEKDAYS.map((d) => (
									<span key={d} className="py-1 text-center text-2xs text-muted-foreground">
										{d[0]}
									</span>
								))}
								{cells.map((day) => {
									const inMonth = day.startsWith(month);
									const n = inMonth ? (byDay.get(day)?.length ?? 0) : 0;
									return (
										<button
											key={day}
											type="button"
											disabled={!inMonth}
											onClick={() => onPickDay(day)}
											title={inMonth ? `${fmtDate(day)} · ${plural(n, "programare", "programări")}` : undefined}
											className={cn(
												"flex aspect-square items-center justify-center rounded-md text-2xs tabular-nums transition-colors",
												inMonth ? "hover:ring-1 hover:ring-foreground/30" : "invisible",
												shade(n),
												day === today && "ring-2 ring-primary",
											)}
										>
											{Number(day.slice(8))}
										</button>
									);
								})}
							</div>
						</section>
					);
				})}
			</div>
			<div className="mt-4 flex items-center justify-end gap-1.5 text-2xs text-muted-foreground">
				Puțin
				{["bg-muted", "bg-brand/15", "bg-brand/35", "bg-brand/60", "bg-brand"].map((c) => (
					<span key={c} className={cn("size-3 rounded-sm", c)} />
				))}
				Mult
			</div>
		</div>
	);
}

export function AgendaView({ events, groupBy, lookups, toneOf, badge }) {
	const [query, setQuery] = useState("");
	const deferred = useDeferredValue(query);
	const tokens = queryTokens(deferred);
	const filtered = tokens.length
		? events.filter((e) => {
				const v = lookups.vehicles[e.vehicleId];
				return matchesTokens(fold(`${e.title} ${lookups.customers[e.customerId]?.name ?? ""} ${v?.plate ?? ""} ${(v?.plate ?? "").replace(/\s/g, "")}`), tokens);
			})
		: events;

	const groups = new Map();
	for (const e of filtered) {
		const key = groupBy === "mechanic" ? (e.staffId ?? "none") : groupBy === "status" ? e.status : dayOfInstant(e.start);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(e);
	}
	const heading = (key) => {
		if (groupBy === "mechanic") return lookups.staff[key]?.name ?? "Nealocat";
		if (groupBy === "status") return APPOINTMENT_STATUS[key]?.label ?? key;
		return fmtDate(key, "EEEE, d MMMM");
	};

	return (
		<div className="min-h-0 flex-1 overflow-auto">
			<div className="sticky top-0 z-10 border-b bg-card p-3">
				<SearchInput value={query} onChange={setQuery} placeholder="Client, nr. înmatriculare, operațiune…" />
			</div>
			{groups.size === 0 ? (
				<div className="p-4">
					<EmptyState compact icon={CalendarX2} title="Nicio programare" description="În intervalul ales nu sunt programări pentru filtrele active." />
				</div>
			) : (
				<div className="space-y-5 p-3 md:p-4">
					{[...groups].map(([key, list]) => (
						<section key={key}>
							<h3 className="mb-2 flex items-center gap-2 text-sm font-semibold first-letter:uppercase">
								{groupBy === "status" && <ToneDot tone={APPOINTMENT_STATUS[key]?.tone} />}
								<span className="first-letter:uppercase">{heading(key)}</span>
								<span className="text-xs font-normal text-muted-foreground">{list.length}</span>
							</h3>
							<ul className="space-y-2">
								{list.map((e) => (
									<li key={e.id}>
										<AppointmentCard
											appointment={e}
											vehicle={lookups.vehicles[e.vehicleId]}
											customer={lookups.customers[e.customerId]}
											mechanic={lookups.staff[e.staffId]}
											toneName={toneOf(e)}
											badge={badge}
										/>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			)}
		</div>
	);
}
