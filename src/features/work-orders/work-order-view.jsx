"use client";

import { useRouter } from "next/navigation";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { fmtDate, fmtWorkOrder } from "@/lib/format";
import { detailHref } from "@/lib/detail-mode";
import { navigateFromSheet } from "@/lib/sheets";
import { useEntity } from "@/lib/store/hooks";
import { WorkOrderEmbedded } from "./work-order-detail";

/**
 * Work-order overlay: the complete work order (status steps, lines, inspection,
 * estimate, activity), editable in place. Links inside it leave the overlay
 * and open the target page.
 */
export default function WorkOrderView({ open, onOpenChange, id }) {
	const router = useRouter();
	const order = useEntity("workOrders", id);

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={order}
			missing="Lucrarea a fost ștearsă."
			title={order ? `Lucrarea ${fmtWorkOrder(order.number)}` : "Lucrare"}
			description={order ? `deschisă ${fmtDate(order.createdAt, "d MMM yyyy, HH:mm")}` : undefined}
			fullPage={order && detailHref("work-order", order.id)}
			size="xl"
		>
			{order && (
				<div
					onClickCapture={(event) => {
						const link = event.target.closest?.("a[href^='/']");
						if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
						event.preventDefault();
						event.stopPropagation();
						navigateFromSheet(router, link.getAttribute("href"));
					}}
				>
					<WorkOrderEmbedded order={order} />
				</div>
			)}
		</DetailSheet>
	);
}
