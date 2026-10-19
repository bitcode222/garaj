"use client";

import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { FlowLinks, FlowNumber } from "@/components/ds/flow-links";
import { StatusBadge, ToneBadge } from "@/components/ds/tone";
import { formatInvoiceNumber } from "@/domain/invoice";
import { reviewState } from "@/domain/review";
import { fmtDate, fmtWorkOrder } from "@/lib/format";
import { INVOICE_STATE, REVIEW_STATE, WORK_ORDER_STATUS } from "@/lib/labels";
import { detailHref } from "@/lib/detail-mode";
import { closeSheet, openSheet, walkSheet } from "@/lib/sheets";
import { useCollection, useToday } from "@/lib/store/hooks";
import { selectInvoiceStates } from "@/lib/store/selectors";

// The flow strip of each record of a visit (docs/VISIT-FLOW.md §4–5): what came before it
// and what comes after, read from the store on every render, so a record created, deleted
// or cancelled anywhere changes the strip at once.

const SHEETS = { appointment: "appointment-view", "work-order": "work-order-view", invoice: "invoice-view", review: "review" };

/**
 * Going to another record of the visit. Inside a sheet it walks (the sheet is replaced,
 * sliding from the arrow's side); on a page it opens the record's page, or its sheet for a
 * booking or a review (they have no page). A record that is the page under the sheet is
 * simply uncovered.
 */
export function useWalk(inSheet) {
	const router = useRouter();
	return ({ kind, id, direction, props = { id } }) => {
		const page = kind === "work-order" || kind === "invoice" ? detailHref(kind, id) : null;
		const here = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;
		if (inSheet) {
			if (page && page === here) closeSheet();
			else walkSheet(SHEETS[kind], props, direction);
			return;
		}
		if (page) router.push(page);
		else openSheet(SHEETS[kind], props);
	};
}

const findBy = (collection, test) => Object.values(collection ?? {}).find(test) ?? null;

/** The booking's strip: nothing before it; after it, its job, or the way to start one. */
export function AppointmentLinks({ appointment, inSheet = true, onReschedule }) {
	const walk = useWalk(inSheet);
	const workOrders = useCollection("workOrders");
	const order = (appointment.workOrderId && workOrders[appointment.workOrderId]) || findBy(workOrders, (o) => o.appointmentId === appointment.id);

	let next;
	if (order) {
		next = {
			label: (
				<>
					Lucrarea <FlowNumber>{fmtWorkOrder(order.number)}</FlowNumber>
				</>
			),
			badge: <StatusBadge map={WORK_ORDER_STATUS} value={order.status} size="sm" />,
			onClick: () => walk({ kind: "work-order", id: order.id, direction: "forward" }),
		};
	} else if (appointment.status === "cancelled" || appointment.status === "no_show") {
		next = {
			label: "Începe lucrarea",
			verb: true,
			disabled: true,
			reason: appointment.status === "no_show" ? "Clientul nu s-a prezentat." : "Programarea e anulată.",
			fix: onReschedule ? { label: "Reprogramează", onClick: onReschedule } : null,
		};
	} else if (appointment.status === "done") {
		next = { label: "Vizita s-a încheiat", done: true };
	} else {
		next = { label: "Începe lucrarea", verb: true, onClick: () => openSheet("checkin", { appointmentId: appointment.id }) };
	}
	return <FlowLinks back={null} next={next} />;
}

/** The job's strip: its booking (or none: a walk-in), and its invoice or the way to make one. */
export function JobLinks({ order, inSheet = false, onInvoice, onLines, onReactivate }) {
	const walk = useWalk(inSheet);
	const today = useToday();
	const appointments = useCollection("appointments");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const appointment = (order.appointmentId && appointments[order.appointmentId]) || findBy(appointments, (a) => a.workOrderId === order.id);
	const invoice = order.invoiceId ? invoices[order.invoiceId] : null;
	const live = invoice && invoice.status !== "cancelled" ? invoice : null;
	const state = live && today ? (selectInvoiceStates(invoices, payments, today).get(live.id)?.state ?? live.status) : null;

	const back = appointment
		? {
				label: (
					<>
						Programarea <FlowNumber>{appointment.number != null ? `#${appointment.number}` : ""}</FlowNumber>
					</>
				),
				meta: fmtDate(appointment.start, "d MMM, HH:mm"),
				onClick: () => walk({ kind: "appointment", id: appointment.id, direction: "back" }),
			}
		: { label: "Fără programare" };

	let next;
	if (live) {
		next = {
			label:
				live.status === "draft" ? (
					"Ciorna facturii"
				) : (
					<>
						Factura <FlowNumber>{formatInvoiceNumber(live.series, live.number)}</FlowNumber>
					</>
				),
			badge: state ? <StatusBadge map={INVOICE_STATE} value={state} size="sm" /> : null,
			onClick: () => walk({ kind: "invoice", id: live.id, direction: "forward" }),
		};
	} else if (order.status === "cancelled") {
		next = { label: "Facturează", verb: true, disabled: true, reason: "Lucrarea e anulată.", fix: onReactivate ? { label: "Reactivează", onClick: onReactivate } : null };
	} else if (!order.lines?.length) {
		next = { label: "Facturează", verb: true, disabled: true, reason: "Adaugă o operațiune ca să facturezi.", fix: onLines ? { label: "Adaugă", onClick: onLines } : null };
	} else {
		next = { label: invoice ? "Facturează din nou" : "Facturează", verb: true, onClick: onInvoice };
	}
	return <FlowLinks back={back} next={next} />;
}

