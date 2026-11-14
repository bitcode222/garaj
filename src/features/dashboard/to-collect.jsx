"use client";

import { useState } from "react";
import { Banknote, FileCheck, MessageCircle, ReceiptText } from "lucide-react";
import { CardAction, CardButton, CardSection, SectionCard, capGroups } from "@/components/ds/card-section";
import { Money } from "@/components/ds/data";
import { kindCard } from "@/components/ds/tone";
import { whatsappHref } from "@/domain/customer";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { formatInvoiceNumber, invoiceMessage } from "@/domain/invoice";
import { formatMoney } from "@/domain/money";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtWorkOrder, plural } from "@/lib/format";
import { INVOICE_STATE } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { useRouter } from "next/navigation";
import { invoiceLook } from "@/lib/record-state";
import { createInvoiceDraft } from "@/lib/store/actions";
import { useCollection } from "@/lib/store/hooks";
import { selectPaymentsByInvoice } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { behindOf, invoiceExtras } from "./card-extras";
import { VisitCard } from "./visit-card";
import { rangeText } from "./visit-ui";

const MAX_CARDS = 30; // then "+N în Facturi"

/** A group's name: the states, in the plural. */
const GROUP_LABEL = { overdue: "Restante", partial: "Parțial plătite", issued: "Emise", draft: "Ciorne" };

/** A card's tint: the invoices' colour (docs/RECORD-COLORS.md); a draft's border is dashed, as a booking still to confirm. */
const lookOf = (state) => cn(kindCard("invoice"), state === "draft" && "border-dashed");

/** What the clock says about an invoice: how late, when it is due, or how old the draft is. */
function timingOf(item, today) {
	const { state, overdueDays, dueIn, invoice } = item;
	if (state === "overdue") return { text: `restantă de ${plural(overdueDays, "zi", "zile")}`, mark: "late" };
	if (state === "draft") {
		const age = invoice.createdAt ? diffDaysISO(dayOfInstant(invoice.createdAt), today) : 0;
		return { text: age < 1 ? "ciornă de azi" : `ciornă de ${plural(age, "zi", "zile")}`, mark: null };
	}
	if (dueIn == null) return { text: "fără scadență", mark: null };
	return { text: dueIn === 0 ? "scadentă azi" : dueIn === 1 ? "scadentă mâine" : `scadentă în ${plural(dueIn, "zi", "zile")}`, mark: null };
}

/**
 * "Facturi" on Azi (docs/HOME-PAGE.md D7): every invoice not collected yet, in the cards form,
 * grouped Restante · Parțial plătite · Emise · Ciorne. A card: the job's car (a receipt
 * without one), the customer, the invoice's number and plate, what it is for, how late or when
 * it is due, and what is left to pay. A reminder goes on WhatsApp from the card; everything
 * else is in the invoice's sheet. Each card is in the invoices' colour with its state's dot. The states are the
 * section's parts, by what is left to collect: chips over the cards and a half donut beside them, either of which
 * keeps one state.
 * `data` is selectToCollect's result. Every amount comes from the domain.
 */
