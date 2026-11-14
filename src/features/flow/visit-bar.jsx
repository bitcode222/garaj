"use client";

import { VisitBar } from "@/components/ds/visit-bar";
import { useConfirm } from "@/components/ds/confirm";
import { visitBar } from "@/domain/flow";
import { formatInvoiceNumber } from "@/domain/invoice";
import { reviewState } from "@/domain/review";
import { vehicleName } from "@/domain/vehicle";
import { fmtWorkOrder } from "@/lib/format";
import { RECORD_KIND, REVIEW_STATE } from "@/lib/labels";
import { flushEdits } from "@/lib/pending-edits";
import { bookingLook, invoiceLook, orderLook } from "@/lib/record-state";
import { openSheet } from "@/lib/sheets";
import { invoiceForWorkOrder, restoreWorkOrder, setWorkOrderStatus } from "@/lib/store/actions";
import { useCollection, useSettings, useToday } from "@/lib/store/hooks";
import { selectPaymentsByInvoice } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { useWalk } from "./visit-links";

// The visit bar on every record of a visit (docs/VISIT-BAR.md): it reads the visit from the store on every render, so
// a record made, moved or cancelled anywhere redraws it, and runs what a tap on a section does (the domain's
// visitBar() says what that is).

const findBy = (collection, test) => Object.values(collection ?? {}).find(test) ?? null;

/**
 * A visit, from the record open (`from`: appointment · work-order · invoice · review, whose `record` is the work
 * order). The invoice is the one open, else the job's live one (a cancelled one is reached from its credit note).
 *   { appointment, order, invoice, review, vehicle, payments } or null
 */
export function useVisit(from, record) {
	const appointments = useCollection("appointments");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const reviews = useCollection("reviews");
	const payments = useCollection("payments");
	const vehicles = useCollection("vehicles");
	if (!record) return null;
	let appointment = null;
	let order = null;
	let invoice = null;
	if (from === "appointment") {
		appointment = record;
		order = (record.workOrderId && workOrders[record.workOrderId]) || findBy(workOrders, (o) => o.appointmentId === record.id);
	} else if (from === "invoice") {
		invoice = record;
		const original = record.stornoOf ? invoices[record.stornoOf] : null;
		const orderId = record.workOrderId ?? original?.workOrderId;
		order = orderId ? (workOrders[orderId] ?? null) : null;
	} else order = record;
	if (order && !appointment) appointment = (order.appointmentId && appointments[order.appointmentId]) || findBy(appointments, (a) => a.workOrderId === order.id);
	if (!invoice && order?.invoiceId) {
		const live = invoices[order.invoiceId];
		invoice = live && live.status !== "cancelled" ? live : null;
	}
	const review = order ? findBy(reviews, (r) => r.workOrderId === order.id) : null;
	const vehicleId = record.vehicleId ?? order?.vehicleId ?? appointment?.vehicleId;
	return {
		appointment,
		order,
		invoice,
		review,
		vehicle: vehicleId ? (vehicles[vehicleId] ?? null) : null,
		payments: invoice ? (selectPaymentsByInvoice(payments).get(invoice.id) ?? []) : [],
	};
}

/** The name a visit's record goes by in its header: the car (make and model) and the record's number. */
export function visitTitle(visit, number, fallback) {
	const car = vehicleName(visit?.vehicle);
	return [car || fallback, number].filter(Boolean).join(" · ");
}

// A state that asks for attention colours the step its record is on.
const ATTENTION = ["yellow", "red"];

// What a tap makes, in words (the title of a section not made yet).
const MAKES = {
	checkin: (status) => (status === "in_progress" ? "începe lucrul la primirea mașinii" : "deschide devizul la primirea mașinii"),
	start: () => "începe lucrul",
	invoice: () => "fă factura din lucrare",
	review: () => "cere părerea clientului",
};

/**
 * The bar for the record open. `inSheet`: walking replaces the sheet (else opens the page). `onLines`: where the job's
 * operations are, for its Deviz section once the work started (the same work order).
 */
