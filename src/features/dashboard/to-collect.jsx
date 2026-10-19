"use client";

import { useState } from "react";
import { MessageCircle, ReceiptText } from "lucide-react";
import { CardButton, CardSection, CornerButton, PartMark, SectionCard, SectionLine, capGroups } from "@/components/ds/card-section";
import { Money } from "@/components/ds/data";
import { whatsappHref } from "@/domain/customer";
import { dayOfInstant, diffDaysISO } from "@/domain/dates";
import { formatInvoiceNumber, invoiceMessage } from "@/domain/invoice";
import { formatMoney } from "@/domain/money";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtWorkOrder, plural } from "@/lib/format";
import { INVOICE_STATE } from "@/lib/labels";
import { useOpenDetail } from "@/lib/detail-mode";
import { useRouter } from "next/navigation";
import { createInvoiceDraft } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { tone } from "@/lib/tones";
import { VisitCard } from "./visit-card";

const MAX_CARDS = 30; // then "+N în Facturi"

/** A group's name: the states, in the plural. */
const GROUP_LABEL = { overdue: "Restante", partial: "Parțial plătite", issued: "Emise", draft: "Ciorne" };

/** A card's tint: its state's tone; a draft is only outlined, as a booking still to confirm. */
const lookOf = (state) => (state === "draft" ? "border-dashed border-foreground/30 bg-card text-foreground hover:bg-accent/60" : tone(INVOICE_STATE[state].tone).block);

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
 * else is in the invoice's sheet. The line under it is by amount and filters the cards.
 * `data` is selectToCollect's result. Every amount comes from the domain.
 */
export function ToCollect({ data, lookups, today }) {
	const openDetail = useOpenDetail();
	const router = useRouter();
	const [filter, setFilter] = useState(null);
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
			.map((group) => ({ key: group.key, label: GROUP_LABEL[group.key], mark: <PartMark tone={INVOICE_STATE[group.key].tone} outline={group.key === "draft"} />, items: group.items })),
		MAX_CARDS,
	);
	const parts = data.groups.map((group) => ({
		key: group.key,
		label: GROUP_LABEL[group.key],
		value: Math.max(group.amount, 1), // an empty draft still shows
		display: formatMoney(group.amount, currency, { decimals: 0 }),
		tone: INVOICE_STATE[group.key].tone,
		outline: group.key === "draft",
	}));
	const shown = groups.reduce((sum, group) => sum + group.items.length, 0);

	return (
		<CardSection
			label="Facturi"
			count={data.total}
			countText={active ? `${shown + hidden} din ${data.total}` : undefined}
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
			empty={{ text: "Totul e încasat: nicio factură restantă, neîncasată sau ciornă.", action: { label: "Factură nouă", icon: ReceiptText, onClick: newInvoice } }}
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
				};
				const phone = !draft ? customer?.phone : null;
				const label = [number, facts.name, facts.number, subject, facts.customer, timing.text, `${state === "draft" ? "total" : "rest"} ${formatMoney(balance, currency)}`, INVOICE_STATE[state].label].filter(Boolean).join(" · ");
				return (
					<SectionCard
						key={invoice.id}
						corner={
							phone ? (
								<CornerButton
									quiet={state !== "overdue"}
									icon={MessageCircle}
									label={`Trimite pe WhatsApp un memento pentru ${number}`}
									title="Memento pe WhatsApp"
									href={whatsappHref(phone, invoiceMessage({ invoice, balance, settings }))}
								/>
							) : null
						}
					>
						<CardButton data-invoice={invoice.id} onClick={() => openDetail("invoice", invoice.id)} aria-label={label} look={lookOf(state)}>
							<VisitCard facts={facts} topPad={phone ? "pr-8" : ""} />
						</CardButton>
					</SectionCard>
				);
			}}
		>
			<SectionLine parts={parts} value={active} onChange={setFilter} label="Arată o singură stare a facturilor" />
		</CardSection>
	);
}