/** The review's look in a strip: the admin's stars when given, else how far the request got. */
function reviewBadge(review) {
	if (review.rating) {
		return (
			<ToneBadge tone="yellow" size="sm">
				<Star className="size-3 fill-current" aria-hidden />
				{review.rating}
			</ToneBadge>
		);
	}
	return <StatusBadge map={REVIEW_STATE} value={reviewState(review)} size="sm" icon={false} />;
}

/** The invoice's strip: its job (or the invoice a credit note cancels), and the review of the visit. */
export function InvoiceLinks({ invoice, inSheet = false }) {
	const walk = useWalk(inSheet);
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const reviews = useCollection("reviews");
	const order = invoice.workOrderId ? workOrders[invoice.workOrderId] : null;
	const original = invoice.stornoOf ? invoices[invoice.stornoOf] : null;
	const creditNote = invoice.stornoId ? invoices[invoice.stornoId] : null;

	let back;
	if (original) {
		back = {
			label: (
				<>
					Factura <FlowNumber>{formatInvoiceNumber(original.series, original.number)}</FlowNumber>
				</>
			),
			meta: "stornată de aceasta",
			onClick: () => walk({ kind: "invoice", id: original.id, direction: "back" }),
		};
	} else if (order) {
		back = {
			label: (
				<>
					Lucrarea <FlowNumber>{fmtWorkOrder(order.number)}</FlowNumber>
				</>
			),
			badge: <StatusBadge map={WORK_ORDER_STATUS} value={order.status} size="sm" />,
			onClick: () => walk({ kind: "work-order", id: order.id, direction: "back" }),
		};
	} else {
		back = { label: "Fără lucrare" };
	}

	let next;
	if (invoice.stornoOf) {
		next = { label: "Nu are pas următor" };
	} else if (invoice.status === "cancelled" && creditNote) {
		next = {
			label: (
				<>
					Stornarea <FlowNumber>{formatInvoiceNumber(creditNote.series, creditNote.number)}</FlowNumber>
				</>
			),
			onClick: () => walk({ kind: "invoice", id: creditNote.id, direction: "forward" }),
		};
	} else if (!order) {
		next = { label: "Recenzia se cere pentru o lucrare" };
	} else {
		const review = findBy(reviews, (r) => r.workOrderId === order.id);
		const open = () => walk({ kind: "review", id: order.id, direction: "forward", props: { workOrderId: order.id } });
		next = review ? { label: "Recenzie", badge: reviewBadge(review), onClick: open } : { label: "Cere recenzie", verb: true, onClick: open };
	}
	return <FlowLinks back={back} next={next} />;
}

/** The review's strip: back to the invoice of the visit (or its job, when it has no invoice); the visit ends here. */
export function ReviewLinks({ order, inSheet = true }) {
	const walk = useWalk(inSheet);
	const invoices = useCollection("invoices");
	const invoice = order?.invoiceId ? invoices[order.invoiceId] : null;
	const live = invoice && invoice.status !== "cancelled" ? invoice : null;
	let back;
	if (live) {
		back = {
			label:
				live.status === "draft" ? (
					"Ciorna facturii"
				) : (
					<>
						Factura <FlowNumber>{formatInvoiceNumber(live.series, live.number)}</FlowNumber>
					</>
				),
			onClick: () => walk({ kind: "invoice", id: live.id, direction: "back" }),
		};
	} else if (order) {
		back = {
			label: (
				<>
					Lucrarea <FlowNumber>{fmtWorkOrder(order.number)}</FlowNumber>
				</>
			),
			onClick: () => walk({ kind: "work-order", id: order.id, direction: "back" }),
		};
	} else back = null;
	return <FlowLinks back={back} next={{ label: "Vizita e încheiată", done: true }} />;
}
