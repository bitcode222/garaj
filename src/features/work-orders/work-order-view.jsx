"use client";

import { DetailSheet } from "@/components/ds/detail-sheet";
import { EmbeddedLinks } from "@/components/ds/embedded-links";
import { fmtWorkOrder } from "@/lib/format";
import { detailHref } from "@/lib/detail-mode";
import { useEntity } from "@/lib/store/hooks";
import { WorkOrderEmbedded } from "./work-order-detail";

/** Work-order overlay: the complete work order, editable in place. */
export default function WorkOrderView({ open, onOpenChange, id }) {
	const order = useEntity("workOrders", id);
	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={order}
			missing="Lucrarea a fost ștearsă."
			title={order ? `Lucrarea ${fmtWorkOrder(order.number)}` : "Lucrare"}
			fullPage={order && detailHref("work-order", order.id)}
		>
			{order && (
				<EmbeddedLinks>
					<WorkOrderEmbedded order={order} />
				</EmbeddedLinks>
			)}
		</DetailSheet>
	);
}
