"use client";

import {
	CalendarCheck,
	CalendarClock,
	CalendarX,
	CarFront,
	Check,
	Clock,
	DoorClosed,
	Eye,
	FileText,
	KeyRound,
	Layers,
	MessageCircle,
	PackageCheck,
	PackageSearch,
	Phone,
	PhoneOff,
	ShieldAlert,
	ThumbsUp,
	Timer,
	TriangleAlert,
	UserPlus,
	UserX,
	Warehouse,
	Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { bookingWarnings, jobWarnings } from "@/domain/booking-warnings";
import { telHref, whatsappHref } from "@/domain/customer";
import { dayOfInstant, addDaysISO } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { confirmationMessage } from "@/domain/reminders";
import { vehicleName } from "@/domain/vehicle";
import { estimateMessage, orderTotals, readyMessage } from "@/domain/work-order";
import { fmtDate, fmtTime, fmtWorkOrder, plural } from "@/lib/format";
import { useNowMinute } from "@/lib/hooks";
import { openSheet } from "@/lib/sheets";
import { announceAppointmentDelay, moveAppointment, rescheduleAppointmentTo, restoreAppointment, restoreWorkOrder, saveAppointment, setAppointmentStatus, setWorkOrderStatus } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { selectActive, selectAppointmentsByDay } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { fmtLength } from "@/features/dashboard/visit-ui";

// The words and the buttons for src/domain/booking-warnings.js (docs/WARNINGS.md): what exactly,
// with whom or since when, and the fix one tap away (every change with its undo).

export const SEVERITY_TONE = { danger: "red", warning: "yellow", info: "blue" };
const ICON = { missed: CalendarX, late: Clock, overlap: Layers, delayOverrun: Clock, unassigned: UserX, unconfirmed: CalendarClock, closed: DoorClosed, pickup: KeyRound, parts: PackageSearch, estimate: FileText, overrun: Timer, documents: ShieldAlert, noPhone: PhoneOff };

/** The few words a card says about a warning (its label for a screen reader). */
const SHORT = {
	missed: () => "a trecut neînregistrată",
	late: (w) => `întârzie ${fmtLength(w.minutes)}`,
	overlap: (w) => (w.with.length === 1 ? "se suprapune cu o programare" : `se suprapune cu ${w.with.length} programări`),
	delayOverrun: () => "vine după interval",
	unassigned: () => "fără mecanic",
	unconfirmed: () => "neconfirmată",
	closed: (w) => (w.closedDay ? "în zi închisă" : "în afara programului"),
	pickup: (w) => `gata de ${plural(w.days, "zi", "zile")}, nepreluată`,
	parts: (w) => `așteaptă piese de ${plural(w.days, "zi", "zile")}`,
	estimate: () => "deviz neaprobat",
	overrun: (w) => `depășește intervalul cu ${fmtLength(w.minutes)}`,
	documents: () => "acte de verificat",
	noPhone: () => "fără telefon",
};

/** "Atenție: întârzie 25 min; fără mecanic" for a card's label, or "". */
export function alertSummary(alert) {
	if (!alert?.list?.length) return "";
	return `Atenție: ${alert.list.map((w) => SHORT[w.kind]?.(w) ?? w.kind).join("; ")}`;
}

/** The card's small sign at the end of its top line: the clock for a car that is not here, the triangle otherwise. */
export function AlertSign({ alert, className }) {
	if (!alert || alert.severity === "info") return null;
	const Icon = alert.list[0].kind === "late" || alert.list[0].kind === "missed" ? Clock : TriangleAlert;
	return <Icon aria-hidden data-alert={alert.severity} className={cn("size-3 shrink-0", tone(SEVERITY_TONE[alert.severity]).text, className)} />;
}

/** The outline a card gets for its most severe warning (nothing for info). */
export const alertOutline = (alert) => (alert && alert.severity !== "info" ? cn("outline-2 outline-offset-[-2px]", tone(SEVERITY_TONE[alert.severity]).outline) : null);

const dayWord = (instant, today) => {
	const day = dayOfInstant(instant);
	if (day === today) return "azi";
	if (day === addDaysISO(today, 1)) return "mâine";
	if (day === addDaysISO(today, -1)) return "ieri";
	return fmtDate(instant, "EEEE, d MMM");
};
const firstName = (name) => String(name ?? "").split(" ")[0];

/** Everything the words and the fixes need, from the store; recomputed every minute (the clock matters). */
function useWarningContext() {
	useNowMinute();
	return {
		settings: useSettings(),
		appointments: useCollection("appointments"),
		workOrders: useCollection("workOrders"),
		staff: useCollection("staff"),
		bays: useCollection("bays"),
		vehicles: useCollection("vehicles"),
		customers: useCollection("customers"),
	};
}

const orderOfBooking = (appointment, workOrders) => (appointment.workOrderId && workOrders[appointment.workOrderId]) || Object.values(workOrders).find((o) => o.appointmentId === appointment.id) || null;

/** A change with its toast and its undo. */
function change(run, message, undo, description) {
	try {
		run();
		toast.success(message, { description, action: undo ? { label: "Anulează", onClick: () => { try { undo(); } catch (error) { toast.error(error.message); } } } : undefined });
		return true;
	} catch (error) {
		toast.error(error.message);
		return false;
	}
}

/**
 * The words (title, detail lines) and the buttons for each warning of a booking or a job.
 * `onPanel(name)` opens a panel of the booking's sheet (reschedule · no_show); without it (the
 * hover card) the sheet opens on that panel. `inJob`: shown in the job's own sheet (no "Vezi lucrarea").
 */
function describe(warnings, { appointment, order, data, now, onPanel, inJob }) {
	const { settings, staff, bays, vehicles, customers } = data;
	const today = dayOfInstant(now);
	const customer = customers[appointment?.customerId ?? order?.customerId];
	const vehicle = vehicles[appointment?.vehicleId ?? order?.vehicleId];
	const phone = customer?.phone;
	const carOf = (o) => vehicleName(vehicles[o.vehicleId]) || customers[o.customerId]?.name || o.title || "o programare";
	const subject = vehicleName(vehicle) || appointment?.title || "Programarea";
	const money = order?.lines?.length ? formatMoney(orderTotals(order, settings).gross, settings.currency) : null;
	const panel = (name) => (onPanel ? onPanel(name) : openSheet("appointment-view", { id: appointment.id, panel: name }));
	const moved = (previous, start) => (previous.status === "confirmed" ? "Trebuie confirmată din nou: anunță clientul." : undefined) ?? (dayOfInstant(start) !== dayOfInstant(previous.start) ? "Altă zi decât înainte." : undefined);

	const fixOf = (fix, w) => {
		switch (fix.id) {
			case "checkin":
				return { label: "A sosit", icon: CarFront, primary: true, onClick: () => openSheet("checkin", { appointmentId: appointment.id }) };
			case "no_show":
				return { label: "Neprezentat", icon: UserX, onClick: () => panel("no_show") };
			case "reschedule":
				return { label: "Reprogramează", icon: CalendarClock, onClick: () => panel("reschedule") };
			case "call":
				return phone ? { label: "Sună", icon: Phone, href: telHref(phone) } : null;
			case "delayBy":
				return {
					label: `Vine la ${fmtTime(fix.expectedAt)}`,
					icon: Clock,
					onClick: () => {
						let previous;
						return change(() => ({ previous } = announceAppointmentDelay(appointment.id, fix.expectedAt)), `${subject}: vine la ${fmtTime(fix.expectedAt)}`, () => restoreAppointment(previous));
					},
				};
			case "moveTo":
				return {
					label: `Mută la ${dayOfInstant(fix.start) === dayOfInstant(appointment.start) ? "" : `${fmtDate(fix.start, "EEE d MMM")}, `}${fmtTime(fix.start)}`,
					icon: CalendarClock,
					primary: w.kind === "delayOverrun" || w.kind === "closed",
					onClick: () => {
						let previous;
						return change(() => ({ previous } = rescheduleAppointmentTo(appointment.id, { start: fix.start, end: fix.end })), `${subject}: mutată la ${fmtTime(fix.start)}–${fmtTime(fix.end)}`, () => restoreAppointment(previous), moved(appointment, fix.start));
					},
				};
			case "moveOther": {
				const other = data.appointments[fix.appointmentId];
				if (!other) return null;
				return {
					label: `Mută ${carOf(other)} la ${fmtTime(fix.start)}`,
					icon: CalendarClock,
					onClick: () => {
						let previous;
						return change(() => ({ previous } = rescheduleAppointmentTo(other.id, { start: fix.start, end: fix.end })), `${carOf(other)}: mutată la ${fmtTime(fix.start)}–${fmtTime(fix.end)}`, () => restoreAppointment(previous), moved(other, fix.start));
					},
				};
			}
			case "assign": {
				const person = staff[fix.staffId];
				if (!person) return null;
				return { label: `Dă-i lui ${firstName(person.name)}`, icon: UserPlus, onClick: () => change(() => saveAppointment({ ...appointment, staffId: person.id }), `${subject}: la ${person.name}`, () => restoreAppointment(appointment)) };
			}
			case "bay": {
				const bay = bays[fix.bayId];
				if (!bay) return null;
				return { label: `Pe ${bay.name}`, icon: Warehouse, onClick: () => change(() => saveAppointment({ ...appointment, bayId: bay.id }), `${subject}: pe ${bay.name}`, () => restoreAppointment(appointment)) };
			}
			case "open": {
				const other = data.appointments[fix.appointmentId];
				return other ? { label: `Vezi ${carOf(other)}`, icon: Eye, onClick: () => openSheet("appointment-view", { id: other.id }) } : null;
			}
			case "edit":
				return { label: "Alege mecanicul", icon: UserPlus, onClick: () => openSheet("appointment", { id: appointment.id }) };
			case "confirm":
				return { label: "Confirmă", icon: CalendarCheck, primary: true, onClick: () => change(() => setAppointmentStatus(appointment.id, "confirmed"), `${subject}: confirmată`, () => restoreAppointment(appointment)) };
			case "remind":
				return phone ? { label: "Cere confirmarea", icon: MessageCircle, href: whatsappHref(phone, confirmationMessage({ appointment, customer, vehicle, settings, today })), external: true } : null;
			case "notifyReady":
				return phone ? { label: "Anunță clientul", icon: MessageCircle, primary: true, href: whatsappHref(phone, readyMessage({ customer, vehicle, settings })), external: true } : null;
			case "sendEstimate":
				return phone ? { label: "Trimite devizul", icon: MessageCircle, href: whatsappHref(phone, estimateMessage({ order, customer, vehicle, settings })), external: true } : null;
			case "openJob":
				return inJob || !order ? null : { label: "Vezi lucrarea", icon: Wrench, onClick: () => openSheet("work-order-view", { id: order.id }) };
			case "partsArrived":
			case "approve":
			case "ready": {
				const to = { partsArrived: "in_progress", approve: "approved", ready: "ready" }[fix.id];
				const label = { partsArrived: "Au venit piesele", approve: "Clientul a aprobat", ready: "Gata" }[fix.id];
				const done = { partsArrived: "în lucru din nou", approve: "deviz aprobat", ready: "gata" }[fix.id];
				const icon = { partsArrived: PackageCheck, approve: ThumbsUp, ready: Check }[fix.id];
				const previousAppointment = appointment ?? null;
				return { label, icon, primary: true, onClick: () => change(() => setWorkOrderStatus(order.id, to), `${fmtWorkOrder(order.number)}: ${done}`, () => restoreWorkOrder(order, previousAppointment)) };
			}
			case "extend":
				return { label: `Până la ${fmtTime(fix.end)}`, icon: Timer, onClick: () => change(() => moveAppointment(appointment.id, appointment.start, fix.end), `${subject}: până la ${fmtTime(fix.end)}`, () => restoreAppointment(appointment)) };
			case "openVehicle":
				return vehicle ? { label: "Vezi mașina", icon: CarFront, onClick: () => openSheet("vehicle-view", { id: vehicle.id }) } : null;
			case "editCustomer":
				return customer ? { label: "Adaugă telefon", icon: Phone, onClick: () => openSheet("customer", { id: customer.id }) } : null;
			default:
				return null;
		}
	};

	const words = (w) => {
		switch (w.kind) {
			case "missed":
				return { title: "A trecut fără să fie înregistrată", detail: [`Era ${dayWord(w.start, today)}, ${fmtTime(w.start)}–${fmtTime(w.end)}. A venit clientul?`] };
			case "late":
				return {
					title: `Întârzie ${fmtLength(w.minutes)}`,
					detail: [`${w.announced ? "Anunțase că vine la" : "Trebuia să vină la"} ${fmtTime(w.since)}.`, customer ? `${customer.name}${phone ? ` · ${phone}` : ""}` : null],
				};
			case "delayOverrun":
				return { title: "Vine după ce se termină intervalul", detail: [`Anunțat la ${fmtTime(w.expectedAt)}; intervalul se termină la ${fmtTime(w.end)}.`] };
			case "overlap":
				return {
					title: w.with.length === 1 ? `Se suprapune cu ${carOf(w.with[0])}` : `Se suprapune cu ${w.with.length} programări`,
					detail: w.with.slice(0, 3).map((o) => {
						const why = o.reason === "both" ? `același mecanic (${firstName(staff[o.staffId]?.name)}) și elevator` : o.reason === "staff" ? `același mecanic (${firstName(staff[o.staffId]?.name) || "—"})` : `același elevator (${bays[o.bayId]?.name ?? "—"})`;
						return `${w.with.length > 1 ? `${carOf(o)} · ` : ""}${fmtTime(o.start)}–${fmtTime(o.end)} · ${why}${o.status === "arrived" ? " · mașina e deja în service" : ""}`;
					}),
				};
			case "unassigned": {
				const free = w.fixes.filter((f) => f.id === "assign").map((f) => firstName(staff[f.staffId]?.name));
				return {
					title: w.inactiveId ? `${staff[w.inactiveId]?.name ?? "Mecanicul"} nu mai e activ` : "Fără mecanic",
					detail: [free.length ? `Liberi la ora asta: ${free.join(", ")}.` : "Niciun mecanic liber la ora asta."],
				};
			}
			case "unconfirmed":
				return { title: "Neconfirmată", detail: [`Începe ${w.when === "today" ? "azi" : "mâine"} la ${fmtTime(w.start)}${customer ? `; ${customer.name} nu a confirmat încă` : ""}.`] };
			case "closed":
				return {
					title: w.closedDay ? "Programată într-o zi închisă" : "În afara programului",
					detail: [w.closedDay ? `${fmtDate(appointment.start, "EEEE")} service-ul e închis (program ${w.open}–${w.close}).` : `Programul e ${w.open}–${w.close}; programarea e ${fmtTime(appointment.start)}–${fmtTime(appointment.end)}.`],
				};
			case "pickup":
				return { title: `Gata de ${plural(w.days, "zi", "zile")}, nepreluată`, detail: [[fmtWorkOrder(order.number), money].filter(Boolean).join(" · "), phone ? null : "Clientul nu are telefon."] };
			case "parts":
				return { title: `Așteaptă piese de ${plural(w.days, "zi", "zile")}`, detail: [w.what ? `Piesa: ${w.what}.` : "Nu s-a notat ce piesă."] };
			case "estimate":
				return { title: `Devizul așteaptă aprobarea de ${plural(w.days, "zi", "zile")}`, detail: [[fmtWorkOrder(order.number), money].filter(Boolean).join(" · ")] };
			case "overrun":
				return {
					title: `Depășește intervalul cu ${fmtLength(w.minutes)}`,
					detail: [`Trebuia gata la ${fmtTime(w.end)}.`, w.next ? `${firstName(staff[w.next.staffId]?.name) || "Mecanicul"} are ${carOf(w.next)} la ${fmtTime(w.next.start)}.` : null],
				};
			case "documents":
				return { title: w.docs.map((d) => `${d.doc.toUpperCase()} ${d.expired ? "expirat" : "expiră"} pe ${fmtDate(d.date, "dd.MM.yyyy")}`).join(" · "), detail: ["Spune-i clientului la vizită."] };
			case "noPhone":
				return { title: "Clientul nu are telefon", detail: ["Nu poate fi sunat sau anunțat."] };
			default:
				return { title: w.kind, detail: [] };
		}
	};

	return warnings.map((w, index) => {
		const { title, detail } = words(w);
		return { key: `${w.kind}-${index}`, kind: w.kind, severity: w.severity, icon: ICON[w.kind] ?? TriangleAlert, title, detail: detail.filter(Boolean), fixes: w.fixes.map((fix) => fixOf(fix, w)).filter(Boolean) };
	});
}

/** The list itself: one tinted box per warning (sheet), or compact lines (hover card). */
function WarningItems({ items, size, onDone, more = 0, className }) {
	if (!items.length) return null;
	const compact = size === "peek";
	const button = (fix, i) => {
		const props = {
			key: `${fix.label}-${i}`,
			size: "sm",
			variant: fix.primary && i === 0 ? "default" : "outline",
			className: cn(compact ? "h-7 gap-1 px-2 text-xs [&_svg]:size-3.5" : "max-md:h-11", !(fix.primary && i === 0) && "bg-background/80"),
		};
		if (fix.href) {
			return (
				<Button {...props} asChild>
					<a href={fix.href} target={fix.external ? "_blank" : undefined} rel={fix.external ? "noreferrer" : undefined} onClick={() => onDone?.()}>
						<fix.icon aria-hidden /> {fix.label}
					</a>
				</Button>
			);
		}
		return (
			<Button
				{...props}
				onClick={() => {
					fix.onClick();
					onDone?.();
				}}
			>
				<fix.icon aria-hidden /> {fix.label}
			</Button>
		);
	};
	return (
		<section aria-label="Atenție" data-warnings={items.length} className={cn(compact ? "space-y-2" : "space-y-2", className)}>
			{items.map((item) => (
				<div key={item.key} data-warning={item.kind} className={cn("rounded-lg border", compact ? "p-2" : "p-3", tone(SEVERITY_TONE[item.severity]).chip)}>
					<div className="flex items-start gap-2">
						<item.icon className={cn("shrink-0", compact ? "mt-px size-3.5" : "mt-0.5 size-4")} aria-hidden />
						<div className="min-w-0 flex-1">
							<p className={cn("font-medium", compact ? "text-xs" : "text-sm")}>{item.title}</p>
							{item.detail.map((line) => (
								<p key={line} className="text-xs opacity-90">
									{line}
								</p>
							))}
						</div>
					</div>
					{item.fixes.length > 0 && <div className={cn("flex flex-wrap gap-1.5", compact ? "mt-2 pl-5.5" : "mt-2.5 pl-6")}>{item.fixes.map(button)}</div>}
				</div>
			))}
			{more > 0 && <p className="text-xs text-muted-foreground">+{more} în fișa programării</p>}
		</section>
	);
}

/**
 * A booking's warnings, worded, with their fixes. `size`: "sheet" (full, 44 px buttons on the
 * phone) or "peek" (the hover card: compact, at most `limit`). `onPanel` opens a panel of the
 * booking's sheet; `onDone` runs after a fix (the hover card closes).
 */
export function BookingWarnings({ appointment, size = "sheet", limit = Infinity, onPanel, onDone, className }) {
	const data = useWarningContext();
	const customer = useEntity("customers", appointment?.customerId);
	const vehicle = useEntity("vehicles", appointment?.vehicleId);
	if (!appointment) return null;
	const now = new Date().toISOString();
	const byDay = selectAppointmentsByDay(data.appointments);
	const order = orderOfBooking(appointment, data.workOrders);
	const warnings = bookingWarnings(appointment, {
		now,
		order,
		sameDay: byDay.get(dayOfInstant(appointment.start)) ?? [],
		bookingsOn: (day) => byDay.get(day) ?? [],
		staff: selectActive(data.staff),
		bays: selectActive(data.bays),
		customer,
		vehicle,
		hours: data.settings.hours,
	});
	const items = describe(warnings, { appointment, order, data, now, onPanel, inJob: false });
	return <WarningItems items={items.slice(0, limit)} more={Math.max(0, items.length - limit)} size={size} onDone={onDone} className={className} />;
}

/** A job's warnings (ready but not collected, waiting for parts, an estimate not approved, past its booking), in its sheet. */
export function JobWarnings({ order }) {
	const data = useWarningContext();
	if (!order) return null;
	const now = new Date().toISOString();
	const appointment = (order.appointmentId && data.appointments[order.appointmentId]) || Object.values(data.appointments).find((a) => a.workOrderId === order.id) || null;
	const sameDay = appointment ? (selectAppointmentsByDay(data.appointments).get(dayOfInstant(appointment.start)) ?? []) : [];
	const warnings = jobWarnings(order, { now, appointment, sameDay });
	return <WarningItems items={describe(warnings, { appointment, order, data, now, inJob: true })} size="sheet" />;
}
