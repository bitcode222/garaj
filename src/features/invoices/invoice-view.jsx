"use client";

import { Banknote } from "lucide-react";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { KeyValue, KeyValueGrid, Money } from "@/components/ds/data";
import { PlateTag } from "@/components/ds/make-logo";
import { StatusBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { formatInvoiceNumber } from "@/domain/invoice";
import { fmtDate, fmtRelativeTo } from "@/lib/format";
import { detailHref } from "@/lib/detail-mode";
import { INVOICE_STATE } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection, useEntity, useToday } from "@/lib/store/hooks";
import { selectInvoiceStates } from "@/lib/store/selectors";

/** Invoice overlay: state, amounts and who owes them. Lines, PDF and sharing are on the full page. */
export default function InvoiceView({ open, onOpenChange, id }) {
	const today = useToday();
	const invoice = useEntity("invoices", id);
	const customer = useEntity("customers", invoice?.customerId);
	const vehicle = useEntity("vehicles", invoice?.vehicleId);
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const info = invoice && today && open ? selectInvoiceStates(invoices, payments, today).get(invoice.id) : null;
	const draft = invoice?.status === "draft";
	const number = invoice ? (draft ? "Ciornă" : formatInvoiceNumber(invoice.series, invoice.number)) : "Factură";
	const balance = info?.balance ?? 0;
	const payable = invoice && invoice.status === "issued" && !invoice.stornoOf && balance > 0;
	const buyer = customer?.name ?? invoice?.snapshot?.buyer?.name;

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={invoice}
			missing="Factura a fost ștearsă."
			title={number}
			description={invoice ? `emisă ${fmtDate(invoice.issueDate)}` : undefined}
			fullPage={invoice && detailHref("invoice", invoice.id)}
			footer={
				payable && (
					<Button className="max-md:h-11" onClick={() => openSheet("payment", { invoiceId: invoice.id })}>
						<Banknote /> Încasează
					</Button>
				)
			}
		>
			{invoice && (
				<div className="space-y-5">
					<div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
						<StatusBadge map={INVOICE_STATE} value={info?.state ?? (draft ? "draft" : "issued")} />
						<Money value={invoice.totals?.gross ?? 0} className="ml-auto text-xl font-semibold" />
					</div>
					<KeyValueGrid className="sm:grid-cols-2">
						<KeyValue label="Client">
							{customer ? (
								<button type="button" className="hover:underline" onClick={() => openSheet("customer-view", { id: customer.id })}>
									{buyer}
								</button>
							) : (
								buyer
							)}
						</KeyValue>
						<KeyValue label="Mașină">{vehicle ? <PlateTag value={vehicle.plate} /> : null}</KeyValue>
						<KeyValue label="Scadență">{invoice.dueDate ? `${fmtDate(invoice.dueDate)}${today && !draft && balance > 0 ? ` · ${fmtRelativeTo(invoice.dueDate, today)}` : ""}` : null}</KeyValue>
						<KeyValue label="Rest de plată">
							<Money value={balance} className={balance > 0 ? "text-red-600 dark:text-red-400" : undefined} />
						</KeyValue>
					</KeyValueGrid>
				</div>
			)}
		</DetailSheet>
	);
}
