"use client";

import { DetailSheet } from "@/components/ds/detail-sheet";
import { EmbeddedLinks } from "@/components/ds/embedded-links";
import { detailHref } from "@/lib/detail-mode";
import { openSheet } from "@/lib/sheets";
import { useCollection, useEntity } from "@/lib/store/hooks";
import { CustomerEmbedded } from "./customer-detail";

/** Customer overlay: everything the customer page shows (stats, cars, jobs, invoices, contact details). */
export default function CustomerView({ open, onOpenChange, id }) {
	const customer = useEntity("customers", id);
	// The client's sheet takes the colour of their car (the first one they brought).
	const car = Object.values(useCollection("vehicles")).find((v) => v.customerId === id);
	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={customer}
			missing="Clientul a fost șters."
			title={customer?.name ?? "Client"}
			tint={car?.make ?? null}
			fullPage={customer && detailHref("customer", customer.id)}
			onEdit={() => openSheet("customer", { id: customer.id })}
		>
			{customer && (
				<EmbeddedLinks>
					<CustomerEmbedded customer={customer} />
				</EmbeddedLinks>
			)}
		</DetailSheet>
	);
}
