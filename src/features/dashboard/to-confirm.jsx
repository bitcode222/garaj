"use client";

import { CalendarCheck, CalendarPlus, CarFront, Phone, UserX } from "lucide-react";
import { CardButton, CardSection, CornerButton, PartMark, SectionCard, SectionLine, capGroups } from "@/components/ds/card-section";
import { addDaysISO, dayOfInstant } from "@/domain/dates";
import { telHref } from "@/domain/customer";
import { fmtDate } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { callOffAppointmentById, restoreAppointment, setAppointmentStatus } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { VisitCard, visitFacts } from "./visit-card";
import { stageClass } from "./visit-ui";

const MAX_CARDS = 30; // then "+N în Programări"

/** The week's bookings by status, for the line under the section: what is still to confirm is hatched. */
const WEEK_PARTS = [
	{ key: "scheduled", label: "De confirmat", outline: true },
	{ key: "confirmed", label: "Confirmate" },
	{ key: "arrived", label: "Sosite" },
	{ key: "done", label: "Finalizate" },
	{ key: "no_show", label: "Neprezentate" },
];

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
 * day (Confirmă from the card). Under them, the week's bookings by status.
 * `data` is selectToConfirm's result; `lookups` is visitFacts'.
 */
export function ToConfirm({ data, lookups, today }) {
	const openDetail = useOpenDetail();
	const tomorrow = addDaysISO(today, 1);

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

	// At most MAX_CARDS cards, in order; the rest is one card that leads to Programări.
	const { groups, hidden } = capGroups(
		data.groups.map((group) => {
			const past = group.key === "past";
			return {
				key: group.key,
				label: past ? "Au trecut" : group.day === today ? "Azi" : group.day === tomorrow ? "Mâine" : fmtDate(group.day, "EEE, d MMM"),
				mark: <PartMark tone="yellow" outline={!past} />,
				items: group.items.map((appointment) => ({ appointment, past })),
			};
		}),
		MAX_CARDS,
	);

	const week = data.week;
	const parts = WEEK_PARTS.filter((part) => week[part.key] > 0 || part.key === "scheduled").map((part) => ({ ...part, value: week[part.key], tone: APPOINTMENT_STATUS[part.key].tone }));
	const booked = WEEK_PARTS.reduce((sum, part) => sum + week[part.key], 0);

	return (
		<CardSection
			label="De confirmat"
			count={data.total}
			href="/appointments/?status=to-confirm"
			groups={groups}
			empty={{ text: "Toate programările din următoarele 7 zile sunt confirmate.", action: { label: "Programare nouă", icon: CalendarPlus, onClick: () => openSheet("appointment") } }}
			more={hidden > 0 ? { text: `+${hidden} în Programări`, href: "/appointments/?status=to-confirm" } : null}
			renderCard={({ appointment, past }) => {
				const facts = visitFacts(asVisit(appointment), lookups);
				const number = appointment.number != null ? `#${appointment.number}` : null;
				const title = `Programare${number ? ` ${number}` : ""}`;
				const phone = lookups.customers[appointment.customerId]?.phone;
				const label = [title, facts.name, facts.plate, facts.subject, facts.customer, facts.mechanic?.name, facts.timing?.text, facts.anchor, APPOINTMENT_STATUS[appointment.status].label].filter(Boolean).join(" · ");
				return (
					<SectionCard
						key={appointment.id}
						corner={
							past ? (
								<>
									<CornerButton icon={CarFront} label={`A sosit: ${facts.name}. Deschide primirea.`} title="A sosit: primire" onClick={() => openSheet("checkin", { appointmentId: appointment.id })} />
									<CornerButton icon={UserX} label={`Neprezentat: ${facts.name}`} title="Neprezentat" onClick={() => noShow(appointment, facts.name)} />
								</>
							) : (
								<>
									{phone && <CornerButton quiet icon={Phone} label={`Sună: ${facts.customer ?? facts.name}`} title="Sună clientul" href={telHref(phone)} />}
									<CornerButton icon={CalendarCheck} label={`Confirmă: ${facts.name}, ${facts.anchor}`} title="Clientul a confirmat" onClick={() => confirm(appointment, facts.name)} />
								</>
							)
						}
					>
						<CardButton data-booking={appointment.id} onClick={() => openDetail("appointment", appointment.id)} aria-label={label} look={stageClass("scheduled")}>
							<VisitCard facts={{ ...facts, number }} topPad={past || phone ? "pr-[4.75rem]" : "pr-8"} />
						</CardButton>
					</SectionCard>
				);
			}}
		>
			<SectionLine parts={parts} label="Programările din următoarele 7 zile" note={booked ? `${booked - week.scheduled - week.no_show} din ${booked} confirmate` : null} />
		</CardSection>
	);
}
