"use client";

import { useState } from "react";
import { Check, KeyRound, MessageCircle, PackageCheck, PackageSearch, ReceiptText, Star, ThumbsUp, Wrench } from "lucide-react";
import { CardAction, CardButton, CardSection, SectionCard, capGroups } from "@/components/ds/card-section";
import { Money } from "@/components/ds/data";
import { kindCard } from "@/components/ds/tone";
import { whatsappHref } from "@/domain/customer";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { estimateMessage, readyMessage } from "@/domain/work-order";
import { fmtDays, fmtWorkOrder, plural } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { orderKind, orderLook } from "@/lib/record-state";
import { openSheet } from "@/lib/sheets";
import { invoiceForWorkOrder, restoreWorkOrder, setWorkOrderStatus } from "@/lib/store/actions";
import { useCollection } from "@/lib/store/hooks";
import { toast } from "@/lib/toast";
import { invoiceFlow } from "@/domain/flow";
import { selectPaymentsByInvoice } from "@/lib/store/selectors";
import { alertSummary } from "@/features/calendar/booking-warnings";
import { alertsFor, behindOf, orderExtras } from "./card-extras";
import { VisitCard, visitFacts } from "./visit-card";
import { rangeText } from "./visit-ui";

const MAX_CARDS = 30; // then "+N în Lucrări"

/** A group's name: its stage, in the plural. */
const GROUP_LABEL = { estimate: "De aprobat", approved: "Aprobate", in_progress: "În lucru", waiting_parts: "Așteaptă piese", ready: "Gata", delivered: "Predate" };

/** What each section is called in its sentences. */
const WORDS = {
	jobs: { label: "Lucrări", kind: "job", none: "Nicio lucrare", value: "în lucrări", parts: "Lucrările, pe etape", one: "lucrare", many: "lucrări" },
	estimates: { label: "Devize", kind: "estimate", none: "Niciun deviz", value: "în devize", parts: "Devizele, pe stări", one: "deviz", many: "devize" },
};

/** Whole days from an instant to today. */
const daysSince = (instant, today) => (instant ? Math.max(0, diffDaysISO(dayOfInstant(instant), today)) : 0);

/**
 * What the clock says about a job on its card, where the in-service wording does not fit: how long an
 * estimate has waited for the customer (marked from a day on, as its warning is), when it was approved,
 * how long it has waited for parts (marked from two days, as its warning is), when it was handed over.
 * null: the card's usual line ("de 2 h în service", "gata de 2 zile").
 */
function jobTiming(order, today) {
	switch (order.status) {
		case "estimate": {
			const days = daysSince(order.dates?.estimate ?? order.createdAt, today);
			return { text: days ? `deviz de ${plural(days, "zi", "zile")}` : "deviz de azi", mark: days >= 1 ? "wait" : null };
		}
		case "approved":
			return { text: `aprobat ${fmtDays(-daysSince(order.dates?.approved ?? order.createdAt, today))}`, mark: null };
		case "waiting_parts": {
			const days = daysSince(order.dates?.waiting_parts ?? order.createdAt, today);
			return { text: days ? `piese de ${plural(days, "zi", "zile")}` : "piese de azi", mark: days >= 2 ? "wait" : null };
		}
		case "delivered":
			return { text: `predat ${fmtDays(-daysSince(order.dates?.delivered ?? order.createdAt, today))}`, mark: null };
		default:
			return null;
	}
}

/** A job read as the dashboard's visits are (src/domain/visit.js), so its card says what every card says. */
const asVisit = (order) => ({
	id: order.id,
	kind: "walkin",
	appointment: null,
	order,
	stage: order.status,
	start: order.createdAt,
	end: order.createdAt,
	day: dayOfInstant(order.createdAt),
	vehicleId: order.vehicleId ?? null,
	customerId: order.customerId ?? null,
	staffId: order.staffId ?? null,
});

