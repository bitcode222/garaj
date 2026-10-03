"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	ClipboardCheck,
	EllipsisVertical,
	FileSearch,
	FileText,
	Fuel,
	Gauge,
	MessageCircle,
	MessageSquareText,
	Printer,
	ReceiptText,
	Send,
	Share2,
	Trash2,
	Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { useConfirm } from "@/components/ds/confirm";
import { ContactActions } from "@/components/ds/contact";
import { EmptyState, KeyValue, KeyValueGrid, Money, Timeline } from "@/components/ds/data";
import { Field } from "@/components/ds/inputs";
import { Page, PageHeader, SplitView, StickyBar } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { Sheet } from "@/components/ds/sheet";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { StatusBadge, ToneBadge, ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { smsHref, whatsappHref } from "@/domain/customer";
import { todayISO } from "@/domain/dates";
import { buildSnapshot, formatInvoiceNumber } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { vehicleName } from "@/domain/vehicle";
import { WO_TRANSITIONS, estimateMessage, inspectionSummary, isOpen } from "@/domain/work-order";
import { fmtDate, fmtHours, fmtKm, fmtWorkOrder } from "@/lib/format";
import { printPage, shareText, useDraft, useQueryId } from "@/lib/hooks";
import { FUEL_LEVELS, INVOICE_STATE, WORK_ORDER_ACTIONS, WORK_ORDER_STATUS } from "@/lib/labels";
import { deleteWorkOrder, invoiceForWorkOrder, setWorkOrderStatus, updateWorkOrder } from "@/lib/store/actions";
import { useCollection, useEntity, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive, selectInvoiceStates } from "@/lib/store/selectors";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { LinesEditor } from "@/features/lines/lines-editor";
import { TotalsBlock } from "@/features/lines/totals-block";
import { InspectionChecklist } from "./inspection";
import { useStatusChange } from "@/components/ds/status-menu";
import { MakeLogo, PlateTag } from "@/components/ds/make-logo";
import { closeSheet, navigateFromSheet } from "@/lib/sheets";
import { StatusStepper } from "./status-stepper";

const NEXT_STEP = {
	estimate: "approved",
	approved: "in_progress",
	in_progress: "ready",
	waiting_parts: "in_progress",
	ready: "delivered",
};

const NEXT_LABEL = {
	estimate: "Aprobă devizul",
	approved: "Începe lucrul",
	in_progress: "Marchează gata",
	waiting_parts: "Piesele au sosit",
	ready: "Predă mașina",
};

const ACTIVITY_LABEL = { created: "Lucrare deschisă" };

export function WorkOrderDetail() {
	const id = useQueryId();
	const ready = useIsReady();
	const order = useEntity("workOrders", id);
	if (!ready) return <DetailPageSkeleton />;
	if (!order) {
		return (
			<Page>
				<PageHeader title="Lucrare" back={{ href: "/work-orders/", label: "Lucrări" }} />
				<EmptyState icon={FileSearch} title="Lucrarea nu există" description="A fost ștearsă sau linkul este greșit." />
			</Page>
		);
	}
	return <WorkOrder key={order.id} order={order} />;
}

/** The whole work order (lines, inspection, activity, estimate…) for the overlay. */
export function WorkOrderEmbedded({ order }) {
	return <WorkOrder order={order} embedded />;
}

function WorkOrder({ order, embedded = false }) {
	const router = useRouter();
	const confirm = useConfirm();
	const today = useToday();
	const settings = useSettings();
	const customer = useEntity("customers", order.customerId);
	const vehicle = useEntity("vehicles", order.vehicleId);
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const staff = selectActive(useCollection("staff"));
	const bays = selectActive(useCollection("bays"));
	const [estimateOpen, setEstimateOpen] = useState(false);
	const [draft, update, flush] = useDraft(order, (next) =>
		updateWorkOrder(order.id, {
			complaint: next.complaint,
			diagnosis: next.diagnosis,
			notes: next.notes,
			lines: next.lines,
			inspection: next.inspection,
			staffId: next.staffId,
			bayId: next.bayId,
		}),
	);

	const locked = !isOpen(order);
	const vatPayer = settings.invoicing.vatPayer;
	const totals = computeTotals(draft.lines, { vatPayer });
	const invoice = order.invoiceId ? invoices[order.invoiceId] : null;
	const invoiceInfo = invoice && today ? selectInvoiceStates(invoices, payments, today).get(invoice.id) : null;
	const summary = inspectionSummary(draft.inspection);
	const message = estimateMessage({ order: draft, customer, vehicle, settings });
	const next = NEXT_STEP[order.status];

	const move = async (to) => {
		flush();
		if (to === "delivered" && (!invoice || invoice.status === "draft")) {
			const ok = await confirm({
				title: "Mașina nu are factură emisă",
				description: "O poți preda acum și factura ulterior (ex. flote cu facturare lunară).",
				confirmLabel: "Predă fără factură",
			});
			if (!ok) return;
		}
		try {
			setWorkOrderStatus(order.id, to);
			toast.success(`${WORK_ORDER_STATUS[to].label}`);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const change = useStatusChange({
		map: WORK_ORDER_STATUS,
		value: order.status,
		subject: fmtWorkOrder(order.number),
		onMove: move,
		actions: WORK_ORDER_ACTIONS,
		destructive: ["cancelled"],
	});

	const openInvoice = () => {
		flush();
		try {
			const inv = invoiceForWorkOrder(order.id);
			if (embedded) navigateFromSheet(router, `/invoices/detail/?id=${inv.id}`);
			else router.push(`/invoices/detail/?id=${inv.id}`);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const remove = async () => {
		if (!(await confirm({ title: `Ștergi lucrarea #${order.number}?`, confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteWorkOrder(order.id);
			toast.success("Lucrare ștearsă.");
			if (embedded) closeSheet();
			else router.replace("/work-orders/");
		} catch (error) {
			toast.error(error.message);
		}
	};

	const shareEstimate = async () => {
		const result = await shareText({ title: `Deviz #${order.number}`, text: message });
		if (result === "copied") toast.success("Devizul a fost copiat.");
	};

	const snapshot = buildSnapshot({ settings, customer, vehicle, mileage: order.mileage });
	const estimateDoc = { ...draft, series: "", number: order.number, issueDate: todayISO(), dueDate: null, notes: draft.complaint ? `Reclamație: ${draft.complaint}` : "" };

	const timeline = [
		...Object.entries(order.dates ?? {})
			.filter(([, at]) => at)
			.sort((a, b) => (a[1] < b[1] ? 1 : -1))
			.map(([status, at]) => ({
				id: status,
				title: status === "estimate" ? "Deviz deschis" : WORK_ORDER_STATUS[status]?.label,
				icon: WORK_ORDER_STATUS[status]?.icon,
				tone: WORK_ORDER_STATUS[status]?.tone,
				meta: fmtDate(at, "d MMM, HH:mm"),
			})),
	];

	return (
		<Page width="wide" embedded={embedded}>
			<PageHeader
				embedded={embedded}
				back={{ href: "/work-orders/", label: "Lucrări" }}
				title={`Lucrarea ${fmtWorkOrder(order.number)}`}
				meta={
					<div className="space-y-4">
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<StatusBadge map={WORK_ORDER_STATUS} value={order.status} />
							<span>deschisă {fmtDate(order.createdAt, "d MMM, HH:mm")}</span>
						</div>
						<StatusStepper status={order.status} onMove={locked ? undefined : change} className="max-w-2xl" />
					</div>
				}
				actions={
					<>
						{next && (
							<Button onClick={() => change(next)} className="max-md:hidden">
								{NEXT_LABEL[order.status]}
							</Button>
						)}
						<Button variant="outline" onClick={openInvoice} disabled={!draft.lines.length}>
							<ReceiptText /> <span className="max-sm:hidden">{invoice && invoice.status !== "cancelled" ? "Factura" : "Facturează"}</span>
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline">
									<Send /> <span className="max-sm:hidden">Deviz</span>
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								{customer?.phone && (
									<>
										<DropdownMenuItem asChild>
											<a href={whatsappHref(customer.phone, message)} target="_blank" rel="noreferrer">
												<MessageCircle /> Trimite pe WhatsApp
											</a>
										</DropdownMenuItem>
										<DropdownMenuItem asChild>
											<a href={smsHref(customer.phone, message)}>
												<MessageSquareText /> Trimite prin SMS
											</a>
										</DropdownMenuItem>
									</>
								)}
								<DropdownMenuItem onSelect={shareEstimate}>
									<Share2 /> Distribuie…
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => setEstimateOpen(true)}>
									<Printer /> Tipărește devizul
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						{!locked && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" aria-label="Mai multe acțiuni">
										<EllipsisVertical />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-56">
									<DropdownMenuLabel className="text-xs text-muted-foreground">Mută în…</DropdownMenuLabel>
									{WO_TRANSITIONS[order.status].map((to) => (
										<DropdownMenuItem key={to} variant={to === "cancelled" ? "destructive" : "default"} onSelect={() => change(to)}>
											<ToneDot tone={WORK_ORDER_STATUS[to].tone} /> {WORK_ORDER_ACTIONS[to]}
										</DropdownMenuItem>
									))}
									{order.status === "estimate" && !order.invoiceId && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem variant="destructive" onSelect={remove}>
												<Trash2 /> Șterge devizul
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</>
				}
			/>

			<SplitView
				stacked={embedded}
				main={
					<>
						<Card>
							<CardContent className="space-y-5">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<Link href={vehicle ? `/vehicles/detail/?id=${vehicle.id}` : "#"} className="flex min-w-0 items-center gap-3">
										{vehicle && <MakeLogo make={vehicle.make} className="size-9" />}
										<div className="min-w-0">
											<p className="truncate font-semibold">{vehicleName(vehicle) || "Mașină"}</p>
											<p className="flex items-center gap-2 truncate font-mono text-xs text-muted-foreground">{vehicle && <PlateTag value={vehicle.plate} />}{vehicle?.vin || "VIN necompletat"}</p>
										</div>
									</Link>
									{customer && (
										<div className="min-w-0 text-right max-sm:text-left">
											<Link href={`/customers/detail/?id=${customer.id}`} className="font-medium hover:underline">
												{customer.name}
											</Link>
											<p className="text-xs text-muted-foreground">{customer.phone}</p>
										</div>
									)}
								</div>
								<KeyValueGrid className="sm:grid-cols-4">
									<KeyValue label="Kilometraj la primire">
										<span className="inline-flex items-center gap-1.5">
											<Gauge className="size-3.5 text-muted-foreground" aria-hidden />
											{fmtKm(order.mileage)}
										</span>
									</KeyValue>
									<KeyValue label="Combustibil">
										<span className="inline-flex items-center gap-1.5">
											<Fuel className="size-3.5 text-muted-foreground" aria-hidden />
											{order.fuelLevel != null ? FUEL_LEVELS[order.fuelLevel] : "—"}
										</span>
									</KeyValue>
									<Field label="Mecanic">
										{(fid) => (
											<Select value={draft.staffId ?? "none"} disabled={locked} onValueChange={(v) => update({ staffId: v === "none" ? null : v })}>
												<SelectTrigger id={fid} size="sm" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Nealocat</SelectItem>
													{staff.map((s) => (
														<SelectItem key={s.id} value={s.id}>
															{s.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</Field>
									<Field label="Post">
										{(fid) => (
											<Select value={draft.bayId ?? "none"} disabled={locked} onValueChange={(v) => update({ bayId: v === "none" ? null : v })}>
												<SelectTrigger id={fid} size="sm" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="none">Nealocat</SelectItem>
													{bays.map((b) => (
														<SelectItem key={b.id} value={b.id}>
															{b.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										)}
									</Field>
								</KeyValueGrid>
								{customer?.phone && <ContactActions phone={customer.phone} message={order.status === "ready" ? `Bună ziua! ${vehicleName(vehicle)} este gata de ridicare. ${settings.shop.name}` : undefined} />}
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Reclamație și constatări" icon={Wrench} />
							<CardContent className="grid gap-4 sm:grid-cols-2">
								<Field label="Ce reclamă clientul">
									{(fid) => <Textarea id={fid} readOnly={locked} value={draft.complaint ?? ""} onChange={(e) => update({ complaint: e.target.value })} />}
								</Field>
								<Field label="Diagnostic / constatări">
									{(fid) => <Textarea id={fid} readOnly={locked} value={draft.diagnosis ?? ""} onChange={(e) => update({ diagnosis: e.target.value })} placeholder="ce ai găsit la verificare" />}
								</Field>
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Deviz" icon={FileText} description={vatPayer ? "Prețuri fără TVA" : "Neplătitor de TVA"} />
							<CardContent>
								<LinesEditor
									lines={draft.lines}
									onChange={(lines) => update({ lines })}
									staff={staff}
									vatPayer={vatPayer}
									readOnly={locked || Boolean(invoice && invoice.status !== "draft" && invoice.status !== "cancelled")}
									defaultStaffId={draft.staffId}
								/>
								{draft.lines.length > 0 && (
									<div className="mt-5 flex justify-end">
										<TotalsBlock totals={totals} vatPayer={vatPayer} currency={settings.currency} className="w-full sm:w-72" />
									</div>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader
								title="Inspecție"
								icon={ClipboardCheck}
								description="Ce ai verificat — recomandările ajung în mesajul către client"
								action={
									<div className="flex gap-1.5">
										{summary.urgent > 0 && <ToneBadge tone="red">{summary.urgent} urgent</ToneBadge>}
										{summary.attention > 0 && <ToneBadge tone="yellow">{summary.attention} atenție</ToneBadge>}
									</div>
								}
							/>
							<CardContent>
								<InspectionChecklist items={draft.inspection} onChange={(inspection) => update({ inspection })} readOnly={locked} />
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Notițe interne" description="Nu apar pe documente" />
							<CardContent>
								<Textarea value={draft.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} placeholder="ex. clientul așteaptă în service" />
							</CardContent>
						</Card>
					</>
				}
				aside={
					<>
						<Card>
							<CardContent className="space-y-3">
								<p className="text-xs font-medium text-muted-foreground">Total estimat</p>
								<p className="text-display">
									<Money value={totals.gross} />
								</p>
								<div className="grid grid-cols-3 gap-2 text-center">
									<div className="rounded-lg bg-muted px-2 py-2">
										<p className="text-2xs text-muted-foreground">Manoperă</p>
										<p className="text-sm font-semibold tabular-nums">{fmtHours(totals.hours)}</p>
									</div>
									<div className="rounded-lg bg-muted px-2 py-2">
										<p className="text-2xs text-muted-foreground">Piese</p>
										<Money value={totals.parts} decimals={0} className="text-sm font-semibold" />
									</div>
									<div className="rounded-lg bg-muted px-2 py-2">
										<p className="text-2xs text-muted-foreground">Marjă piese</p>
										<Money value={totals.partsMargin} decimals={0} className="text-sm font-semibold" />
									</div>
								</div>
								{next && (
									<Button className="w-full max-md:hidden" onClick={() => change(next)}>
										{NEXT_LABEL[order.status]}
									</Button>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Factură" icon={ReceiptText} />
							<CardContent className="pt-3">
								{invoice && invoice.status !== "cancelled" ? (
									<Link href={`/invoices/detail/?id=${invoice.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-accent/50">
										<div>
											<p className="font-mono text-sm font-medium">{invoice.number == null ? "Ciornă" : formatInvoiceNumber(invoice.series, invoice.number)}</p>
											<p className="text-xs text-muted-foreground">{fmtDate(invoice.issueDate)}</p>
										</div>
										{invoiceInfo && <StatusBadge map={INVOICE_STATE} value={invoiceInfo.state} />}
									</Link>
								) : (
									<div className="space-y-3">
										<p className="text-sm text-muted-foreground">Liniile devizului trec pe factură; o poți ajusta înainte de emitere.</p>
										<Button variant="outline" className="w-full" onClick={openInvoice} disabled={!draft.lines.length}>
											<ReceiptText /> Creează factura
										</Button>
									</div>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Istoric" />
							<CardContent className="pt-4">
								<Timeline items={timeline.length ? timeline : [{ id: "c", title: ACTIVITY_LABEL.created, meta: fmtDate(order.createdAt) }]} />
							</CardContent>
						</Card>
					</>
				}
			/>

			{next && (
				<StickyBar inline={embedded} className="md:hidden">
					<Button className="h-11 flex-1" onClick={() => change(next)}>
						{NEXT_LABEL[order.status]}
					</Button>
					<Button variant="outline" className="h-11" onClick={openInvoice} disabled={!draft.lines.length} aria-label="Factură">
						<ReceiptText />
					</Button>
				</StickyBar>
			)}

			<Sheet
				open={estimateOpen}
				onOpenChange={setEstimateOpen}
				title={`Deviz #${order.number}`}
				size="lg"
				footer={
					<Button onClick={() => printPage(`Deviz ${order.number}`)} className="max-md:h-11">
						<Printer /> Tipărește / PDF
					</Button>
				}
			>
				<InvoiceDocument
					invoice={estimateDoc}
					snapshot={snapshot}
					totals={totals}
					currency={settings.currency}
					heading="Deviz estimativ"
					numberLabel={`Lucrarea ${fmtWorkOrder(order.number)}`}
					legal={false}
				/>
			</Sheet>
		</Page>
	);
}
