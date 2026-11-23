"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, CircleX, ExternalLink, FilePlus2, FileText, MessageCircle, MessageSquareText, MoreHorizontal, PackageSearch, RotateCcw, Star, Trash2 } from "lucide-react";
import { CoverIconButton } from "@/components/ds/car";
import { useConfirm } from "@/components/ds/confirm";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { smsHref, whatsappHref } from "@/domain/customer";
import { formatInvoiceNumber } from "@/domain/invoice";
import { fmtWorkOrder } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { flushEdits } from "@/lib/pending-edits";
import { closeSheet, navigateFromSheet } from "@/lib/sheets";
import { deleteWorkOrder, invoiceForWorkOrder } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { useVisit } from "@/features/flow/visit-bar";
import { useWalk } from "@/features/flow/visit-links";
import { detailHref } from "@/lib/detail-mode";
import { JobReasonPanel, nextLabel, useJobMoves } from "./job-state";

/**
 * The "…" on a job's sheet (owner, 20 Nov 2026), as on its card: everything about this job in one menu. Its state
 * (every move the job allows, the next step first and cancelling last, 23 Nov 2026; they ask, name a reason and undo
 * as the job page's do), the visit's other records (booking, invoice, review), writing to the client, the full
 * page, and deleting it while it is still an estimate.
 */
export function JobMenu({ order, customer, message, light }) {
	const router = useRouter();
	const confirm = useConfirm();
	const walk = useWalk(true);
	const visit = useVisit("work-order", order);
	const jobMoves = useJobMoves({ order, invoice: visit?.invoice ?? null, appointment: visit?.appointment ?? null, beforeMove: flushEdits });
	const { flow, perform, apply, panel, setPanel } = jobMoves;
	const rank = { next: 0, pause: 1, skip: 2, back: 3 };
	const items = flow.moves
		.map((move, index) => ({ move, index }))
		// Going back, the nearest step first.
		.sort((a, b) => (rank[a.move.kind] ?? 4) - (rank[b.move.kind] ?? 4) || (a.move.kind === "back" ? b.index - a.index : a.index - b.index))
		.map(({ move }) => {
			const special = { pause: ["Așteaptă piese", PackageSearch], cancel: ["Anulează lucrarea", CircleX], reopen: ["Redeschide", RotateCcw] }[move.id];
			const text = special?.[0] ?? (move.kind === "back" ? `Înapoi la ${WORK_ORDER_STATUS[move.to].label}` : nextLabel(move));
			return { key: move.id, text, Icon: special?.[1] ?? WORK_ORDER_STATUS[move.to].icon, destructive: move.id === "cancel", muted: !move.allowed, run: () => perform(move) };
		});
	// A refused estimate has no flow of its own: it can only go back to being an estimate.
	if (order.status === "declined") items.push({ key: "estimate", text: "Înapoi la deviz", Icon: WORK_ORDER_STATUS.estimate.icon, run: () => apply("estimate") });
	const deletable = ["estimate", "cancelled", "declined"].includes(order.status) && !order.invoiceId;
	const phone = customer?.phone;

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
		<>
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<CoverIconButton icon={MoreHorizontal} label="Mai multe" light={light} />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64" data-sheet-menu>
				{items.length > 0 && (
					<>
						<DropdownMenuLabel>Schimbă starea</DropdownMenuLabel>
						{items.map(({ key, text, Icon, destructive, muted, run }) => (
							<DropdownMenuItem key={key} variant={destructive ? "destructive" : undefined} className={muted ? "opacity-60" : undefined} onSelect={run}>
								<Icon /> {text}
							</DropdownMenuItem>
						))}
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
		<Dialog open={Boolean(panel)} onOpenChange={(open) => !open && setPanel(null)}>
			<DialogContent showCloseButton={false} className="border-0 bg-transparent p-0 shadow-none sm:max-w-md [&>div]:bg-popover">
				<DialogTitle className="sr-only">{{ cancel: "Anulează lucrarea", pause: "Așteaptă piese", reopen: "Redeschide lucrarea" }[panel] ?? "Lucrare"}</DialogTitle>
				<JobReasonPanel moves={jobMoves} />
			</DialogContent>
		</Dialog>
		</>
	);
}