/**
 * "Lucrări" and "Devize" on Azi, in the cards form: the jobs created in the day ruler's dates or due in them, grouped by stage
 * (src/domain/agenda.js, jobsToShow). A card is the visit card of the job's car; its corner carries the
 * job's next step in one tap, with undo (approve, start, done, parts arrived) or a message to the customer
 * (send the estimate, tell them it is ready). The stages are the section's parts: chips over the cards and a half donut
 * beside them, either of which keeps one stage.
 * `kind`: "jobs" or "estimates"; `data` is selectJobs' or selectEstimates' result.
 */
export function JobStrip({ kind, data, lookups, today, range = null }) {
	const openDetail = useOpenDetail();
	const appointments = useCollection("appointments");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const [filter, setFilter] = useState(null);
	const words = WORDS[kind];
	const { customers, vehicles, settings } = lookups;
	const byInvoice = selectPaymentsByInvoice(payments);
	// What needs attention on a job's booking (the calendar's check: overrun, parts, pickup), for its card's line.
	const alertOf = alertsFor({ appointments, staff: lookups.staff, settings, now: lookups.nowAt });
	// A filter on a stage that has since emptied is no filter.
	const active = filter && data.groups.some((group) => group.key === filter) ? filter : null;
	const when = range ? ` ${rangeText(range, today)}` : "";

	const { groups, hidden } = capGroups(
		data.groups
			.filter((group) => !active || group.key === active)
			.map((group) => ({
				key: group.key,
				label: GROUP_LABEL[group.key],
				items: group.items,
			})),
		MAX_CARDS,
	);
	const parts = data.groups.map((group) => ({ key: group.key, label: GROUP_LABEL[group.key], value: group.items.length, tone: WORK_ORDER_STATUS[group.key].tone }));

	return (
		<CardSection
			large
			gestures
			label={words.label}
			kind={words.kind}
			count={data.total}
			href="/work-orders/"
			parts={{ parts, value: active, onChange: setFilter, label: words.parts, unit: data.total === 1 ? words.one : words.many }}
			aside={
				data.amount > 0 ? (
					<p className="leading-tight">
						<span className="font-semibold tabular-nums">
							<Money value={data.amount} decimals={0} />
						</span>{" "}
						<span className="text-muted-foreground">{words.value}</span>
					</p>
				) : null
			}
			filter={active ? { label: GROUP_LABEL[active], onClear: () => setFilter(null) } : null}
			groups={groups}
			empty={{ text: `${words.none}${when}.`, action: { label: "Primire mașină", icon: Wrench, onClick: () => openSheet("checkin") } }}
			filteredOut={active ? `${words.none} „${GROUP_LABEL[active]}”${when}.` : null}
			more={hidden > 0 ? { text: `+${hidden} în Lucrări`, href: "/work-orders/" } : null}
			renderCard={(order) => {
				const customer = customers[order.customerId] ?? null;
				const vehicle = vehicles[order.vehicleId] ?? null;
				const appointment = order.appointmentId ? (appointments[order.appointmentId] ?? null) : null;
				const facts = visitFacts(asVisit(order), lookups);
				const timing = jobTiming(order, today) ?? facts.timing;
				const state = orderLook(order, { today, appointment });
				const phone = customer?.phone;
				const step = (to, done) => () => {
					try {
						setWorkOrderStatus(order.id, to);
						toast.success(`${fmtWorkOrder(order.number)}: ${done}`, {
							action: {
								label: "Anulează",
								onClick: () => {
									try {
										restoreWorkOrder(order, appointment);
									} catch (error) {
										toast.error(error.message);
									}
								},
							},
						});
					} catch (error) {
						toast.error(error.message);
					}
				};
				const send = phone ? <CardAction icon={MessageCircle} label="Trimite" title={`Trimite devizul ${fmtWorkOrder(order.number)} pe WhatsApp`} href={whatsappHref(phone, estimateMessage({ order, customer, vehicle, settings }))} /> : null;
				const invoice = order.invoiceId ? invoices[order.invoiceId] : null;
				const live = invoice && invoice.status !== "cancelled" ? invoice : null;
				const makeInvoice = () => {
					try {
						const draft = invoiceForWorkOrder(order.id);
						openDetail("invoice", draft.id);
					} catch (error) {
						toast.error(error.message);
					}
				};
				// The next step first, filled, and one more move (the owner's pick, 7 Nov 2026).
				let actions = null;
				if (order.status === "estimate")
					actions = (
						<>
							<CardAction primary icon={ThumbsUp} label="Aprobă" title={`Clientul a aprobat devizul ${fmtWorkOrder(order.number)}`} onClick={step("approved", "deviz aprobat")} />
							{send}
						</>
					);
				else if (order.status === "approved")
					actions = (
						<>
							<CardAction primary icon={Wrench} label="Începe lucrul" title={`Începe lucrul la ${fmtWorkOrder(order.number)}`} onClick={step("in_progress", "în lucru")} />
							{send}
						</>
					);
				else if (order.status === "in_progress")
					actions = (
						<>
							<CardAction primary icon={Check} label="Gata" title={`Gata: ${fmtWorkOrder(order.number)}`} onClick={step("ready", "gata")} />
							<CardAction icon={PackageSearch} label="Așteaptă piese" title={`${fmtWorkOrder(order.number)} așteaptă piese`} onClick={step("waiting_parts", "așteaptă piese")} />
						</>
					);
				else if (order.status === "waiting_parts")
					actions = <CardAction primary icon={PackageCheck} label="Au venit piesele" title={`Au venit piesele pentru ${fmtWorkOrder(order.number)}`} onClick={step("in_progress", "în lucru din nou")} />;
				else if (order.status === "ready")
					actions = (
						<>
							{live && live.status !== "draft" ? (
								<CardAction primary icon={KeyRound} label="Predat" title={`Mașina de la ${fmtWorkOrder(order.number)} a fost predată`} onClick={step("delivered", "predat")} />
							) : (
								<CardAction primary icon={ReceiptText} label="Facturează" title={`Factura pentru ${fmtWorkOrder(order.number)}`} onClick={makeInvoice} />
							)}
							{phone && <CardAction icon={MessageCircle} label="Anunță" title={`Anunță pe WhatsApp că ${facts.name} e gata`} href={whatsappHref(phone, readyMessage({ customer, vehicle, settings }))} />}
						</>
					);
				else if (order.status === "delivered")
					actions = <CardAction primary icon={Star} label="Cere recenzie" title={`Cere părerea clientului pentru ${fmtWorkOrder(order.number)}`} onClick={() => openSheet("review", { workOrderId: order.id })} />;
				const kindOf = orderKind(order);
				const flow = live && live.status !== "draft" && today ? invoiceFlow(live, { payments: byInvoice.get(live.id) ?? [], today }) : null;
				const alert = alertOf(appointment, order);
				const label = [`Lucrarea ${fmtWorkOrder(order.number)}`, facts.name, facts.plate, facts.subject, facts.customer, facts.mechanic?.name, timing?.text, state.text, alertSummary(alert)].filter(Boolean).join(" · ");
				return (
					<SectionCard key={order.id} actions={actions} behind={behindOf(kindOf, { appointment, order })} reserve={kind === "jobs" ? 2 : 1}>
						<CardButton data-work-order={order.id} onClick={() => openDetail("work-order", order.id)} aria-label={label} look={kindCard(kindOf)}>
							<VisitCard
								facts={{ ...facts, kind: kindOf, timing, state }}
								extras={orderExtras(order, { now: lookups.nowAt, today, appointment, mechanic: facts.mechanic, alert, invoice: flow, currency: settings.currency })}
								actions={Boolean(actions)}
							/>
						</CardButton>
					</SectionCard>
				);
			}}
		/>
	);
}
