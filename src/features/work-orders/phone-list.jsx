"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, MoreHorizontal, Phone, Plus, Sparkles, Wrench } from "lucide-react";
import { MakeTile } from "@/components/ds/car";
import { PageTitle } from "@/components/ds/blocks";
import { IosEmpty, IosPill, IosSearchField } from "@/components/ds/ios";
import { MakeLogo } from "@/components/ds/make-logo";
import { NavIcon } from "@/components/ds/nav-bar";
import { Page } from "@/components/ds/page";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { computeTotals } from "@/domain/lines";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { OPEN_STATUSES } from "@/domain/work-order";
import { TONE_COLOR, makeColor } from "@/lib/colors";
import { formatMoney } from "@/lib/format";
import { useLocalPreference } from "@/lib/hooks";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";
import { JobMenu } from "./job-card";
import { primaryAction } from "./job-action";
import { jobHeadline, jobSummary } from "./job-text";

// Atelier on a phone, as the iPhone app's (ios-native/Garaj/Views/WorkOrdersView.swift): the title small in the nav
// row with sort/group and "+", the search, a chip per state with its count, then the jobs grouped (open / closed by
// default): an open job is a card with its next step, a closed one a row.

const ORDER = ["estimate", "approved", "in_progress", "waiting_parts", "ready", "delivered", "cancelled"];
const SORTS = [
	["new", "Cele mai noi"],
	["old", "Cele mai vechi"],
	["client", "Client (A–Z)"],
	["value", "Valoare"],
	["car", "Mașină (A–Z)"],
];
const GROUPS = [
	["open", "Deschise / închise"],
	["status", "Stare"],
	["mechanic", "Mecanic"],
	["none", "Fără grupare"],
];
const statusOf = (key) => ({ label: WORK_ORDER_STATUS[key]?.label ?? key, color: TONE_COLOR[WORK_ORDER_STATUS[key]?.tone ?? "neutral"] });

