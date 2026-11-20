"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, ExternalLink, FilePlus2, FileText, MessageCircle, MessageSquareText, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { CoverIconButton } from "@/components/ds/car";
import { useConfirm } from "@/components/ds/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { smsHref, whatsappHref } from "@/domain/customer";
import { formatInvoiceNumber } from "@/domain/invoice";
import { WO_TRANSITIONS } from "@/domain/work-order";
import { fmtWorkOrder } from "@/lib/format";
import { WORK_ORDER_ACTIONS, WORK_ORDER_STATUS } from "@/lib/labels";
import { flushEdits } from "@/lib/pending-edits";
import { closeSheet, navigateFromSheet } from "@/lib/sheets";
import { deleteWorkOrder, invoiceForWorkOrder } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { useVisit } from "@/features/flow/visit-bar";
import { useWalk } from "@/features/flow/visit-links";
import { detailHref } from "@/lib/detail-mode";
import { moveWorkOrder } from "./status";

/**
 * The "…" on a job's sheet (owner, 20 Nov 2026), as on its card: everything about this job in one menu. Its state
 * (every move the job allows), the visit's other records (booking, invoice, review), writing to the client, the full
 * page, and deleting it while it is still an estimate.
 */
export function JobMenu({ order, customer, message, light }) {
	const router = useRouter();
	const confirm = useConfirm();
	const walk = useWalk(true);
	const visit = useVisit("work-order", order);
	const moves = (WO_TRANSITIONS[order.status] ?? []).filter((to) => WORK_ORDER_STATUS[to]);
	const deletable = ["estimate", "cancelled", "declined"].includes(order.status) && !order.invoiceId;
	const phone = customer?.phone;

	const move = async (to) => {
		if (to === "cancelled" && !(await confirm({ title: `Anulezi lucrarea ${fmtWorkOrder(order.number)}?`, description: "O poți reactiva mai târziu.", confirmLabel: "Anulează lucrarea", destructive: true }))) return;
		flushEdits();
		moveWorkOrder(order, to);
	};
	const makeInvoice = () => {
		flushEdits();
		try {
			walk({ kind: "invoice", id: invoiceForWorkOrder(order.id).id, direction: "forward" });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const remove = async () => {
		if (!(await confirm({ title: `Ștergi lucrarea ${fmtWorkOrder(order.number)}?`, description: "Nu se poate anula.", confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteWorkOrder(order.id);
			toast.success("Lucrare ștearsă.");
			closeSheet();
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<CoverIconButton icon={MoreHorizontal} label="Mai multe" light={light} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64" data-sheet-menu>
				{moves.length > 0 && (
					<>
						<DropdownMenuLabel>Schimbă starea</DropdownMenuLabel>
						{moves.map((to) => {
							const Icon = WORK_ORDER_STATUS[to].icon;
							return (
								<DropdownMenuItem key={to} variant={to === "cancelled" ? "destructive" : undefined} onSelect={() => move(to)}>
									<Icon /> {WORK_ORDER_ACTIONS[to] ?? WORK_ORDER_STATUS[to].label}
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuSeparator />
					</>
				)}
				<DropdownMenuLabel>Vizita</DropdownMenuLabel>
				{visit?.appointment && (
					<DropdownMenuItem onSelect={() => walk({ kind: "appointment", id: visit.appointment.id, direction: "back" })}>
						<CalendarDays /> Programarea{visit.appointment.number != null ? ` #${visit.appointment.number}` : ""}
					</DropdownMenuItem>
				)}
				{visit?.invoice ? (
					<DropdownMenuItem onSelect={() => walk({ kind: "invoice", id: visit.invoice.id, direction: "forward" })}>
						<FileText /> {visit.invoice.number == null ? "Ciorna facturii" : `Factura ${formatInvoiceNumber(visit.invoice.series, visit.invoice.number)}`}
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem disabled={!order.lines.length} onSelect={makeInvoice}>
						<FilePlus2 /> Fă factura
					</DropdownMenuItem>
				)}
				{(visit?.review || order.status === "delivered") && (
					<DropdownMenuItem onSelect={() => walk({ kind: "review", id: order.id, direction: "forward", props: { workOrderId: order.id } })}>
						<Star /> Recenzia
					</DropdownMenuItem>
				)}
				<DropdownMenuItem onSelect={() => navigateFromSheet(router, detailHref("work-order", order.id))}>
					<ExternalLink /> Deschide pagina completă
				</DropdownMenuItem>
				{phone && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>{order.status === "ready" ? "Anunță clientul" : "Trimite devizul"}</DropdownMenuLabel>
						<DropdownMenuItem asChild>
							<a href={whatsappHref(phone, message)} target="_blank" rel="noreferrer">
								<MessageCircle /> Pe WhatsApp
							</a>
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<a href={smsHref(phone, message)}>
								<MessageSquareText /> Prin SMS
							</a>
						</DropdownMenuItem>
					</>
				)}
				{deletable && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onSelect={remove}>
							<Trash2 /> Șterge lucrarea
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
