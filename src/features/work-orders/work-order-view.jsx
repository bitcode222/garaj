"use client";

import { FileText } from "lucide-react";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { KeyValue, KeyValueGrid, Money } from "@/components/ds/data";
import { PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { StatusMenu, useStatusChange } from "@/components/ds/status-menu";
import { computeTotals } from "@/domain/lines";
import { WO_TRANSITIONS, isOpen } from "@/domain/work-order";
import { fmtDate, fmtKm, fmtWorkOrder, plural } from "@/lib/format";
import { detailHref } from "@/lib/detail-mode";
import { WORK_ORDER_ACTIONS, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useEntity, useSettings } from "@/lib/store/hooks";
import { StatusStepper } from "./status-stepper";
import { moveWorkOrder } from "./status";

/** Work-order overlay: where the job is (clickable steps), who and what, and the money. Lines and inspection are on the full page. */
export default function WorkOrderView({ open, onOpenChange, id }) {
	const settings = useSettings();
	const order = useEntity("workOrders", id);
	const vehicle = useEntity("vehicles", order?.vehicleId);
	const customer = useEntity("customers", order?.customerId);
	const mechanic = useEntity("staff", order?.staffId);
	const invoice = useEntity("invoices", order?.invoiceId);
	const totals = order ? computeTotals(order.lines, { vatPayer: settings.invoicing.vatPayer }) : null;
	const moves = order ? WO_TRANSITIONS[order.status] : [];
	const change = useStatusChange({
		map: WORK_ORDER_STATUS,
		value: order?.status,
		subject: order ? fmtWorkOrder(order.number) : "",
		onMove: (to) => moveWorkOrder(order, to),
		actions: WORK_ORDER_ACTIONS,
		destructive: ["cancelled"],
	});

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={order}
			missing="Lucrarea a fost ștearsă."
			title={order ? `Lucrarea ${fmtWorkOrder(order.number)}` : "Lucrare"}
			description={order ? `deschisă ${fmtDate(order.createdAt, "d MMM yyyy, HH:mm")}` : undefined}
			fullPage={order && detailHref("work-order", order.id)}
		>
			{order && (
				<div className="space-y-5">
					<div className="space-y-3 rounded-md border bg-muted/40 p-3">
						<StatusMenu map={WORK_ORDER_STATUS} value={order.status} moves={moves} onMove={(to) => moveWorkOrder(order, to)} subject={fmtWorkOrder(order.number)} actions={WORK_ORDER_ACTIONS} destructive={["cancelled"]} />
						<StatusStepper status={order.status} onMove={isOpen(order) ? change : undefined} />
					</div>

					<div className="grid gap-2 sm:grid-cols-2">
						{vehicle && (
							<button type="button" onClick={() => openSheet("vehicle-view", { id: vehicle.id })} className="flex min-h-14 flex-col items-start justify-center gap-1 rounded-md border p-3 text-left transition-colors hover:bg-accent/50">
								<VehicleLabel vehicle={vehicle} nameClassName="text-sm font-medium" />
								<PlateTag value={vehicle.plate} />
							</button>
						)}
						{customer && (
							<button type="button" onClick={() => openSheet("customer-view", { id: customer.id })} className="flex min-h-14 flex-col items-start justify-center rounded-md border p-3 text-left transition-colors hover:bg-accent/50">
								<span className="text-xs text-muted-foreground">Client</span>
								<span className="max-w-full truncate text-sm font-medium">{customer.name}</span>
							</button>
						)}
					</div>

					{order.complaint && <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-line">{order.complaint}</p>}

					<KeyValueGrid className="sm:grid-cols-2">
						<KeyValue label="Mecanic">{mechanic?.name}</KeyValue>
						<KeyValue label="Kilometraj la primire">{order.mileage ? fmtKm(order.mileage) : null}</KeyValue>
						<KeyValue label="Linii">{plural(order.lines.length, "linie", "linii")}</KeyValue>
						<KeyValue label="Total (cu TVA)">
							<Money value={totals.gross} className="font-semibold" />
						</KeyValue>
					</KeyValueGrid>

					{invoice && (
						<button type="button" onClick={() => openSheet("invoice-view", { id: invoice.id })} className="flex min-h-12 w-full items-center gap-2 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent/50">
							<FileText className="size-4 text-muted-foreground" aria-hidden /> Factura asociată
						</button>
					)}
				</div>
			)}
		</DetailSheet>
	);
}
