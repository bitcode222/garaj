"use client";

import { useState } from "react";
import { CalendarCheck, CalendarClock, CalendarPlus, CarFront, Phone, UserX, Wrench } from "lucide-react";
import { CardAction, CardButton, CardSection, SectionCard, capGroups } from "@/components/ds/card-section";
import { kindCard } from "@/components/ds/tone";
import { dayOfInstant } from "@/domain/dates";
import { telHref } from "@/domain/customer";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { bookingLook } from "@/lib/record-state";
import { openSheet } from "@/lib/sheets";
import { callOffAppointmentById, restoreAppointment, setAppointmentStatus } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { alertSummary } from "@/features/calendar/booking-warnings";
import { alertsFor, bookingExtras } from "./card-extras";
import { VisitCard, visitFacts } from "./visit-card";
import { rangeText } from "./visit-ui";

const MAX_CARDS = 30; // then "+N în Programări"

/** A booking as the calendar's visits are (src/domain/visit.js), so its card reads like every other. */
const asVisit = (appointment) => ({
	id: appointment.id,
	kind: "booking",
	appointment,
	order: null,
	stage: "scheduled",
	start: appointment.start,
	end: appointment.end,
	day: dayOfInstant(appointment.start),
	vehicleId: appointment.vehicleId,
	customerId: appointment.customerId,
	staffId: appointment.staffId,
});

/** The types of the bookings, in the order their groups are shown (the unconfirmed ones first). */
const GROUP_LABEL = { upcoming: "De confirmat", past: "Au trecut", confirmed: "Confirmate", arrived: "Sosite", done: "Finalizate", no_show: "Neprezentate" };
const TYPE_ORDER = Object.keys(GROUP_LABEL);

/** A type's colour, in the state colours (docs/RECORD-COLORS.md): the passed ones red, the ones still to confirm hatched, each other status in its own. */
const typeTone = (key) => (key === "past" ? { tone: "red" } : key === "upcoming" ? { tone: "yellow", outline: true } : { tone: APPOINTMENT_STATUS[key].tone });

/** A booking's type: passed with nothing recorded, still to confirm, or its status. */
const typeOf = (appointment, past) => (past ? "past" : appointment.status === "scheduled" ? "upcoming" : appointment.status);

/** Every change from a card can be taken back from its toast, as in the booking's sheet. */
function undoTo(previous) {
	return {
		label: "Anulează",
		onClick: () => {
			try {
				restoreAppointment(previous);
			} catch (error) {
				toast.error(error.message);
			}
		},
	};
}

/**
 * "De confirmat" on Azi (docs/HOME-PAGE.md D6): the bookings that wait for the shop, in the
 * cards form. First the ones whose time passed with nothing recorded ("Au trecut": A sosit or
 * Neprezentat from the card), then the unconfirmed ones of the next seven days, a group per
 * day (Confirmă from the card), then the others of those days by status. The types are the section's parts: chips over
 * the cards and a half donut beside them, either of which keeps one type. Each card is in the bookings' colour with
 * its state's dot.
 * `data` is selectToConfirm's result; `lookups` is visitFacts'.
 */
