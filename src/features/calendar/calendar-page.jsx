"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowUpDown, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { addDaysISO, dayOfInstant, isISODate } from "@/domain/dates";
import { bookingAlert } from "@/domain/booking-warnings";
import { bookingMark } from "@/domain/visit";
import { fmtDate, plural } from "@/lib/format";
import { useLocalPreference, useMediaQuery, useNowMinute } from "@/lib/hooks";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { updateSettings } from "@/lib/store/actions";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import { ProgramariSwitch } from "@/features/appointments/programari-switch";
import { BookingPeek } from "./booking-peek";
import { CalendarSettings, MiniMonth } from "./calendar-panel";
import { CalendarSearch, useCalendarSearch, useSearchIndex } from "./calendar-search";
import { FloatingMonth } from "./floating-month";
import { DayRows } from "./day-rows";
import { DayStrip } from "./day-strip";
import { MonthPages } from "./month-pages";
import { MonthStrip } from "./month-strip";
import { useReschedule } from "./use-reschedule";

const VIEWS = [
	{ value: "day", label: "Zi", key: "D" },
	{ value: "week", label: "Săptămână", key: "W" },
	{ value: "month", label: "Lună", key: "M" },
];
const VIEW_VALUES = VIEWS.map((v) => v.value);

function parseList(text) {
	try {
		const list = JSON.parse(text);
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

/** "Octombrie 2026", or "Octombrie – Noiembrie 2026" when the days in view cross a month. */
function titleOf(view, seen, fallback) {
	if (!seen) return fmtDate(fallback, "MMMM yyyy");
	if (view === "month") return fmtDate(`${seen.month}-01`, "MMMM yyyy");
	const from = seen.from ?? seen.day;
	const to = seen.to ?? from;
	if (from.slice(0, 7) === to.slice(0, 7)) return fmtDate(from, "MMMM yyyy");
	return from.slice(0, 4) === to.slice(0, 4) ? `${fmtDate(from, "MMMM")} – ${fmtDate(to, "MMMM yyyy")}` : `${fmtDate(from, "MMM yyyy")} – ${fmtDate(to, "MMM yyyy")}`;
}

function CalendarSkeleton() {
	return (
		<div className="flex h-[calc(100dvh-3.5rem-var(--safe-top)-var(--tabbar-h)-var(--safe-bottom))] flex-col md:h-dvh">
			<div className="flex items-center gap-3 border-b px-4 py-3">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="ml-auto h-9 w-64" />
			</div>
			<div className="flex min-h-0 flex-1">
				<Skeleton className="m-4 flex-1 rounded-xl" />
			</div>
		</div>
	);
}

/**
 * The calendar (docs/APPOINTMENTS-AND-NAV.md D11–D20), in Notion Calendar's manner: a big month
 * title that follows the scroll and a search after it, a floating mini month, the settings (mechanics, statuses, how it is drawn) in a collapsible,
 * Zi · Săptămână · Lună as a menu (D, W, M), Azi (T) and ‹ › (← →). Zi and Săptămână are one
 * endless strip of days, Lună endless weeks. The day and the view are kept in the address
 * (?day=…&view=…&id=…), so the home page and a booking's sheet open it where they mean.
 */
export function CalendarPage() {
	const ready = useIsReady();
	const today = useToday();
	const settings = useSettings();
	const prefs = settings.calendar;
	const params = useSearchParams();
	const openDetail = useOpenDetail();
	const reschedule = useReschedule();
	const desktop = useMediaQuery("(min-width: 1024px)");
	const appointmentsMap = useCollection("appointments");
	const staffMap = useCollection("staff");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const services = useCollection("services");
	const workOrders = useCollection("workOrders");
	const staff = selectActive(staffMap);

	const [storedView, setStoredView] = useLocalPreference("garaj.calendar.view", "week", VIEW_VALUES);
	// The floating mini month (desktop): shown or closed; and the settings under the header: open or folded.
	const [miniPref, setMiniPref] = useLocalPreference("garaj.calendar.panel", "open", ["open", "closed"]);
	const [settingsPref, setSettingsPref] = useLocalPreference("garaj.calendar.settings", "closed", ["open", "closed"]);
	// Which way time scrolls (days, weeks, months): sideways or up and down. Per device: it follows the mouse or trackpad in hand.
	const [direction, setDirection] = useLocalPreference("garaj.calendar.scroll", "horizontal", ["horizontal", "vertical"]);
	const [hiddenStaffText, setHiddenStaffText] = useLocalPreference("garaj.calendar.staff", "[]");
	const [hiddenStatusText, setHiddenStatusText] = useLocalPreference("garaj.calendar.statuses", '["cancelled"]');
	const hiddenStaff = parseList(hiddenStaffText);
	const hiddenStatuses = parseList(hiddenStatusText);

	// The address wins the first time (a link from Azi or a booking); after that, the choices made here.
	const paramView = VIEW_VALUES.includes(params.get("view")) ? params.get("view") : null;
	const paramDay = isISODate(params.get("day") ?? "") ? params.get("day") : null;
	const paramId = params.get("id");
	const [view, setViewState] = useState(paramView);
	const currentView = view ?? storedView;
	const [opening, setOpening] = useState(null); // where a remounted strip opens: { day }
	const [seen, setSeen] = useState(null); // what the strip says is in view: { day, from, to, month }
	const [miniMonth, setMiniMonth] = useState(null); // the mini month's month, when moved by hand
	const [phonePanel, setPhonePanel] = useState(false);
	const [selected, setSelected] = useState(paramId);
	const strip = useRef(null);
	const gridArea = useRef(null); // where the booking details look for cards under the mouse, and the mini month floats
	const searchInput = useRef(null);

	const allByDay = selectAppointmentsByDay(appointmentsMap);
	const hasUnassigned = useMemo(() => Object.values(appointmentsMap).some((a) => a.status !== "cancelled" && (!a.staffId || staffMap[a.staffId]?.active === false || !staffMap[a.staffId])), [appointmentsMap, staffMap]);
	const visibleStaff = staff.filter((s) => !hiddenStaff.includes(s.id));
	const byDay = useMemo(() => {
		const hidden = new Set(hiddenStaff);
		const statuses = new Set(hiddenStatuses);
		const map = new Map();
		for (const [day, list] of allByDay) {
			const kept = list.filter((a) => {
				if (statuses.has(a.status)) return false;
				const active = a.staffId && staffMap[a.staffId] && staffMap[a.staffId].active !== false;
				return active ? !hidden.has(a.staffId) : !hidden.has("none");
			});
			if (kept.length) map.set(day, kept);
		}
		return map;
		// The lists are compared by their text: a new array with the same ids is the same filter.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [allByDay, hiddenStaffText, hiddenStatusText, staffMap]);

	// Zi: a column (⇄) or band (⇅) per mechanic shown, and "Nealocat" when a booking has nobody; the avatar stays on every booking.
	// Săptămână: one column per day. Either way, a booking made with one mechanic shown goes to that mechanic.
	const singleStaff = visibleStaff.length === 1 ? visibleStaff[0].id : undefined;
	const withUnassigned = hasUnassigned && !hiddenStaff.includes("none");
	const columns = useMemo(() => {
		if (currentView === "day" && visibleStaff.length + (withUnassigned ? 1 : 0) > 1) {
			const list = visibleStaff.map((s) => ({ key: s.id, staffId: s.id, name: s.name, label: s.name.split(" ")[0], color: s.color }));
			if (withUnassigned) list.push({ key: "none", staffId: null, name: "Nealocat", label: "Nealocat", color: "neutral" });
			return list;
		}
		return [{ key: "all", staffId: singleStaff, name: "", label: "", color: "neutral" }];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentView, staff, hiddenStaffText, withUnassigned, singleStaff]);
	const keyOf = useMemo(() => {
		const keys = new Set(columns.map((c) => c.key));
		return columns.length === 1 ? () => "all" : (a) => (keys.has(a.staffId) ? a.staffId : "none");
	}, [columns]);
	const orders = useMemo(() => Object.values(workOrders), [workOrders]);
	// The job each booking became (the booking's own link first, then the job's).
	const orderOf = useMemo(() => {
		const map = new Map();
		for (const order of orders) if (order.appointmentId) map.set(order.appointmentId, order);
		for (const a of Object.values(appointmentsMap)) if (a.workOrderId && workOrders[a.workOrderId]) map.set(a.id, workOrders[a.workOrderId]);
		return map;
	}, [appointmentsMap, orders, workOrders]);
	// Each booking's mark on its card (calendar, wrench, check): booked, a job since the car came in, or finished.
	const marks = useMemo(() => {
		const map = new Map();
		for (const a of Object.values(appointmentsMap)) map.set(a.id, bookingMark(a, orderOf.get(a.id) ?? null));
		return map;
	}, [appointmentsMap, orderOf]);
	// What needs attention on each booking (docs/WARNINGS.md), for its card's outline and sign: once a minute,
	// against every booking of its day (the filters do not hide a conflict). The fixes are found when one is opened.
	const nowMinute = useNowMinute();
	const alerts = useMemo(() => {
		const map = new Map();
		if (nowMinute == null) return map;
		const now = new Date().toISOString();
		const active = selectActive(staffMap);
		for (const list of allByDay.values()) {
			for (const a of list) {
				if (a.status === "cancelled" || a.status === "no_show" || a.status === "done") continue;
				const alert = bookingAlert(a, { now, order: orderOf.get(a.id) ?? null, sameDay: list, staff: active, hours: settings.hours });
				if (alert) map.set(a.id, alert);
			}
		}
		return map;
	}, [allByDay, orderOf, staffMap, settings.hours, nowMinute]);
	const searchIndex = useSearchIndex({ appointments: appointmentsMap, workOrders, customers, vehicles, staff: staffMap, services, orderOf });
	const search = useCalendarSearch(searchIndex);
	const found = search.result;
	const lookups = useMemo(
		() => ({ customers, vehicles, services, staff: staffMap, marks, alerts, match: found?.ids ?? null, matchOrders: found?.orders ?? null }),
		[customers, vehicles, services, staffMap, marks, alerts, found],
	);
	// Shown under the filters (a search still finds the hidden ones, and opens them in their sheet).
	const shownIds = useMemo(() => {
		const set = new Set();
		for (const list of byDay.values()) for (const a of list) set.add(a.id);
		return set;
	}, [byDay]);

	const live = useRef(null); // this render's changeView, for the key handler
	// Keys, as Notion's: D, W, M for the view, T for today, ← → to step. Never while typing or in a dialog.
	useEffect(() => {
		const onKey = (event) => {
			if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
			if (event.target.closest?.("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
			if (event.key === "/") {
				searchInput.current?.focus();
				event.preventDefault();
				return;
			}
			const key = event.key.toLowerCase();
			const next = { d: "day", w: "week", m: "month" }[key];
			if (next) live.current.changeView(next);
			else if (key === "t") strip.current?.today();
			else if (event.key === "ArrowRight") strip.current?.step(1);
			else if (event.key === "ArrowLeft") strip.current?.step(-1);
			else return;
			event.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const selectedAppointment = selected ? appointmentsMap[selected] : null;
	const initialDay = opening?.day ?? paramDay ?? (selectedAppointment ? dayOfInstant(selectedAppointment.start) : today);

	const changeView = (next) => {
		if (next === currentView) return;
		// The day in view stays in view: today when it is among the days shown (or in the month shown), otherwise the first of them.
		const day = !seen ? initialDay : currentView === "month" ? (today.slice(0, 7) === seen.month ? today : `${seen.month}-01`) : seen.from <= today && today <= seen.to ? today : seen.day;
		setOpening({ day });
		setSeen(null);
		setViewState(next);
		setStoredView(next);
	};
	useEffect(() => {
		live.current = { changeView };
	});

	const lastSearch = useRef(null);
	useEffect(() => {
		if (!found) {
			lastSearch.current = null;
			return;
		}
		if (found.query === lastSearch.current || !seen) return;
		lastSearch.current = found.query;
		const list = found.bookings.filter((r) => shownIds.has(r.id));
		if (!list.length) return;
		const inView = (r) => {
			const day = dayOfInstant(r.start);
			return currentView === "month" ? day.slice(0, 7) === seen.month : day >= seen.from && day <= seen.to;
		};
		if (list.some(inView)) return;
		const now = new Date().toISOString();
		const best = list.find((r) => r.start >= now) ?? list.at(-1);
		const at = new Date(best.start);
		strip.current?.goTo(dayOfInstant(best.start), { minute: at.getHours() * 60 + at.getMinutes() });
		queueMicrotask(() => setSelected(best.id)); // in focus too, once the glide has begun
	}, [found, seen, shownIds, currentView]);

	if (!ready || !today) return <CalendarSkeleton />;

	const miniOpen = desktop && miniPref === "open";
	const settingsOpen = settingsPref === "open";
	const shownMonth = miniMonth ?? (seen ? (currentView === "month" ? seen.month : (seen.day ?? initialDay).slice(0, 7)) : initialDay.slice(0, 7));
	const range = seen ? { from: seen.from, to: seen.to } : null;

	const onView = (next) => {
		setSeen((prev) => (prev && prev.day === next.day && prev.from === next.from && prev.to === next.to && prev.month === next.month ? prev : next));
		if (next.settled) {
			setMiniMonth(null);
			// The address follows, so a reload (or a shared link) opens here.
			const query = new URLSearchParams(window.location.search);
			query.set("day", next.day);
			query.set("view", currentView);
			window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
		}
	};
	const pickDay = (day) => {
		setPhonePanel(false);
		strip.current?.goTo(day);
	};
	/** The other direction: the strip is rebuilt the other way round, on the day in view. */
	const turn = (next) => {
		if (next === direction) return;
		setOpening({ day: currentView === "month" && seen ? `${seen.month}-01` : (seen?.day ?? initialDay) });
		setSeen(null);
		setDirection(next);
	};
	const openDay = (day) => {
		if (currentView === "day") return;
		setOpening({ day });
		setSeen(null);
		setViewState("day");
		setStoredView("day");
	};
	const create = (input = {}) => openSheet("appointment", input);
	// A booking whose car came in is a job (the wrench, or the check once finished): its card opens the job's sheet.
	const open = (appointment) => {
		setSelected(appointment.id);
		const order = orderOf.get(appointment.id);
		if (order && marks.get(appointment.id) !== "booking") openSheet("work-order-view", { id: order.id });
		else openDetail("appointment", appointment.id);
	};
	const move = async (appointment, change) => {
		if (await reschedule(appointment, change)) setSelected(appointment.id);
	};
	const toggleIn = (text, set, key, on) => {
		const list = parseList(text).filter((k) => k !== key);
		set(JSON.stringify(on ? list : [...list, key]));
	};
	const monthNode = (fill) => <MiniMonth month={shownMonth} onMonth={setMiniMonth} today={today} range={range} busy={byDay} matchDays={found?.days ?? null} onPick={pickDay} fill={fill} />;
	const settingsPanel = (layout) => (
		<CalendarSettings
			layout={layout}
			staff={staff}
			hiddenStaff={hiddenStaff}
			onStaff={(id, on) => toggleIn(hiddenStaffText, setHiddenStaffText, id, on)}
			hasUnassigned={hasUnassigned}
			hiddenStatuses={hiddenStatuses}
			onStatus={(status, on) => toggleIn(hiddenStatusText, setHiddenStatusText, status, on)}
			prefs={prefs}
			onPrefs={(patch) => updateSettings({ calendar: { ...prefs, ...patch } })}
			direction={direction}
			onDirection={turn}
		/>
	);
	// How many filters hide something (Anulat hidden is the default, not a filter).
	const filtersOn = hiddenStaff.length + hiddenStatuses.filter((status) => status !== "cancelled").length;
	// A result of the search: into view (and in focus), or, hidden by the filters or a job nobody booked, its sheet.
	const jumpTo = (record) => {
		if (record.kind === "job") {
			openSheet("work-order-view", { id: record.id });
			return;
		}
		if (!shownIds.has(record.id)) {
			open(record.appointment);
			return;
		}
		const at = new Date(record.start);
		setSelected(record.id);
		strip.current?.goTo(dayOfInstant(record.start), { minute: at.getHours() * 60 + at.getMinutes() });
	};
	const showHidden = () => {
		setHiddenStaffText("[]");
		setHiddenStatusText("[]");
	};
	const title = titleOf(currentView, seen, initialDay);
	// Under the title: the day (or days, or month) in view and how many bookings it has, as shown (the filters apply).
	const countIn = (from, to) => {
		let count = 0;
		for (let day = from; day <= to; day = addDaysISO(day, 1)) count += byDay.get(day)?.length ?? 0;
		return count;
	};
	const inView = (() => {
		if (currentView === "month") {
			const month = seen?.month ?? initialDay.slice(0, 7);
			const last = addDaysISO(`${addDaysISO(`${month}-28`, 4).slice(0, 7)}-01`, -1);
			return { label: `în ${fmtDate(`${month}-01`, "MMMM")}`, count: countIn(`${month}-01`, last) };
		}
		if (currentView === "week") {
			const from = seen?.from ?? initialDay;
			const to = seen?.to ?? addDaysISO(from, 6);
			return { label: from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${fmtDate(to, "d MMMM")}` : `${fmtDate(from, "d MMM")} – ${fmtDate(to, "d MMM")}`, count: countIn(from, to) };
		}
		const day = seen?.day ?? initialDay;
		return { label: `${day === today ? "Azi, " : ""}${fmtDate(day, day === today ? "d MMMM" : "EEEE, d MMMM")}`, count: countIn(day, day) };
	})();
	const foundIn = (() => {
		if (!found) return null;
		const [from, to] = currentView === "month" ? (() => { const month = seen?.month ?? initialDay.slice(0, 7); return [`${month}-01`, addDaysISO(`${addDaysISO(`${month}-28`, 4).slice(0, 7)}-01`, -1)]; })() : currentView === "week" ? [seen?.from ?? initialDay, seen?.to ?? addDaysISO(seen?.from ?? initialDay, 6)] : [seen?.day ?? initialDay, seen?.day ?? initialDay];
		let n = 0;
		for (let day = from; day <= to; day = addDaysISO(day, 1)) for (const a of byDay.get(day) ?? []) if (found.ids.has(a.id)) n += 1;
		return n;
	})();
	const inViewText = `${inView.label} · ${foundIn != null ? `${foundIn} din ${inView.count} găsite` : plural(inView.count, "programare", "programări")}`;
	const titleBlock = (
		<span className="flex min-w-0 flex-col">
			<span aria-live="polite" className="truncate text-lg font-semibold tracking-tight first-letter:uppercase md:text-[1.75rem] md:leading-9">
				{title}
			</span>
			<span data-in-view className="truncate text-xs text-muted-foreground first-letter:uppercase md:text-sm">
				{inViewText}
			</span>
		</span>
	);
	const nothingShown = byDay.size === 0 && allByDay.size > 0;
	const stripProps = { ref: strip, today, settings, byDay, lookups, colorBy: prefs.colorBy, selectedId: selected, initialDay, onView, onOpen: open, onCreate: create };

	return (
		<div className="flex h-[calc(100dvh-3.5rem-var(--safe-top)-var(--tabbar-h)-var(--safe-bottom))] md:h-dvh">
			<h1 className="sr-only">Calendar</h1>
			<div className="flex min-w-0 flex-1 flex-col">
				{/* The top bar: the controls on the first line; under them the big title, then the search (and the settings, desktop). */}
				<header className="border-b px-3 py-2 md:border-b-0 md:px-4 md:pt-3 md:pb-2">
					<div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 md:gap-x-2">
						{!desktop && (
							<>
								<button type="button" onClick={() => setPhonePanel(true)} className="-mx-1 flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left hover:bg-accent" aria-label={`${title}. Deschide luna și filtrele.`}>
									{titleBlock}
									<ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
								</button>
								<Button variant="ghost" size="icon" className="size-11" onClick={() => setPhonePanel(true)} aria-label="Filtre și luna">
									<SlidersHorizontal />
									{filtersOn > 0 && <span className="sr-only">{filtersOn} filtre active</span>}
								</Button>
							</>
						)}
					<div className="flex shrink-0 items-center gap-1.5 max-md:w-full md:ml-auto">
						<ProgramariSwitch current="/calendar/" className="max-md:flex-1 max-sm:[&_[data-label]]:sr-only" />
						<Button
							variant="outline"
							size="icon"
							className="size-11 shrink-0 md:size-9"
							onClick={() => turn(direction === "horizontal" ? "vertical" : "horizontal")}
							aria-label={direction === "horizontal" ? "Derulare: stânga–dreapta. Schimbă în sus–jos." : "Derulare: sus–jos. Schimbă în stânga–dreapta."}
							title={direction === "horizontal" ? "Derulare: stânga–dreapta (apasă pentru sus–jos)" : "Derulare: sus–jos (apasă pentru stânga–dreapta)"}
							data-scroll-direction={direction}
						>
							{direction === "horizontal" ? <ArrowLeftRight /> : <ArrowUpDown />}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="max-md:h-11 max-md:px-2.5" aria-label={`Vizualizare: ${VIEWS.find((v) => v.value === currentView).label}`}>
									<span className="max-sm:hidden">{VIEWS.find((v) => v.value === currentView).label}</span>
									<span className="sm:hidden">{VIEWS.find((v) => v.value === currentView).label.slice(0, 3)}</span>
									<ChevronDown className="opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-48">
								{VIEWS.map((option) => (
									<DropdownMenuItem key={option.value} onSelect={() => changeView(option.value)}>
										<Check className={cn(option.value !== currentView && "opacity-0")} /> {option.label}
										<DropdownMenuShortcut>{option.key}</DropdownMenuShortcut>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Button variant="outline" className="max-md:h-11" onClick={() => strip.current?.today()} title="Azi (T)">
							Azi
						</Button>
						<span className="flex max-sm:hidden">
							<Button variant="ghost" size="icon" className="size-9" onClick={() => strip.current?.step(-1)} aria-label={currentView === "month" ? "Luna anterioară" : currentView === "week" ? "Săptămâna anterioară" : "Ziua anterioară"} title="←">
								<ChevronLeft />
							</Button>
							<Button variant="ghost" size="icon" className="size-9" onClick={() => strip.current?.step(1)} aria-label={currentView === "month" ? "Luna următoare" : currentView === "week" ? "Săptămâna următoare" : "Ziua următoare"} title="→">
								<ChevronRight />
							</Button>
						</span>
						{desktop && !miniOpen && (
							<Button variant="ghost" size="icon" className="size-9" onClick={() => setMiniPref("open")} aria-label="Arată minicalendarul" title="Arată minicalendarul">
								<CalendarDays />
							</Button>
						)}
					</div>
					</div>
					{desktop ? (
						<div className="mt-1 flex items-end gap-4">
							<div className="min-w-0 shrink">{titleBlock}</div>
							<CalendarSearch search={search} shown={(id) => shownIds.has(id)} selectedId={selected} now={new Date().toISOString()} lookups={lookups} onJump={jumpTo} onShowHidden={showHidden} inputRef={searchInput} className="mb-0.5 ml-auto w-full max-w-md" />
							<Button
								variant={settingsOpen ? "secondary" : "outline"}
								className="mb-0.5 shrink-0"
								onClick={() => setSettingsPref(settingsOpen ? "closed" : "open")}
								aria-expanded={settingsOpen}
								aria-controls="calendar-settings"
								aria-label={`Setări calendar${filtersOn ? `, ${filtersOn} filtre active` : ""}`}
								title="Mecanici, stări și afișare"
							>
								<SlidersHorizontal /> Setări
								{filtersOn > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] leading-4 font-semibold text-brand-foreground tabular-nums">{filtersOn}</span>}
								<ChevronDown className={cn("opacity-60 transition-transform", settingsOpen && "rotate-180")} />
							</Button>
						</div>
					) : (
						<CalendarSearch search={search} shown={(id) => shownIds.has(id)} selectedId={selected} now={new Date().toISOString()} lookups={lookups} onJump={jumpTo} onShowHidden={showHidden} inputRef={searchInput} className="mt-2" />
					)}
				</header>
				{/* The settings, folded under the header (desktop): the mechanics, the statuses, how it is drawn. */}
				{desktop && (
					<div id="calendar-settings" className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", settingsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
						<div className="min-h-0 overflow-hidden" inert={!settingsOpen}>
							<div className="border-b px-4 pt-1 pb-4">{settingsPanel("columns")}</div>
						</div>
					</div>
				)}
				<div ref={gridArea} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<BookingPeek host={gridArea} />
					{miniOpen && (
						<FloatingMonth area={gridArea} onClose={() => setMiniPref("closed")}>
							{monthNode(true)}
						</FloatingMonth>
					)}
					{currentView === "month" ? (
						direction === "vertical" ? (
							<MonthStrip key={`month:v:${opening?.day ?? ""}`} {...stripProps} onPickDay={openDay} />
						) : (
							<MonthPages key={`month:h:${opening?.day ?? ""}`} {...stripProps} onPickDay={openDay} />
						)
					) : direction === "vertical" ? (
						<DayRows
							key={`${currentView}:v:${opening?.day ?? ""}:${columns.length}`}
							{...stripProps}
							view={currentView}
							allByDay={allByDay}
							columns={columns}
							keyOf={keyOf}
							onReschedule={move}
							onPickDay={openDay}
						/>
					) : (
						<DayStrip
							key={`${currentView}:${opening?.day ?? ""}:${columns.length}`}
							{...stripProps}
							view={currentView}
							allByDay={allByDay}
							columns={columns}
							keyOf={keyOf}
							orders={orders}
							showService={prefs.showService !== false}
							onOpenOrder={(order) => openDetail("work-order", order.id)}
							onReschedule={move}
							onPickDay={openDay}
						/>
					)}
					{nothingShown && (
						<p className="pointer-events-auto absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-sm">
							Filtrele ascund toate programările.
							<button
								type="button"
								className="font-medium underline-offset-2 hover:underline"
								onClick={() => {
									setHiddenStaffText("[]");
									setHiddenStatusText('["cancelled"]');
								}}
							>
								Arată tot
							</button>
						</p>
					)}
				</div>
			</div>
			{!desktop && (
				<Sheet open={phonePanel} onOpenChange={setPhonePanel} title="Calendar" description={title}>
					<div className="flex flex-col gap-5">
						{monthNode(false)}
						{settingsPanel("stack")}
					</div>
				</Sheet>
			)}
		</div>
	);
}

