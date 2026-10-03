"use client";

import { DetailSheet } from "@/components/ds/detail-sheet";
import { EmbeddedLinks } from "@/components/ds/embedded-links";
import { formatInvoiceNumber } from "@/domain/invoice";
import { detailHref } from "@/lib/detail-mode";
import { useEntity } from "@/lib/store/hooks";
import { InvoiceEmbedded } from "./invoice-detail";

/** Invoice overlay: the complete invoice (draft editor, or issued view with payments, storno and sharing). */
export default function InvoiceView({ open, onOpenChange, id }) {
	const invoice = useEntity("invoices", id);
	const draft = invoice?.status === "draft";
	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={invoice}
			missing="Factura a fost ștearsă."
			title={invoice ? (draft ? "Ciornă" : formatInvoiceNumber(invoice.series, invoice.number)) : "Factură"}
			fullPage={invoice && detailHref("invoice", invoice.id)}
			size="xl"
		>
			{invoice && (
				<EmbeddedLinks>
					<InvoiceEmbedded invoice={invoice} />
				</EmbeddedLinks>
			)}
		</DetailSheet>
	);
}
