"use client";

import { DetailSheet } from "@/components/ds/detail-sheet";
import { EmbeddedLinks } from "@/components/ds/embedded-links";
import { fmtWorkOrder } from "@/lib/format";
import { VisitBarFor, visitTitle } from "@/features/flow/visit-bar";
import { detailHref } from "@/lib/detail-mode";
import { orderKind, orderLook } from "@/lib/record-state";
import { useEntity, useToday } from "@/lib/store/hooks";
import { WorkOrderEmbedded } from "./work-order-detail";

/** Work-order overlay: the complete work order, editable in place; the visit bar says whether it is a Deviz or a Lucrare, the title names the car. */
export default function WorkOrderView({ open, onOpenChange, id }) {
	const order = useEntity("workOrders", id);
	const appointment = useEntity("appointments", order?.appointmentId);
	const vehicle = useEntity("vehicles", order?.vehicleId);
	const customer = useEntity("customers", order?.customerId);
	const today = useToday();
	const kind = order ? orderKind(order) : "job";
	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={order}
			missing="Lucrarea a fost ștearsă."
			title={order ? visitTitle({ vehicle }, fmtWorkOrder(order.number), customer?.name ?? (kind === "estimate" ? "Deviz" : "Lucrare")) : "Lucrare"}
			kind={kind}
			state={order && today ? orderLook(order, { today, appointment }) : undefined}
			bar={order ? <VisitBarFor from="work-order" record={order} /> : null}
			make={vehicle?.make}
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
