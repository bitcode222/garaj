"use client";

import { DetailSheet } from "@/components/ds/detail-sheet";
import { EmbeddedLinks } from "@/components/ds/embedded-links";
import { formatInvoiceNumber } from "@/domain/invoice";
import { detailHref } from "@/lib/detail-mode";
import { invoiceLook } from "@/lib/record-state";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectPaymentsByInvoice } from "@/lib/store/selectors";
import { VisitBarFor, visitTitle } from "@/features/flow/visit-bar";
import { InvoiceEmbedded } from "./invoice-detail";

/** Invoice overlay: the complete invoice (draft editor, or issued view with payments, storno and sharing), under the visit bar, titled by the car and its number. */
export default function InvoiceView({ open, onOpenChange, id }) {
	const invoice = useEntity("invoices", id);
	const payments = useCollection("payments");
	const settings = useSettings();
	const today = useToday();
	const draft = invoice?.status === "draft";
	const vehicle = useEntity("vehicles", invoice?.vehicleId);
	const customer = useEntity("customers", invoice?.customerId);
	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={invoice}
			missing="Factura a fost ștearsă."
			title={invoice ? visitTitle({ vehicle }, draft ? "ciornă" : formatInvoiceNumber(invoice.series, invoice.number), customer?.name ?? "Factură") : "Factură"}
			bar={invoice ? <VisitBarFor from="invoice" record={invoice} /> : null}
			make={vehicle?.make}
			kind="invoice"
			state={invoice && today ? invoiceLook(invoice, selectPaymentsByInvoice(payments).get(invoice.id) ?? [], { today, currency: settings.currency }) : undefined}
			fullPage={invoice && detailHref("invoice", invoice.id)}
		>
			{invoice && (
				<EmbeddedLinks>
					<InvoiceEmbedded invoice={invoice} />
				</EmbeddedLinks>
			)}
		</DetailSheet>
	);
}
