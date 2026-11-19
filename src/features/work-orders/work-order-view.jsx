"use client";

import { MessageCircle, Phone } from "lucide-react";
import { CoverButton, CoverIconButton } from "@/components/ds/car";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { useAccount } from "@/components/shell/account-menu";
import { primaryAction } from "./job-action";
import { EmbeddedLinks } from "@/components/ds/embedded-links";
import { fmtWorkOrder } from "@/lib/format";
import { VisitBarFor } from "@/features/flow/visit-bar";
import { detailHref } from "@/lib/detail-mode";
import { orderKind, orderLook } from "@/lib/record-state";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { telHref, whatsappHref } from "@/domain/customer";
import { vehicleName } from "@/domain/vehicle";
import { estimateMessage, readyMessage } from "@/domain/work-order";
import { makeInk } from "@/lib/colors";
import { jobHeadline } from "./job-text";
import { WorkOrderEmbedded } from "./work-order-detail";

/** Work-order overlay: the complete work order, editable in place; the visit bar says whether it is a Deviz or a Lucrare, the title names the car. */
export default function WorkOrderView({ open, onOpenChange, id }) {
	const order = useEntity("workOrders", id);
	const appointment = useEntity("appointments", order?.appointmentId);
	const vehicle = useEntity("vehicles", order?.vehicleId);
	const customer = useEntity("customers", order?.customerId);
	const today = useToday();
	const kind = order ? orderKind(order) : "job";
	const { member } = useAccount();
	const primary = order ? primaryAction(order, { staffId: member?.id ?? null }) : null;
	const settings = useSettings();
	const staff = useCollection("staff");
	const mechanic = order?.staffId ? staff[order.staffId] : null;
	const light = makeInk(vehicle?.make) !== "#ffffff";
	const message = order && customer ? (order.status === "ready" ? readyMessage({ customer, vehicle, settings }) : estimateMessage({ order, customer, vehicle, settings })) : "";
	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={order}
			missing="Lucrarea a fost ștearsă."
			title={order ? jobHeadline(order) : "Lucrare"}
			cover={order ? { code: `${kind === "estimate" ? "DEV" : "LUC"} ${fmtWorkOrder(order.number)}`, car: vehicleName(vehicle), plate: vehicle?.plate, lines: [[customer?.name, mechanic?.name?.split(" ")[0]].filter(Boolean).join(" · ")] } : null}
			kind={kind}
			state={order && today ? orderLook(order, { today, appointment }) : undefined}
			bar={order ? <VisitBarFor from="work-order" record={order} /> : null}
			make={vehicle?.make}
			fullPage={order && detailHref("work-order", order.id)}
			// Under the title (sheet "A"): the job's next step, then calling and writing to the client, of glass on the car's colour.
			footer={
				order ? (
					<>
						{primary && (
							<CoverButton icon={primary.icon} onClick={primary.run}>
								{primary.label}
							</CoverButton>
						)}
						{customer?.phone && <CoverIconButton icon={Phone} light={light} href={telHref(customer.phone)} label={`Sună: ${customer.name}`} />}
						{customer?.phone && <CoverIconButton icon={MessageCircle} light={light} href={whatsappHref(customer.phone, message)} target="_blank" rel="noreferrer" label={order.status === "ready" ? "Anunță că e gata pe WhatsApp" : "Trimite devizul pe WhatsApp"} />}
					</>
				) : null
			}
		>
			{order && (
				<EmbeddedLinks>
					<WorkOrderEmbedded order={order} />
				</EmbeddedLinks>
			)}
		</DetailSheet>
	);
}