export function ToCollect({ data, lookups, today, range = null }) {
	const openDetail = useOpenDetail();
	const router = useRouter();
	const [filter, setFilter] = useState(null);
	const payments = useCollection("payments");
	const byInvoice = selectPaymentsByInvoice(payments);
	const { customers, vehicles, workOrders, settings } = lookups;
	const currency = settings.currency;
	// A filter on a state that has since gone (its last invoice was paid) is no filter.
	const active = filter && data.groups.some((group) => group.key === filter) ? filter : null;

	const newInvoice = () => {
		try {
			const draft = createInvoiceDraft();
			router.push(`/invoices/detail/?id=${draft.id}`);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const { groups, hidden } = capGroups(
		data.groups
			.filter((group) => !active || group.key === active)
			.map((group) => ({ key: group.key, label: GROUP_LABEL[group.key], items: group.items })),
		MAX_CARDS,
	);
	const parts = data.groups.map((group) => ({
		key: group.key,
		label: GROUP_LABEL[group.key],
		value: group.amount,
		count: group.items.length, // an empty draft still has its chip
		display: formatMoney(group.amount, currency, { decimals: 0 }),
		tone: INVOICE_STATE[group.key].tone,
		outline: group.key === "draft",
	}));

	return (
		<CardSection
			large
			gestures
			label="Facturi"
			kind="invoice"
			parts={{ parts, value: active, onChange: setFilter, label: "Facturile, pe stări, după restul de încasat", unit: "în facturi", total: formatMoney(data.due + data.drafts, currency, { decimals: 0 }) }}
			count={data.total}
			href="/invoices/"
			aside={
				data.total > 0 ? (
					<p className="leading-tight">
						<span className="font-semibold tabular-nums">
							<Money value={data.due} decimals={0} />
						</span>{" "}
						<span className="text-muted-foreground">de încasat</span>
						{data.drafts > 0 && (
							<span className="block text-xs text-muted-foreground">
								+ <Money value={data.drafts} decimals={0} /> în ciorne
							</span>
						)}
					</p>
				) : null
			}
			filter={active ? { label: GROUP_LABEL[active], onClear: () => setFilter(null) } : null}
			groups={groups}
			empty={{ text: range ? `Nicio factură de încasat, creată sau scadentă ${rangeText(range, today)}.` : "Totul e încasat: nicio factură restantă, neîncasată sau ciornă.", action: { label: "Factură nouă", icon: ReceiptText, onClick: newInvoice } }}
			more={hidden > 0 ? { text: `+${hidden} în Facturi`, href: "/invoices/" } : null}
			renderCard={(item) => {
				const { invoice, state, balance, total } = item;
				const vehicle = vehicles[invoice.vehicleId] ?? null;
				const customer = customers[invoice.customerId] ?? null;
				const order = invoice.workOrderId ? workOrders[invoice.workOrderId] : null;
				const draft = state === "draft";
				const number = formatInvoiceNumber(invoice.series, invoice.number);
				const subject = (invoice.lines ?? []).map((line) => line.description).filter(Boolean).join(", ");
				const timing = timingOf(item, today);
				const look = invoiceLook(invoice, byInvoice.get(invoice.id) ?? [], { today, currency });
				const facts = {
					vehicle,
					icon: ReceiptText,
					name: customer?.name ?? invoice.snapshot?.buyer?.name ?? "Client necunoscut",
					plate: number,
					number: vehicle?.plate ? formatPlate(vehicle.plate) : draft && order ? fmtWorkOrder(order.number) : null,
					subject,
					customer: vehicleName(vehicle) || "Fără mașină",
					mechanic: null,
					anchor: state === "partial" ? `din ${formatMoney(total, currency, { decimals: 0 })}` : draft ? "neemisă" : `emisă ${fmtDate(invoice.issueDate, "d MMM")}`,
					timing,
					gross: balance,
					state: look,
				};
				const phone = !draft ? customer?.phone : null;
				const label = [number, facts.name, facts.number, subject, facts.customer, timing.text, `${state === "draft" ? "total" : "rest"} ${formatMoney(balance, currency)}`, look.text].filter(Boolean).join(" · ");
				const appointment = order?.appointmentId ? (lookups.appointments?.[order.appointmentId] ?? null) : null;
				// The next step first, filled, and one more move (the owner's pick, 7 Nov 2026): a payment is taken on the invoice.
				const actions = draft ? (
					<CardAction primary icon={FileCheck} label="Emite factura" title={`Deschide ciorna ${facts.name} ca s-o emiți`} onClick={() => openDetail("invoice", invoice.id)} />
				) : (
					<>
						<CardAction primary icon={Banknote} label="Încasează" title={`Încasează ${number}`} onClick={() => openDetail("invoice", invoice.id)} />
						{phone && <CardAction icon={MessageCircle} label="Memento" title={`Trimite pe WhatsApp un memento pentru ${number}`} href={whatsappHref(phone, invoiceMessage({ invoice, balance, settings }))} />}
					</>
				);
				return (
					<SectionCard key={invoice.id} actions={actions} behind={behindOf("invoice", { appointment, order })} reserve={3}>
						<CardButton data-invoice={invoice.id} onClick={() => openDetail("invoice", invoice.id)} aria-label={label} look={lookOf(state)}>
							<VisitCard facts={{ ...facts, kind: "invoice" }} extras={invoiceExtras(item, { now: lookups.nowAt, today, currency })} actions />
						</CardButton>
					</SectionCard>
				);
			}}
		/>
	);
}
