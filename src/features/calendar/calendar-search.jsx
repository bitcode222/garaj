"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Search, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { matchesWords, searchText, searchWords } from "@/domain/booking-search";
import { dayOfInstant } from "@/domain/dates";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { bookingMark } from "@/domain/visit";
import { fmtDate, fmtTime, fmtWorkOrder, plural } from "@/lib/format";
import { APPOINTMENT_STATUS, BOOKING_MARK, WORK_ORDER_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The calendar's search (docs/APPOINTMENTS-AND-NAV.md, search): bookings and jobs only. The text
// each one is found by is built once per change of the data; a query is matched as it settles
// (150 ms after the last key), and the calendar shows what it found: the rest fades, the days
// say how many they hold, the mini month marks them, and ‹ › walks through them in time.

const DEBOUNCE_MS = 150;
const LIST = 8;
const byStart = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

/** Everything the search looks through: each booking with its text, and the jobs nobody booked (walk-ins). */
export function useSearchIndex({ appointments, workOrders, customers, vehicles, staff, services, orderOf }) {
	return useMemo(() => {
		const bookings = Object.values(appointments).map((a) => {
			const order = orderOf.get(a.id) ?? null;
			const serviceNames = (a.serviceIds ?? []).map((id) => services[id]?.name).filter(Boolean);
			return { kind: "booking", id: a.id, start: a.start, appointment: a, order, text: searchText({ appointment: a, order, customer: customers[a.customerId], vehicle: vehicles[a.vehicleId], mechanic: staff[a.staffId], serviceNames }) };
		});
		const booked = new Set([...orderOf.values()].map((o) => o.id));
		const walkins = Object.values(workOrders)
			.filter((o) => !booked.has(o.id))
			.map((o) => ({ kind: "job", id: o.id, start: o.createdAt, order: o, text: searchText({ order: o, customer: customers[o.customerId], vehicle: vehicles[o.vehicleId], mechanic: staff[o.staffId] }) }));
		return { bookings, walkins };
	}, [appointments, workOrders, customers, vehicles, staff, services, orderOf]);
}

/**
 * The query (as typed) and what it found (as settled): `result` is null while there is nothing to
 * search; otherwise its bookings and walk-in jobs in time order, and as sets for the calendar
 * (`ids` of bookings, `orders` of jobs, `days` with a booking found).
 */
export function useCalendarSearch(index) {
	const [query, setQuery] = useState("");
	const [settled, setSettled] = useState("");
	useEffect(() => {
		const timer = setTimeout(() => setSettled(query), query.trim() ? DEBOUNCE_MS : 0);
		return () => clearTimeout(timer);
	}, [query]);
	const result = useMemo(() => {
		const words = searchWords(settled);
		if (!words) return null;
		const bookings = index.bookings.filter((r) => matchesWords(r.text, words)).sort(byStart);
		const jobs = index.walkins.filter((r) => matchesWords(r.text, words)).sort(byStart);
		return {
			query: settled,
			bookings,
			jobs,
			ids: new Set(bookings.map((r) => r.id)),
			orders: new Set([...bookings.map((r) => r.order?.id).filter(Boolean), ...jobs.map((r) => r.id)]),
			days: new Set(bookings.map((r) => dayOfInstant(r.start))),
		};
	}, [index, settled]);
	return { query, setQuery, result, settling: query.trim() !== settled.trim() && searchWords(query) != null };
}

/**
 * The search field (after the title), its list of what it found, and ‹ n / N › to walk through
 * it. `shown(id)`: the booking is shown under the calendar's filters (hidden ones still count,
 * and open in their sheet). `onJump(record)` brings one into view (or opens it).
 */
export function CalendarSearch({ search, shown, selectedId, now, lookups, onJump, onShowHidden, inputRef, className }) {
	const { query, setQuery, result, settling } = search;
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);

	// The list: what is still to come first (soonest first), then what has passed (latest first), then the walk-in jobs.
	const ordered = useMemo(() => {
		if (!result) return [];
		const ahead = result.bookings.filter((r) => r.start >= now);
		const past = result.bookings.filter((r) => r.start < now).reverse();
		return [...ahead, ...past, ...[...result.jobs].reverse()];
	}, [result, now]);
	const hidden = result ? result.bookings.filter((r) => !shown(r.id)).length : 0;
	const total = result ? result.bookings.length + result.jobs.length : 0;
	// ‹ › walk through what the calendar shows (the hidden ones are in the list, and open in their sheet).
	const walkable = result ? result.bookings.filter((r) => shown(r.id)) : [];
	const at = walkable.findIndex((r) => r.id === selectedId);

	const jump = (record) => {
		setOpen(false);
		onJump(record);
	};
	// ‹ ›: the previous or next booking in time from the one in focus (or from now when none is).
	const walk = (direction) => {
		if (!walkable.length) return;
		const list = walkable;
		let index;
		if (at >= 0) index = (at + direction + list.length) % list.length;
		else {
			const next = list.findIndex((r) => r.start >= now);
			index = direction > 0 ? (next < 0 ? 0 : next) : next <= 0 ? list.length - 1 : next - 1;
		}
		jump(list[index]);
	};

	const onKeyDown = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			if (open && query) setOpen(false);
			else {
				setQuery("");
				event.currentTarget.blur();
			}
		} else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			setOpen(true);
			const shownCount = Math.min(ordered.length, LIST);
			if (shownCount) setActive((i) => (i + (event.key === "ArrowDown" ? 1 : -1) + shownCount) % shownCount);
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (open && ordered[active]) jump(ordered[active]);
			else walk(event.shiftKey ? -1 : 1);
		}
	};

	const car = (r) => {
		const vehicle = lookups.vehicles[r.appointment?.vehicleId ?? r.order?.vehicleId];
		const customer = lookups.customers[r.appointment?.customerId ?? r.order?.customerId];
		return [vehicleName(vehicle), vehicle?.plate ? formatPlate(vehicle.plate) : null, customer?.name].filter(Boolean).join(" · ") || r.appointment?.title || "—";
	};

	return (
		<div className={cn("relative", className)}>
			<div className="flex items-center gap-1">
				<label className="relative flex min-w-0 flex-1 items-center">
					<span className="sr-only">Caută programări și lucrări</span>
					{settling ? <LoaderCircle className="pointer-events-none absolute left-2.5 size-4 animate-spin text-muted-foreground" aria-hidden /> : <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />}
					<input
						ref={inputRef}
						type="search"
						role="combobox"
						aria-expanded={open && Boolean(result)}
						aria-controls="calendar-search-results"
						aria-autocomplete="list"
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setOpen(true);
							setActive(0);
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => setTimeout(() => setOpen(false), 120)}
						onKeyDown={onKeyDown}
						placeholder="Caută mașină, număr, client, telefon, #lucrare…"
						autoComplete="off"
						spellCheck={false}
						className="h-9 w-full min-w-0 rounded-lg border bg-background pr-8 pl-8 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 max-md:h-11 md:text-sm [&::-webkit-search-cancel-button]:hidden"
					/>
					{query && (
						<button type="button" onClick={() => setQuery("")} aria-label="Golește căutarea" className="absolute right-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-md:size-9">
							<X className="size-3.5" />
						</button>
					)}
				</label>
				{walkable.length > 0 && (
					<div className="flex shrink-0 items-center" data-search-walk>
						<Button variant="ghost" size="icon" className="size-8 max-md:size-11" onClick={() => walk(-1)} aria-label="Rezultatul anterior" title="Rezultatul anterior (Shift+Enter)">
							<ChevronLeft />
						</Button>
						<span className="min-w-12 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
							{at >= 0 ? `${at + 1} / ${walkable.length}` : walkable.length}
						</span>
						<Button variant="ghost" size="icon" className="size-8 max-md:size-11" onClick={() => walk(1)} aria-label="Rezultatul următor" title="Rezultatul următor (Enter)">
							<ChevronRight />
						</Button>
					</div>
				)}
			</div>
			{open && result && (
				<div id="calendar-search-results" role="listbox" aria-label="Rezultate" className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg" onMouseDown={(event) => event.preventDefault()}>
					<p className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
						<span className="flex-1">
							{total
								? [result.bookings.length ? plural(result.bookings.length, "programare", "programări") : null, result.jobs.length ? `${plural(result.jobs.length, "lucrare", "lucrări")} fără programare` : null].filter(Boolean).join(" · ")
								: `Nimic pentru „${result.query.trim()}”`}
						</span>
						{hidden > 0 && (
							<button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={onShowHidden}>
								{plural(hidden, "ascuns", "ascunse")} de filtre · Arată
							</button>
						)}
					</p>
					{total === 0 ? (
						<p className="px-3 py-3 text-xs text-muted-foreground">Caută după mașină, număr de înmatriculare, client, telefon, operație, mecanic sau număr (#128, #1873).</p>
					) : (
						<ul className="max-h-80 overflow-y-auto py-1">
							{ordered.slice(0, LIST).map((r, i) => {
								const mark = r.kind === "job" ? "job" : bookingMark(r.appointment, r.order);
								const Icon = r.kind === "job" ? Wrench : BOOKING_MARK[mark].icon;
								const state = r.kind === "job" || (mark !== "booking" && r.order) ? WORK_ORDER_STATUS[r.order.status]?.label : APPOINTMENT_STATUS[r.appointment.status]?.label;
								const off = r.kind === "booking" && !shown(r.id);
								return (
									<li key={`${r.kind}-${r.id}`} role="option" aria-selected={i === active}>
										<button type="button" onMouseEnter={() => setActive(i)} onClick={() => jump(r)} className={cn("flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm max-md:min-h-11", i === active && "bg-accent")}>
											<Icon className={cn("mt-0.5 size-3.5 shrink-0", r.start < now ? "text-muted-foreground" : "text-foreground")} aria-hidden />
											<span className="min-w-0 flex-1">
												<span className="flex items-baseline gap-1.5">
													<span className="font-medium first-letter:uppercase tabular-nums">{r.kind === "job" ? `Lucrarea ${fmtWorkOrder(r.order.number)}` : `${fmtDate(r.start, "EEE d MMM yyyy")}, ${fmtTime(r.start)}`}</span>
													<span className="text-xs text-muted-foreground">{state}</span>
													{off && <span className="text-xs text-muted-foreground italic">· ascunsă de filtre</span>}
												</span>
												<span className="block truncate text-xs text-muted-foreground">{car(r)}</span>
											</span>
										</button>
									</li>
								);
							})}
							{ordered.length > LIST && <li className="px-3 py-1.5 text-xs text-muted-foreground">încă {ordered.length - LIST}: ‹ › le parcurge pe toate în calendar</li>}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
