"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
	ChevronRight,
	FilePlus2,
	ChevronLeft,
	ClipboardCheck,
	EllipsisVertical,
	MoreHorizontal,
	Phone,
	FileSearch,
	FileText,
	Fuel,
	Gauge,
	MessageCircle,
	MessageSquareText,
	Printer,
	Send,
	Share2,
	Trash2,
	Wrench,
} from "lucide-react";
import { useRemember } from "@/lib/recents";
import { orderKind, orderLook } from "@/lib/record-state";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { useConfirm } from "@/components/ds/confirm";
import { ContactActions } from "@/components/ds/contact";
import { EmptyState, KeyValue, KeyValueGrid, Money, Timeline } from "@/components/ds/data";
import { Field } from "@/components/ds/inputs";
import { Page, PageHeader, SplitView, StickyBar } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { Sheet } from "@/components/ds/sheet";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge, ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { smsHref, whatsappHref } from "@/domain/customer";
import { todayISO } from "@/domain/dates";
import { buildSnapshot, formatInvoiceNumber } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { vehicleName } from "@/domain/vehicle";
import { estimateMessage, inspectionSummary, isOpen, readyMessage } from "@/domain/work-order";
import { fmtDate, fmtHours, fmtKm, fmtWorkOrder } from "@/lib/format";
import { printPage, shareText, useDraft, useMediaQuery, useQueryId } from "@/lib/hooks";
import { PHONE } from "@/components/ds/nav-bar";
import { PhoneJob } from "./phone-job";
import { FUEL_LEVELS, WORK_ORDER_STATUS } from "@/lib/labels";
import { deleteWorkOrder, invoiceForWorkOrder, setLineDone, updateWorkOrder } from "@/lib/store/actions";
import { useCollection, useEntity, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive } from "@/lib/store/selectors";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { LinesEditor } from "@/features/lines/lines-editor";
import { TotalsBlock } from "@/features/lines/totals-block";
import { IosLines } from "@/features/lines/ios-lines";
import { cn } from "@/lib/utils";
import { InspectionChecklist } from "./inspection";
import { MakeLogo, PlateTag } from "@/components/ds/make-logo";
import { closeSheet } from "@/lib/sheets";
import { holdEdits } from "@/lib/pending-edits";
import { VisitBarFor, visitTitle } from "@/features/flow/visit-bar";
import { JobState, nextLabel, useJobMoves } from "./job-state";
import { JobWarnings } from "@/features/calendar/booking-warnings";
import { CarHeader, CoverButton, CoverIconButton, coverIconClass } from "@/components/ds/car";
import { useAccount } from "@/components/shell/account-menu";
import { makeInk } from "@/lib/colors";
import { primaryAction } from "./job-action";
import { jobHeadline } from "./job-text";
import { ClockLine, JobSteps } from "./job-progress";
import { useWalk } from "@/features/flow/visit-links";

const ACTIVITY_LABEL = { created: "Lucrare deschisă" };

const sheetField = "block w-full resize-none bg-transparent px-4 py-3 outline-none [field-sizing:content] placeholder:text-muted-foreground/70";
const sheetLink = "flex min-h-12 w-full items-center gap-2.5 border-t px-4 text-left text-[16px] font-medium text-brand hover:bg-foreground/[0.04]";

/** A section of a car's sheet: a big title (and a quiet note at its right), then its grey group. */
function SheetGroup({ title, aside, children }) {
	return (
		<section data-group aria-label={title}>
			<div className="flex items-baseline justify-between gap-3 px-1 pb-2">
				<h2 className="text-[20px] leading-tight font-bold tracking-[-0.01em]">{title}</h2>
				{aside && <span className="text-[13px] text-muted-foreground tabular-nums">{aside}</span>}
			</div>
			{children}
		</section>
	);
}

/** A row of a group: its coloured icon square, the label, the value at the right. */
function SheetRow({ icon: Icon, color, label, value }) {
	return (
		<div className="flex min-h-12 items-center gap-3 px-4 [&+&]:border-t">
			<span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: color }}>
				<Icon className="size-4" aria-hidden />
			</span>
			<span className="flex-1 text-[16px]">{label}</span>
			<span className="text-[16px] text-muted-foreground tabular-nums">{value}</span>
		</div>
	);
}