export function VisitBarFor({ from, record, inSheet = true, className }) {
	const visit = useVisit(from, record);
	const today = useToday();
	const settings = useSettings();
	const walk = useWalk(inSheet);
	const confirm = useConfirm();
	if (!visit || !today) return null;
	const { appointment, order, invoice, review, payments } = visit;
	const now = new Date().toISOString();
	const bar = visitBar({ appointment, order, invoice, review, payments, today, from });

	const looks = {
		appointment: appointment ? bookingLook(appointment, now) : null,
		order: order ? orderLook(order, { today, appointment }) : null,
		invoice: invoice ? invoiceLook(invoice, payments, { today, currency: settings.currency }) : null,
		review: { text: REVIEW_STATE[reviewState(review)].label, tone: REVIEW_STATE[reviewState(review)].tone },
	};
	const named = {
		appointment: () => `Programarea${appointment?.number != null ? ` #${appointment.number}` : ""}`,
		estimate: () => `Devizul ${fmtWorkOrder(order.number)}`,
		job: () => `Lucrarea ${fmtWorkOrder(order.number)}`,
		invoice: () => (invoice.status === "draft" ? "Ciorna facturii" : `${invoice.stornoOf ? "Stornarea" : "Factura"} ${formatInvoiceNumber(invoice.series, invoice.number)}`),
		review: () => "Recenzia",
	};
	// The look of the step a section's record is on: the order's belongs to whichever of its two sections holds it.
	const lookOf = (s) => {
		if (s.key === "appointment") return looks.appointment;
		if (s.key === "invoice") return looks.invoice;
		if (s.key === "review") return looks.review;
		return s.arcs.includes("now") || s.off ? looks.order : null;
	};

	const go = (key, direction) => {
		if (key === "appointment") walk({ kind: "appointment", id: appointment.id, direction });
		else if (key === "invoice") walk({ kind: "invoice", id: invoice.id, direction });
		else if (key === "review") walk({ kind: "review", id: order.id, direction, props: { workOrderId: order.id } });
		else walk({ kind: "work-order", id: order.id, direction });
	};
	const showLines = () => document.getElementById(`job-lines-${order.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
	const fixes = {
		reschedule: { label: "Reprogramează", onClick: () => openSheet("appointment", { id: appointment.id }) },
		reactivate: {
			label: "Reactivează",
			onClick: () => {
				try {
					setWorkOrderStatus(order.id, "estimate");
				} catch (error) {
					toast.error(error.message);
				}
			},
		},
		lines: { label: "Adaugă", onClick: () => (from === "work-order" ? showLines() : go("job", "back")) },
		checkin: { label: "Începe lucrarea", onClick: () => openSheet("checkin", { appointmentId: appointment.id }) },
	};

	const start = async (skips) => {
		if (skips && !(await confirm({ title: "Începi lucrul fără aprobarea devizului?", description: "Pasul „Aprobat” rămâne sărit; îl poți marca mai târziu din stare.", confirmLabel: "Începe lucrul" }))) return;
		flushEdits();
		const previous = order;
		try {
			setWorkOrderStatus(order.id, "in_progress");
			toast.success(`${fmtWorkOrder(order.number)}: în lucru`, {
				action: {
					label: "Anulează",
					onClick: () => {
						try {
							restoreWorkOrder(previous, appointment);
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

	const tap = (s, index) => {
		const t = s.tap;
		if (t.kind === "none") return;
		if (t.kind === "here") return showLines();
		const direction = index > bar.current ? "forward" : "back";
		if (t.kind === "walk") return go(s.key, direction);
		if (!t.allowed) return toast(t.reason, t.fix ? { action: fixes[t.fix] } : undefined);
		if (t.action === "checkin") return openSheet("checkin", { appointmentId: appointment.id, status: t.status });
		if (t.action === "start") return start(t.skips);
		if (t.action === "review") return go("review", "forward");
		if (t.action === "invoice") {
			flushEdits();
			try {
				const draft = invoiceForWorkOrder(order.id);
				walk({ kind: "invoice", id: draft.id, direction: "forward" });
			} catch (error) {
				toast.error(error.message);
			}
		}
	};

	const sections = bar.sections.map((s, index) => {
		const meta = RECORD_KIND[s.key];
		const look = s.exists || s.current ? lookOf(s) : null;
		let title;
		if (s.exists) title = `${named[s.key]()}${look ? `: ${look.text}` : ""}${s.tap.kind === "here" ? " (aceeași lucrare: vezi operațiunile)" : ""}`;
		else if (s.current) title = `${meta.label}: ${look?.text ?? "nu există încă"}`;
		else if (s.tap.kind === "create" && s.tap.allowed) title = `${meta.label}: ${MAKES[s.tap.action](s.tap.status)}`;
		else title = `${meta.label}: ${s.tap.reason}`;
		return {
			key: s.key,
			label: meta.label,
			icon: meta.icon,
			tone: meta.tone,
			exists: s.exists,
			current: s.current,
			arcs: s.arcs,
			nowTone: look && ATTENTION.includes(look.tone) ? look.tone : s.paused ? "yellow" : null,
			title: s.current ? `${title} (deschisă acum)` : title,
			disabled: s.tap.kind === "none",
			faint: !s.exists && !s.current && !(s.tap.kind === "create" && s.tap.allowed),
			onTap: () => tap(s, index),
		};
	});
	return <VisitBar sections={sections} onTap={(s) => s.onTap()} className={className} />;
}