export function ToConfirm({ data, lookups, today, range }) {
	const when = rangeText(range, today);
	const openDetail = useOpenDetail();
	// The chips and the half donut keep one type; a type with nothing in it is no filter.
	const [filter, setFilter] = useState(null);
	// What needs attention on each booking, against its day (the calendar's check), for its card's line.
	const alertOf = alertsFor({ appointments: lookups.appointments, staff: lookups.staff, settings: lookups.settings, now: lookups.nowAt });

	const confirm = (appointment, name) => {
		try {
			setAppointmentStatus(appointment.id, "confirmed");
			toast.success(`${name}: programare confirmată`, { action: undoTo(appointment) });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const noShow = (appointment, name) => {
		try {
			const { previous } = callOffAppointmentById(appointment.id, { to: "no_show" });
			toast.success(`${name}: marcată neprezentat`, { action: undoTo(previous) });
		} catch (error) {
			toast.error(error.message);
		}
	};

	// Grouped by type, in TYPE_ORDER; each type's bookings sorted by time (the passed ones latest first). At most MAX_CARDS cards; the rest is one card that leads to Programări.
	const byType = new Map(TYPE_ORDER.map((key) => [key, []]));
	for (const group of data.groups) {
		const past = group.key === "past";
		for (const appointment of group.items) byType.get(typeOf(appointment, past)).push({ appointment, past });
	}
	const active = filter && byType.get(filter)?.length ? filter : null;
	const { groups, hidden } = capGroups(
		TYPE_ORDER.filter((key) => byType.get(key).length && (!active || key === active)).map((key) => {
			const items = byType.get(key).sort((a, b) => (a.appointment.start < b.appointment.start ? -1 : a.appointment.start > b.appointment.start ? 1 : 0));
			if (key === "past") items.reverse();
			return { key, label: GROUP_LABEL[key], items };
		}),
		MAX_CARDS,
	);
	const parts = TYPE_ORDER.map((key) => ({ key, label: GROUP_LABEL[key], ...typeTone(key), value: byType.get(key).length }));

	// How many of those days' bookings the customers confirmed (or came to).
	const week = data.week;
	const booked = week.scheduled + week.confirmed + week.arrived + week.done + week.no_show;

	return (
		<CardSection
			large
			gestures
			label="Programări"
			kind="appointment"
			parts={{ parts, value: active, onChange: setFilter, label: `Programările ${when}, pe tipuri`, unit: data.total === 1 ? "programare" : "programări" }}
			aside={
				booked > 0 ? (
					<p className="leading-tight">
						<span className="font-semibold tabular-nums">
							{booked - week.scheduled - week.no_show} din {booked}
						</span>{" "}
						<span className="text-muted-foreground">confirmate</span>
					</p>
				) : null
			}
			filter={active ? { label: GROUP_LABEL[active], onClear: () => setFilter(null) } : null}
			filteredOut={`Nicio programare „${GROUP_LABEL[active ?? "upcoming"]}” ${when}.`}
			count={data.total}
			href="/appointments/?status=to-confirm"
			groups={groups}
			empty={{ text: `Nicio programare ${when}.`, action: { label: "Programare nouă", icon: CalendarPlus, onClick: () => openSheet("appointment") } }}
			more={hidden > 0 ? { text: `+${hidden} în Programări`, href: "/appointments/?status=to-confirm" } : null}
			renderCard={({ appointment, past }) => {
				const facts = visitFacts(asVisit(appointment), lookups);
				const state = bookingLook(appointment, lookups.nowAt);
				const number = appointment.number != null ? `#${appointment.number}` : null;
				const title = `Programare${number ? ` ${number}` : ""}`;
				const phone = lookups.customers[appointment.customerId]?.phone;
				const order = appointment.workOrderId ? lookups.workOrders?.[appointment.workOrderId] : null;
				const alert = alertOf(appointment, order);
				const label = [title, facts.name, facts.plate, facts.subject, facts.customer, facts.mechanic?.name, facts.timing?.text, facts.anchor, state.text, alertSummary(alert)].filter(Boolean).join(" · ");
				const call = phone ? <CardAction icon={Phone} label="Sună" title={`Sună: ${facts.customer ?? facts.name}`} href={telHref(phone)} /> : null;
				const arrived = <CardAction primary icon={CarFront} label="A sosit" title={`A sosit: ${facts.name}. Deschide primirea.`} onClick={() => openSheet("checkin", { appointmentId: appointment.id })} />;
				// The next step first, filled, and one more move (the owner's pick, 7 Nov 2026).
				let actions = null;
				if (past)
					actions = (
						<>
							{arrived}
							<CardAction icon={UserX} label="Neprezentat" title={`Neprezentat: ${facts.name}`} onClick={() => noShow(appointment, facts.name)} />
						</>
					);
				else if (appointment.status === "scheduled")
					actions = (
						<>
							<CardAction primary icon={CalendarCheck} label="Confirmă" title={`Confirmă: ${facts.name}, ${facts.anchor}`} onClick={() => confirm(appointment, facts.name)} />
							{call}
						</>
					);
				else if (appointment.status === "confirmed")
					actions = (
						<>
							{arrived}
							{call}
						</>
					);
				else if (appointment.status === "arrived" && order)
					actions = <CardAction primary icon={Wrench} label={`Lucrarea #${order.number}`} title={`Deschide lucrarea #${order.number}`} onClick={() => openDetail("work-order", order.id)} />;
				else if (appointment.status === "no_show")
					actions = <CardAction primary icon={CalendarClock} label="Reprogramează" title={`Reprogramează: ${facts.name}`} onClick={() => openSheet("appointment", { id: appointment.id })} />;
				return (
					<SectionCard key={appointment.id} actions={actions}>
						<CardButton data-booking={appointment.id} onClick={() => openDetail("appointment", appointment.id)} aria-label={label} look={cn(kindCard("appointment"), appointment.status === "scheduled" && "border-dashed")}>
							<VisitCard facts={{ ...facts, kind: "appointment", number, state }} extras={bookingExtras(appointment, { now: lookups.nowAt, past, alert })} actions={Boolean(actions)} />
						</CardButton>
					</SectionCard>
				);
			}}
		/>
	);
}