export function PhoneWorkOrders({ rows, query, setQuery, status, setStatus, staffId, settings, onOpen }) {
	const staff = useCollection("staff");
	const [sort, setSort] = useLocalPreference("garaj.jobs.sort", "new", SORTS.map((s) => s[0]));
	const [group, setGroup] = useLocalPreference("garaj.jobs.group", "open", GROUPS.map((g) => g[0]));
	const vatPayer = settings.invoicing.vatPayer;
	const gross = (order) => computeTotals((order.lines ?? []).filter((l) => !l.refused), { vatPayer }).gross;
	const net = (order) => computeTotals((order.lines ?? []).filter((l) => !l.refused), { vatPayer }).net;
	const money = (minor) => formatMoney(minor, settings.currency, { decimals: 0 });

	const counts = {};
	for (const r of rows) counts[r.order.status] = (counts[r.order.status] ?? 0) + 1;
	const ro = (a, b) => a.localeCompare(b, "ro");
	const sorted = rows
		.filter((r) => !status || r.order.status === status)
		.sort((a, b) =>
			sort === "old" ? a.order.number - b.order.number
			: sort === "client" ? ro(a.customer?.name ?? "", b.customer?.name ?? "")
			: sort === "value" ? gross(b.order) - gross(a.order)
			: sort === "car" ? ro(vehicleName(a.vehicle), vehicleName(b.vehicle))
			: b.order.number - a.order.number,
		);
	const split = (keys, keyOf, titleOf) => keys.map((k) => ({ title: titleOf(k), rows: sorted.filter((r) => keyOf(r) === k) })).filter((s) => s.rows.length);
	const team = Object.values(staff).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const sections =
		group === "status" ? split(ORDER, (r) => r.order.status, (k) => statusOf(k).label)
		: group === "mechanic" ? split([...team.map((s) => s.id), ""], (r) => (staff[r.order.staffId] ? r.order.staffId : ""), (k) => staff[k]?.name ?? "Fără mecanic")
		: group === "none" ? (sorted.length ? [{ title: "Toate", rows: sorted }] : [])
		: split(["open", "closed"], (r) => (OPEN_STATUSES.includes(r.order.status) ? "open" : "closed"), (k) => (k === "open" ? "Deschise" : "Predate și anulate"));

	const menu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<NavIcon label="Sortează și grupează">
					<ArrowUpDown />
				</NavIcon>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="text-xs text-muted-foreground">Sortează după</DropdownMenuLabel>
				{SORTS.map(([key, label]) => (
					<DropdownMenuItem key={key} onSelect={() => setSort(key)}>
						<Check className={cn(sort !== key && "opacity-0")} /> {label}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-xs text-muted-foreground">Grupează după</DropdownMenuLabel>
				{GROUPS.map(([key, label]) => (
					<DropdownMenuItem key={key} onSelect={() => setGroup(key)}>
						<Check className={cn(group !== key && "opacity-0")} /> {label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
	const actions = (
		<>
			{menu}
			<NavIcon label="Lucrare nouă" onClick={() => openSheet("checkin")}>
				<Plus />
			</NavIcon>
		</>
	);

	return (
		<Page width="narrow" className="space-y-4">
			<PageTitle title="Atelier" inline actions={actions} />
			<IosSearchField value={query} onChange={setQuery} placeholder="Caută număr, client, mașină" />
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="Stare">
				<Chip title="Toate" count={rows.length} on={!status} onClick={() => setStatus(null)} />
				{ORDER.filter((key) => counts[key]).map((key) => (
					<Chip key={key} title={statusOf(key).label} count={counts[key]} on={status === key} onClick={() => setStatus(status === key ? null : key)} />
				))}
			</div>
			{sections.length === 0 ? (
				query ? (
					<IosEmpty title={`Niciun rezultat pentru „${query}”`} className="pt-10">Verifică ce ai scris sau încearcă altceva.</IosEmpty>
				) : (
					<IosEmpty icon={Wrench} title="Nicio lucrare" className="pt-10">Când primești o mașină, deschizi aici lucrarea ei: ce cere clientul, operațiile, piesele.</IosEmpty>
				)
			) : (
				sections.map((section) => {
					const total = section.rows.reduce((n, r) => n + net(r.order), 0);
					const anyOpen = section.rows.some((r) => OPEN_STATUSES.includes(r.order.status));
					const closed = section.rows.filter((r) => !OPEN_STATUSES.includes(r.order.status));
					return (
						<section key={section.title} className="space-y-3 pt-2" aria-label={section.title}>
							<h2 className="px-1 text-[20px] leading-[25px] font-bold">
								{section.title} · {section.rows.length}
							</h2>
							{section.rows.filter((r) => OPEN_STATUSES.includes(r.order.status)).map((r) => (
								<PhoneJobCard key={r.order.id} row={r} staff={staff} staffId={staffId} money={money} gross={gross(r.order)} onOpen={() => onOpen(r.order)} />
							))}
							{closed.length > 0 && <ClosedList rows={closed} money={money} gross={gross} onOpen={onOpen} />}
							{total !== 0 && anyOpen && <p className="px-4 text-[13px] text-muted-foreground">Total: {money(total)} fără TVA</p>}
						</section>
					);
				})
			)}
		</Page>
	);
}

/** CountChip: the label and its count, ink when chosen. */
function Chip({ title, count, on, onClick }) {
	return (
		<button type="button" aria-pressed={on} onClick={onClick} className={cn("flex h-8 shrink-0 items-center gap-[5px] rounded-full px-3 text-[15px] font-medium", on ? "bg-foreground text-background" : "bg-card text-foreground")}>
			{title}
			<span className={cn("tabular-nums", on ? "text-background/70" : "text-muted-foreground")}>{count}</span>
		</button>
	);
}

/** JobCard (Covers.swift): tile, car · plate, the job, its state and client · amount, the summary, the next step. */
function PhoneJobCard({ row, staff, staffId, money, gross, onOpen }) {
	const { order, vehicle, customer } = row;
	const status = statusOf(order.status);
	const action = primaryAction(order, { staffId });
	const eyebrow = [vehicleName(vehicle), vehicle?.plate && formatPlate(vehicle.plate)].filter(Boolean).join(" · ") || "Fără mașină";
	const meta = [customer?.name, order.lines?.length ? money(gross) : null].filter(Boolean).join(" · ");
	const summary = [staff[order.staffId]?.name, jobSummary(order)].filter(Boolean).join(": ");
	return (
		<article className="flex flex-col gap-3 rounded-[26px] bg-card p-4">
			<button type="button" onClick={onOpen} className="flex flex-col gap-3 text-left outline-none">
				<span className="flex items-center gap-3.5">
					<MakeTile make={vehicle?.make} size={72} />
					<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
						<span className="truncate text-[13px] font-medium tracking-[0.02em] text-muted-foreground uppercase">{eyebrow}</span>
						<span className="line-clamp-2 text-[17px] leading-[22px] font-semibold">{jobHeadline(order)}</span>
						<span className="flex min-w-0 items-center gap-1.5">
							<IosPill color={status.color} className="h-5 rounded-full text-[12px] font-semibold">{status.label}</IosPill>
							<span className="truncate text-[15px] text-muted-foreground">{meta}</span>
						</span>
					</span>
				</span>
				<span className="flex items-baseline gap-2 text-[15px] leading-5 text-muted-foreground">
					<Sparkles className="size-3.5 shrink-0 translate-y-0.5" aria-hidden />
					<span className="line-clamp-2">{summary}</span>
				</span>
			</button>
			<div className="flex items-center gap-2.5">
				{action && (
					<button type="button" onClick={action.run} className="flex h-9 items-center gap-2 rounded-full bg-foreground px-3.5 text-[15px] font-semibold text-background active:opacity-70">
						<action.icon className="size-4" aria-hidden /> {action.label}
					</button>
				)}
				<span className="flex-1" />
				{customer?.phone && (
					<a href={`tel:${customer.phone}`} aria-label="Sună clientul" className="flex size-10 items-center justify-center rounded-full border bg-card shadow-sm active:opacity-70">
						<Phone className="size-4 fill-current" aria-hidden />
					</a>
				)}
				<JobMenu order={order} customer={customer} onOpen={onOpen}>
					<button type="button" aria-label="Mai multe" className="flex size-10 items-center justify-center rounded-full bg-foreground/[0.08] active:opacity-70">
						<MoreHorizontal className="size-5" aria-hidden />
					</button>
				</JobMenu>
			</div>
		</article>
	);
}

/** The closed jobs, 40 at a time: the next ones come as the end scrolls into view (the iPhone's list is lazy too). */
function ClosedList({ rows, money, gross, onOpen }) {
	const [shown, setShown] = useState(40);
	const end = useRef(null);
	useEffect(() => {
		const el = end.current;
		if (!el) return;
		const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setShown((n) => n + 40), { rootMargin: "600px 0px" });
		observer.observe(el);
		return () => observer.disconnect();
	}, [shown, rows.length]);
	return (
		<ul className="overflow-hidden rounded-[20px] bg-card">
			{rows.slice(0, shown).map((r, i) => (
				<li key={r.order.id} className={cn(i > 0 && "border-t [border-image:linear-gradient(to_right,transparent_64px,var(--border)_64px)_1]")}>
					<ClosedRow row={r} money={money} gross={gross(r.order)} onOpen={() => onOpen(r.order)} />
				</li>
			))}
			{shown < rows.length && <li ref={end} aria-hidden className="h-px" />}
		</ul>
	);
}

/** WorkOrderRow: the make's round logo, the car, plate · client, the state; the amount and the number at the right. */
function ClosedRow({ row, money, gross, onOpen }) {
	const { order, vehicle, customer } = row;
	const status = statusOf(order.status);
	return (
		<button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: makeColor(vehicle?.make) }}>
				<MakeLogo make={vehicle?.make} className="size-5 text-white" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
				<span className="truncate text-[17px] leading-[22px]">{vehicleName(vehicle) || "Fără mașină"}</span>
				<span className="truncate text-[15px] text-muted-foreground">{[vehicle?.plate && formatPlate(vehicle.plate), customer?.name].filter(Boolean).join(" · ")}</span>
				<IosPill color={status.color} className="mt-0.5 h-5 self-start rounded-full text-[12px] font-semibold">{status.label}</IosPill>
			</span>
			<span className="flex shrink-0 flex-col items-end gap-0.5">
				{order.lines?.length > 0 && <span className="text-[17px] font-semibold tabular-nums">{money(gross)}</span>}
				<span className="text-[12px] text-muted-foreground tabular-nums">#{order.number}</span>
			</span>
		</button>
	);
}