/** A choice in a group (mechanic, bay): the label at the left, a quiet select at the right. */
function SheetSelect({ label, value, options, disabled, onChange }) {
	return (
		<div className="flex min-h-12 items-center gap-3 px-4 [&+&]:border-t">
			<span className="flex-1 text-[16px]">{label}</span>
			<Select value={value ?? "none"} disabled={disabled} onValueChange={(v) => onChange(v === "none" ? null : v)}>
				<SelectTrigger size="sm" aria-label={label} className="w-auto min-w-36 justify-end border-0 bg-transparent text-[15px] text-muted-foreground shadow-none dark:bg-transparent">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">Nealocat</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.id} value={o.id}>
							{o.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function WorkOrderDetail() {
	const id = useQueryId();
	const ready = useIsReady();
	const order = useEntity("workOrders", id);
	const phone = useMediaQuery(PHONE);
	if (!ready) return <DetailPageSkeleton />;
	// A phone is the iPhone's job page, strictly (docs/DESIGN.md "Telefon ca iPhone").
	if (order && phone) return <PhoneJob key={order.id} order={order} />;
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
	useRemember("work-order", order.id);
	const router = useRouter();
	const confirm = useConfirm();
	const today = useToday();
	const settings = useSettings();
	const customer = useEntity("customers", order.customerId);
	const appointment = useEntity("appointments", order.appointmentId);
	const vehicle = useEntity("vehicles", order.vehicleId);
	const invoices = useCollection("invoices");
	const staff = selectActive(useCollection("staff"));
	const { member } = useAccount();
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
	const summary = inspectionSummary(draft.inspection);
	const message = estimateMessage({ order: draft, customer, vehicle, settings });
	// Every status move (state section, phone bar) goes through one place.
	const moves = useJobMoves({ order, invoice, appointment, beforeMove: flush });
	// The visit bar makes the invoice from these lines: what is typed is saved first.
	useEffect(() => holdEdits(flush), [flush]);
	const next = moves.flow.off ? null : moves.flow.next;
	const walk = useWalk(embedded);
	const askReview = () => walk({ kind: "review", id: order.id, direction: "forward", props: { workOrderId: order.id } });

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


	const estimateMenu = (
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
	);
	const primary = primaryAction(order, { staffId: member?.id ?? null });
	const light = makeInk(vehicle?.make) !== "#ffffff";

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

	// In a sheet: sheet "S" (the owner's pick, 19 Nov 2026). The head (Sheet) carries the car, the title and the
	// buttons; below it, on white, grey groups under big titles in the order the desk asks: what the client says, how
	// the car came in, what is to do, the estimate, the invoice, the shop's own notes, then the rest.
	if (embedded) {
		const todo = draft.lines.filter((l) => !l.refused && !l.done).length;
		const work = draft.lines.filter((l) => !l.refused).length;
		const mechanic = staff.find((m) => m.id === draft.staffId);
		const bay = bays.find((b) => b.id === draft.bayId);
		const toggleDone = (line) => {
			try {
				setLineDone(order.id, line.id, !line.done);
			} catch (error) {
				toast.error(error.message);
			}
		};
		const makeInvoice = () => {
			try {
				flush();
				walk({ kind: "invoice", id: invoiceForWorkOrder(order.id).id, direction: "forward" });
			} catch (error) {
				toast.error(error.message);
			}
		};
		return (
			<div className="space-y-7 pt-3">
				<JobWarnings order={order} />

				<SheetGroup title="Ce reclamă clientul">
					<div className="overflow-hidden rounded-[14px] bg-card">
						<textarea value={draft.complaint ?? ""} readOnly={locked} onChange={(e) => update({ complaint: e.target.value })} placeholder="Ce spune clientul, cu vorbele lui" aria-label="Ce reclamă clientul" className={cn(sheetField, "text-[16px]")} rows={1} />
						<div className="ml-4 h-px bg-border" />
						<textarea value={draft.diagnosis ?? ""} readOnly={locked} onChange={(e) => update({ diagnosis: e.target.value })} placeholder="Diagnostic: ce a găsit mecanicul" aria-label="Diagnostic" className={cn(sheetField, "text-[15px] text-muted-foreground")} rows={1} />
					</div>
				</SheetGroup>

				<SheetGroup title="Recepția" aside={summary.urgent + summary.attention > 0 ? [summary.urgent && `${summary.urgent} urgent`, summary.attention && `${summary.attention} atenție`].filter(Boolean).join(" · ") : null}>
					<div className="overflow-hidden rounded-[14px] bg-card">
						<SheetRow icon={Gauge} color="#0a84ff" label="Kilometraj la primire" value={order.mileage != null ? fmtKm(order.mileage) : "—"} />
						<SheetRow icon={Fuel} color="#30b0c7" label="Combustibil" value={order.fuelLevel != null ? FUEL_LEVELS[order.fuelLevel] : "—"} />
						<div className="border-t px-4 py-3">
							<p className="mb-2 flex items-center gap-2 text-[15px] font-medium">
								<ClipboardCheck className="size-4 text-muted-foreground" aria-hidden /> Inspecție
								<span className="text-[13px] font-normal text-muted-foreground">recomandările ajung în mesajul către client</span>
							</p>
							<InspectionChecklist items={draft.inspection} onChange={(inspection) => update({ inspection })} readOnly={locked} />
						</div>
					</div>
				</SheetGroup>

				<SheetGroup title="De făcut la mașină" aside={work ? (todo ? `${todo} din ${work} rămase` : "toate gata") : null}>
					<ul id={`job-lines-${order.id}`} className="scroll-mt-24 overflow-hidden rounded-[14px] bg-card [&>li+li]:border-t">
						<IosLines lines={draft.lines} onChange={(lines) => update({ lines })} staff={staff} vatPayer={vatPayer} readOnly={locked || Boolean(invoice && invoice.status !== "draft" && invoice.status !== "cancelled")} defaultStaffId={draft.staffId ?? member?.id ?? null} currency={settings.currency} onToggleDone={toggleDone} hideTotal />
					</ul>
				</SheetGroup>

				<SheetGroup title="Deviz" aside={draft.lines.length ? <Money value={totals.gross} /> : null}>
					<div className="overflow-hidden rounded-[14px] bg-card">
						{draft.lines.length > 0 && (
							<div className="px-4 py-3">
								<TotalsBlock totals={totals} vatPayer={vatPayer} currency={settings.currency} />
							</div>
						)}
						{customer?.phone && (
							<a href={whatsappHref(customer.phone, message)} target="_blank" rel="noreferrer" className={sheetLink}>
								<MessageCircle className="size-[18px]" aria-hidden /> Trimite devizul pe WhatsApp
							</a>
						)}
						{customer?.phone && (
							<a href={smsHref(customer.phone, message)} className={sheetLink}>
								<MessageSquareText className="size-[18px]" aria-hidden /> Trimite prin SMS
							</a>
						)}
						<button type="button" onClick={() => setEstimateOpen(true)} className={sheetLink}>
							<Printer className="size-[18px]" aria-hidden /> Vezi devizul (PDF)
						</button>
					</div>
				</SheetGroup>

				<SheetGroup title="Factură">
					<div className="overflow-hidden rounded-[14px] bg-card">
						{invoice ? (
							<button type="button" onClick={() => walk({ kind: "invoice", id: invoice.id, direction: "forward" })} className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-foreground/[0.04]">
								<FileText className="size-[18px] text-muted-foreground" aria-hidden />
								<span className="flex-1 text-[16px]">{invoice.number == null ? "Ciornă" : formatInvoiceNumber(invoice.series, invoice.number)}</span>
								<Money value={invoice.totals?.gross ?? totals.gross} className="text-muted-foreground" />
								<ChevronRight className="size-4 text-muted-foreground/60" aria-hidden />
							</button>
						) : (
							<>
								<p className="px-4 pt-3 text-[15px] text-muted-foreground">Nu e făcută încă. Se face când lucrarea e gata, înainte de predare.</p>
								<button type="button" disabled={!draft.lines.length} onClick={makeInvoice} className={cn(sheetLink, "border-t-0 disabled:text-muted-foreground")}>
									<FilePlus2 className="size-[18px]" aria-hidden /> Fă factura din deviz
								</button>
							</>
						)}
					</div>
				</SheetGroup>

				<SheetGroup title="Note interne" aside="doar pentru atelier">
					<div className="overflow-hidden rounded-[14px] bg-[color-mix(in_srgb,#ffd60a_16%,var(--card))]">
						<textarea value={draft.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} placeholder="ex. clientul așteaptă în service, a cerut piesele vechi" aria-label="Note interne" className={cn(sheetField, "text-[16px]")} rows={2} />
					</div>
				</SheetGroup>

				<SheetGroup title="Mai multe">
					<div className="overflow-hidden rounded-[14px] bg-card">
						<SheetSelect label="Mecanic" value={draft.staffId} options={staff} disabled={locked} onChange={(staffId) => update({ staffId })} />
						<SheetSelect label="Post" value={draft.bayId} options={bays} disabled={locked} onChange={(bayId) => update({ bayId })} />
						<div className="border-t px-4 py-3">
							<JobState order={order} moves={moves} onReview={askReview} />
						</div>
						<div className="border-t px-4 py-3">
							<Timeline items={timeline.length ? timeline : [{ id: "c", title: ACTIVITY_LABEL.created, meta: fmtDate(order.createdAt) }]} />
						</div>
					</div>
					<p className="px-1 pt-1.5 text-xs text-muted-foreground">
						Deschisă {fmtDate(order.createdAt, "d MMM, HH:mm")}
						{mechanic ? ` · ${mechanic.name}` : ""}
						{bay ? ` · ${bay.name}` : ""}
					</p>
				</SheetGroup>

				<Sheet
					open={estimateOpen}
					onOpenChange={setEstimateOpen}
					title={`Deviz #${order.number}`}
					footer={
						<Button onClick={() => printPage(`Deviz ${order.number}`)} className="max-md:h-11">
							<Printer /> Tipărește / PDF
						</Button>
					}
				>
					<InvoiceDocument invoice={estimateDoc} snapshot={snapshot} totals={totals} currency={settings.currency} heading="Deviz estimativ" numberLabel={`Lucrarea ${fmtWorkOrder(order.number)}`} legal={false} />
				</Sheet>
			</div>
		);
	}

	return (
		<Page width="wide" embedded={embedded}>
			{embedded ? (
				<PageHeader
				embedded={embedded}
				back={{ href: "/work-orders/", label: "Lucrări" }}
				title={visitTitle({ vehicle }, fmtWorkOrder(order.number), customer?.name ?? (orderKind(order) === "estimate" ? "Deviz" : "Lucrare"))}
				kind={orderKind(order)}
				state={today ? orderLook(order, { today, appointment }) : undefined}
				// In a sheet the sheet's header carries the bar; on the page, the page's.
				bar={embedded ? null : <VisitBarFor from="work-order" record={order} inSheet={false} />}
				make={vehicle?.make}
				meta={
					<div className="space-y-4">
						<JobWarnings order={order} />
						<JobState order={order} moves={moves} onReview={askReview} />
						<p className="text-xs text-muted-foreground">Deschisă {fmtDate(order.createdAt, "d MMM, HH:mm")}</p>
					</div>
				}
				actions={
					<>
<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline">
									<Send /> <span className="max-sm:hidden">Deviz</span>
								</Button>
							</DropdownMenuTrigger>
							{estimateMenu}
						</DropdownMenu>
						{order.status === "estimate" && !order.invoiceId && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" aria-label="Mai multe acțiuni">
										<EllipsisVertical />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-56">
									<DropdownMenuItem variant="destructive" onSelect={remove}>
										<Trash2 /> Șterge devizul
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</>
				}
				/>

			) : (
				<>
					{/* The page of a job takes its car's colour (docs/DESIGN.md §1): the header fades into the page. */}
					<CarHeader
						make={vehicle?.make}
						plate={vehicle?.plate}
						status={order.status === "estimate" ? "Deviz · așteaptă aprobarea" : WORK_ORDER_STATUS[order.status]?.label}
						eyebrow={`${order.status === "estimate" ? "Devizul" : "Lucrarea"} #${order.number} · ${vehicleName(vehicle) || "Mașină"}`}
						title={jobHeadline(order)}
						facts={[customer?.name, customer?.phone, order.mileage != null ? fmtKm(order.mileage) : null, staff.find((m) => m.id === order.staffId)?.name, bays.find((b) => b.id === order.bayId)?.name].filter(Boolean).join(" · ")}
						back={
							<Link href="/work-orders/" className="mb-4 inline-flex items-center gap-0.5 text-[13px] opacity-75 hover:opacity-100">
								<ChevronLeft className="size-4" aria-hidden /> Atelier
							</Link>
						}
						actions={
							<>
								{primary && (
									<CoverButton large icon={primary.icon} onClick={primary.run}>
										{primary.label}
									</CoverButton>
								)}
								{customer?.phone && (
									<a href={`tel:${customer.phone}`} aria-label={`Sună: ${customer.name}`} className={coverIconClass(light, true)}>
										<Phone className="size-3.5" aria-hidden />
									</a>
								)}
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<CoverIconButton large light={light} icon={Send} label="Trimite devizul" />
									</DropdownMenuTrigger>
									{estimateMenu}
								</DropdownMenu>
								{order.status === "estimate" && !order.invoiceId && (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<CoverIconButton large light={light} icon={MoreHorizontal} label="Mai multe acțiuni" />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end" className="w-56">
											<DropdownMenuItem variant="destructive" onSelect={remove}>
												<Trash2 /> Șterge devizul
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</>
						}
						footer={<ClockLine order={order} />}
					/>
					<div className="mb-6 space-y-4">
						<JobWarnings order={order} />
						<JobState order={order} moves={moves} onReview={askReview} />
						<p className="text-xs text-muted-foreground">Deschisă {fmtDate(order.createdAt, "d MMM, HH:mm")}</p>
					</div>
					<JobSteps order={order} locked={locked} />
					<div className="h-6" />
				</>
			)}

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
								{customer?.phone && <ContactActions phone={customer.phone} message={order.status === "ready" ? readyMessage({ customer, vehicle, settings }) : undefined} />}
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

						<Card id={`job-lines-${order.id}`} className="scroll-mt-24">
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

			{/* On a phone the next step also sits in the bottom bar, in reach of the thumb. */}
			{next && (
				<StickyBar inline={embedded} className="md:hidden">
					<Button className="h-11 flex-1" onClick={() => moves.perform(next)}>
						{nextLabel(next)}
					</Button>
				</StickyBar>
			)}

			<Sheet
				open={estimateOpen}
				onOpenChange={setEstimateOpen}
				title={`Deviz #${order.number}`}
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
