"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	Banknote,
	CarFront,
	CircleCheck,
	EllipsisVertical,
	Eye,
	FileCheck2,
	FileSearch,
	MessageCircle,
	MessageSquareText,
	Printer,
	Send,
	Share2,
	Trash2,
	Undo2,
	User,
	Wrench,
} from "lucide-react";
import { useRemember } from "@/lib/recents";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { useConfirm } from "@/components/ds/confirm";
import { Banner, EmptyState, Meter, Money, Timeline } from "@/components/ds/data";
import { Field } from "@/components/ds/inputs";
import { Page, PageHeader, SplitView, StickyBar } from "@/components/ds/page";
import { Sheet } from "@/components/ds/sheet";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { StatusBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { smsHref, whatsappHref } from "@/domain/customer";
import { diffDaysISO } from "@/domain/dates";
import { buildSnapshot, formatInvoiceNumber, invoiceMessage, issueProblems } from "@/domain/invoice";
import { InvoiceLinks, useWalk } from "@/features/flow/visit-links";
import { draftBehindOrder } from "@/domain/work-order";
import { InvoiceState } from "./invoice-state";
import { computeTotals } from "@/domain/lines";
import { fmtDate, fmtDays, fmtWorkOrder } from "@/lib/format";
import { printPage, shareText, useDraft, useQueryId } from "@/lib/hooks";
import { INVOICE_STATE, PAYMENT_METHODS } from "@/lib/labels";
import { closeSheet, openSheet } from "@/lib/sheets";
import {
	deleteInvoiceDraft,
	deletePayment,
	issueAndPayInvoice,
	issueInvoiceDraft,
	redoInvoice,
	refreshDraftFromOrder,
	stornoInvoiceById,
	updateInvoiceDraft,
} from "@/lib/store/actions";
import { useCollection, useEntity, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive, selectInvoiceStates, selectPaymentsByInvoice } from "@/lib/store/selectors";
import { LinesEditor } from "@/features/lines/lines-editor";
import { TotalsBlock } from "@/features/lines/totals-block";
import { CustomerPicker, VehiclePicker } from "@/features/pickers/entity-pickers";
import { InvoiceDocument } from "./invoice-document";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

export function InvoiceDetail() {
	const id = useQueryId();
	const ready = useIsReady();
	const invoice = useEntity("invoices", id);
	if (!ready) return <DetailPageSkeleton />;
	if (!invoice) {
		return (
			<Page>
				<PageHeader title="Factură" back={{ href: "/invoices/", label: "Facturi" }} />
				<EmptyState icon={FileSearch} title="Factura nu există" description="A fost ștearsă sau linkul este greșit." />
			</Page>
		);
	}
	return invoice.status === "draft" ? <DraftInvoice key={invoice.id} invoice={invoice} /> : <IssuedInvoice invoice={invoice} />;
}

/** The whole invoice page (draft editor or issued view), for the overlay. */
export function InvoiceEmbedded({ invoice }) {
	return invoice.status === "draft" ? <DraftInvoice key={invoice.id} invoice={invoice} embedded /> : <IssuedInvoice invoice={invoice} embedded />;
}

// ── draft ────────────────────────────────────────────────────────────────────

function DraftInvoice({ invoice, embedded = false }) {
	useRemember("invoice", invoice.id);
	const router = useRouter();
	const confirm = useConfirm();
	const settings = useSettings();
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const staff = selectActive(useCollection("staff"));
	const [preview, setPreview] = useState(false);
	const [issuing, setIssuing] = useState(false);
	const [draft, update, flush] = useDraft(invoice, (next) =>
		updateInvoiceDraft(invoice.id, {
			customerId: next.customerId,
			vehicleId: next.vehicleId,
			issueDate: next.issueDate,
			dueDate: next.dueDate,
			mileage: next.mileage,
			lines: next.lines,
			notes: next.notes,
		}),
	);

	const customer = draft.customerId ? customers[draft.customerId] : null;
	const vehicle = draft.vehicleId ? vehicles[draft.vehicleId] : null;
	const order = useEntity("workOrders", invoice.workOrderId);
	const today = useToday();
	const vatPayer = settings.invoicing.vatPayer;
	const totals = computeTotals(draft.lines, { vatPayer });
	const problems = issueProblems(draft, { customer });
	// The job changed after the draft was last touched, and would bill something else now.
	const behind = Boolean(order && order.updatedAt > invoice.updatedAt && draftBehindOrder(invoice, order, { settings }));
	const scrollTo = (part) => document.getElementById(`invoice-${part}-${invoice.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

	const issueAndPay = async (method) => {
		flush();
		setIssuing(true);
		try {
			const { invoice: issued } = await issueAndPayInvoice(invoice.id, { method });
			toast.success(`Factura ${formatInvoiceNumber(issued.series, issued.number)} a fost emisă și încasată.`);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIssuing(false);
		}
	};
	const refresh = () => {
		flush();
		try {
			refreshDraftFromOrder(invoice.id);
			toast.success("Liniile au fost luate din nou din lucrare.");
		} catch (error) {
			toast.error(error.message);
		}
	};
	const fix = (code) => {
		if (code === "cui" && customer) openSheet("customer", { id: customer.id });
		else scrollTo(code === "customer" ? "client" : code === "issue_date" || code === "due_date" ? "dates" : "lines");
	};

	const issue = async () => {
		flush();
		if (problems.length) {
			toast.error(problems[0]);
			return;
		}
		const ok = await confirm({
			title: "Emiți factura?",
			description: `Primește numărul următor din seria ${draft.series}. După emitere nu se mai poate modifica, doar storna.`,
			confirmLabel: "Emite factura",
		});
		if (!ok) return;
		setIssuing(true);
		try {
			const issued = await issueInvoiceDraft(invoice.id);
			toast.success(`Factura ${formatInvoiceNumber(issued.series, issued.number)} a fost emisă.`);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setIssuing(false);
		}
	};

	const remove = async () => {
		if (!(await confirm({ title: "Ștergi ciorna?", description: "Ciorna nu are număr, deci se poate șterge fără urme.", confirmLabel: "Șterge", destructive: true }))) return;
		deleteInvoiceDraft(invoice.id);
		toast.success("Ciorna a fost ștearsă.");
		if (embedded) closeSheet();
		else router.replace("/invoices/");
	};

	const snapshot = buildSnapshot({ settings, customer, vehicle, mileage: draft.mileage });

	return (
		<Page width="wide" embedded={embedded}>
			<PageHeader
				embedded={embedded}
				back={{ href: "/invoices/", label: "Facturi" }}
				title="Factură nouă"
				description={`Seria ${draft.series} · numărul se alocă la emitere`}
				meta={
					<div className="space-y-4">
						<InvoiceLinks invoice={invoice} inSheet={embedded} />
						<InvoiceState invoice={draft} today={today} customer={customer} behind={behind} handlers={{ issue, issueAndPay, remove, fix, refresh }} />
					</div>
				}
				actions={
					<Button variant="outline" onClick={() => setPreview(true)} className="xl:hidden">
						<Eye /> Previzualizare
					</Button>
				}
			/>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<div className="min-w-0 space-y-6">
					<Card id={`invoice-client-${invoice.id}`} className="scroll-mt-24">
						<CardHeader title="Client și mașină" icon={User} />
						<CardContent className="grid gap-4 sm:grid-cols-2">
							<Field label="Client" required className="sm:col-span-2">
								<CustomerPicker value={draft.customerId} onChange={(customerId) => update({ customerId, vehicleId: customerId === draft.customerId ? draft.vehicleId : null })} />
							</Field>
							<Field label="Mașină">
								<VehiclePicker
									value={draft.vehicleId}
									customerId={draft.customerId}
									onChange={(vehicleId, v) => update({ vehicleId, customerId: draft.customerId ?? v.customerId })}
								/>
							</Field>
							<Field label="Kilometraj">
								{(id) => (
									<Input
										id={id}
										inputMode="numeric"
										value={draft.mileage ?? ""}
										onChange={(e) => update({ mileage: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })}
										placeholder="ex. 123456"
									/>
								)}
							</Field>
						</CardContent>
					</Card>

					<Card id={`invoice-dates-${invoice.id}`} className="scroll-mt-24">
						<CardHeader title="Date" />
						<CardContent className="grid grid-cols-2 gap-4">
							<Field label="Data emiterii">
								{(id) => <Input id={id} type="date" value={draft.issueDate ?? ""} onChange={(e) => update({ issueDate: e.target.value })} />}
							</Field>
							<Field label="Scadență">
								{(id) => <Input id={id} type="date" value={draft.dueDate ?? ""} onChange={(e) => update({ dueDate: e.target.value })} />}
							</Field>
						</CardContent>
					</Card>

					<Card id={`invoice-lines-${invoice.id}`} className="scroll-mt-24">
						<CardHeader title="Linii" description={vatPayer ? "Prețuri fără TVA" : "Neplătitor de TVA"} />
						<CardContent>
							<LinesEditor lines={draft.lines} onChange={(lines) => update({ lines })} staff={staff} vatPayer={vatPayer} />
							{draft.lines.length > 0 && (
								<div className="mt-5 flex justify-end">
									<TotalsBlock totals={totals} vatPayer={vatPayer} currency={settings.currency} className="w-full sm:w-72" />
								</div>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader title="Mențiuni pe factură" />
						<CardContent>
							<Textarea value={draft.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} placeholder="ex. Garanție manoperă 3 luni." />
						</CardContent>
					</Card>

</div>

				<div className="hidden min-w-0 xl:block">
					<div className="sticky top-8">
						<p className="mb-2 text-2xs font-medium tracking-wider text-muted-foreground uppercase">Previzualizare</p>
						<InvoiceDocument invoice={draft} snapshot={snapshot} totals={totals} currency={settings.currency} draft className="text-xs md:p-8" />
					</div>
				</div>
			</div>

			<StickyBar inline={embedded} className="md:hidden">
				<Button className="h-11 flex-1" onClick={issue} disabled={issuing}>
					<FileCheck2 /> Emite factura · <Money value={totals.gross} decimals={0} />
				</Button>
			</StickyBar>

			<Sheet open={preview} onOpenChange={setPreview} title="Previzualizare factură">
				<InvoiceDocument invoice={draft} snapshot={snapshot} totals={totals} currency={settings.currency} draft />
			</Sheet>
		</Page>
	);
}

// ── issued ───────────────────────────────────────────────────────────────────

const ACTIVITY = {
	issued: { title: "Factură emisă", icon: FileCheck2, tone: "blue" },
	cancelled: { title: "Factură stornată", icon: Undo2, tone: "neutral" },
};

function IssuedInvoice({ invoice, embedded = false }) {
	useRemember("invoice", invoice.id);
	const confirm = useConfirm();
	const router = useRouter();
	const settings = useSettings();
	const today = useToday();
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customer = useEntity("customers", invoice.customerId);
	const order = useEntity("workOrders", invoice.workOrderId);
	const vehicle = useEntity("vehicles", invoice.vehicleId);
	const list = selectPaymentsByInvoice(payments).get(invoice.id) ?? [];
	const info = today ? selectInvoiceStates(invoices, payments, today).get(invoice.id) : null;
	const state = info?.state ?? "issued";
	const balance = info?.balance ?? 0;
	const paid = info?.paid ?? 0;
	const number = formatInvoiceNumber(invoice.series, invoice.number);
	const stornoOf = invoice.stornoOf ? invoices[invoice.stornoOf] : null;
	const stornoBy = invoice.stornoId ? invoices[invoice.stornoId] : null;
	const payable = invoice.status === "issued" && !invoice.stornoOf && balance > 0;
	const phone = customer?.phone || invoice.snapshot.buyer?.phone;
	const message = invoiceMessage({ invoice, balance, settings });
	const dueDays = today && invoice.dueDate ? diffDaysISO(today, invoice.dueDate) : null;

	const walk = useWalk(embedded);
	const openInvoice = (id, direction) => walk({ kind: "invoice", id, direction });
	const refund = paid > 0 ? " Plățile încasate rămân de returnat clientului." : "";

	// Storno cannot be undone (the law): the question says so, and says what follows.
	const storno = async () => {
		const ok = await confirm({
			title: `Stornezi factura ${number}?`,
			description: `Se emite o factură de stornare cu valori negative, piesele revin în stoc, iar lucrarea poate fi refacturată. Nu se poate anula.${refund}`,
			confirmLabel: "Stornează",
			destructive: true,
		});
		if (!ok) return;
		try {
			const { storno: created } = await stornoInvoiceById(invoice.id);
			toast.success(`Stornare emisă: ${formatInvoiceNumber(created.series, created.number)}`);
			openInvoice(created.id, "forward");
		} catch (error) {
			toast.error(error.message);
		}
	};

	/** The cancelled invoice made again, as a new draft (from its job's lines when it has one). */
	const redo = () => {
		try {
			const draft = redoInvoice(invoice.id);
			toast.success("Ciornă nouă, din aceleași linii.");
			openInvoice(draft.id, "forward");
		} catch (error) {
			toast.error(error.message);
		}
	};

	// "Stornează și refă": the only way back from an issued invoice, in one confirmation.
	const stornoAndRedo = async () => {
		const ok = await confirm({
			title: `Stornezi și refaci factura ${number}?`,
			description: `Se emite stornarea și se deschide o ciornă nouă cu aceleași linii, pe care o poți corecta înainte de emitere. Stornarea nu se poate anula.${refund}`,
			confirmLabel: "Stornează și refă",
			destructive: true,
		});
		if (!ok) return;
		try {
			await stornoInvoiceById(invoice.id);
			const draft = redoInvoice(invoice.id);
			toast.success("Factura a fost stornată; ciorna nouă e deschisă.");
			openInvoice(draft.id, "forward");
		} catch (error) {
			toast.error(error.message);
		}
	};

	const remind = phone ? () => window.open(whatsappHref(phone, message), "_blank", "noopener") : null;

	const share = async () => {
		const result = await shareText({ title: `Factura ${number}`, text: message });
		if (result === "copied") toast.success("Mesajul a fost copiat.");
	};

	const removePayment = async (payment) => {
		const ok = await confirm({ title: "Ștergi plata?", description: "Soldul facturii crește cu suma plății.", confirmLabel: "Șterge plata", destructive: true });
		if (ok) {
			deletePayment(payment.id);
			toast.success("Plata a fost ștearsă.");
		}
	};

	const timeline = [
		...(invoice.activity ?? []).map((a, i) => ({ id: `a${i}`, ...(ACTIVITY[a.type] ?? { title: a.type, icon: FileCheck2 }), meta: fmtDate(a.at, "d MMM yyyy, HH:mm") })),
		...list.map((p) => ({
			id: p.id,
			title: `Plată ${PAYMENT_METHODS[p.method]?.label.toLowerCase() ?? ""}`,
			icon: CircleCheck,
			tone: "green",
			meta: fmtDate(p.date),
			content: <Money value={p.amount} />,
		})),
	];

	const actions = (
		<>
<Button variant="outline" onClick={() => printPage(`Factura ${number}`)}>
				<Printer /> <span className="max-sm:hidden">Tipărește / PDF</span>
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline">
						<Send /> <span className="max-sm:hidden">Trimite</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					{phone && (
						<>
							<DropdownMenuItem asChild>
								<a href={whatsappHref(phone, message)} target="_blank" rel="noreferrer">
									<MessageCircle /> WhatsApp
								</a>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<a href={smsHref(phone, message)}>
									<MessageSquareText /> SMS
								</a>
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuItem onSelect={share}>
						<Share2 /> Distribuie…
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
</>
	);

	return (
		<Page width="wide" embedded={embedded}>
			<PageHeader
				embedded={embedded}
				back={{ href: "/invoices/", label: "Facturi" }}
				title={invoice.stornoOf ? `Stornare ${number}` : `Factura ${number}`}
				meta={
					<div className="space-y-4">
						<InvoiceLinks invoice={invoice} inSheet={embedded} />
						<InvoiceState
							invoice={invoice}
							payments={list}
							today={today}
							customer={customer}
							currency={settings.currency}
							creditNote={stornoBy}
							original={stornoOf}
							handlers={{ pay: () => openSheet("payment", { invoiceId: invoice.id }), remind, storno, stornoAndRedo, redo, open: openInvoice }}
						/>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<span>Emisă {fmtDate(invoice.issueDate)}</span>
							{customer && (
								<>
									<span aria-hidden>·</span>
									<Link href={`/customers/detail/?id=${customer.id}`} className="font-medium text-foreground hover:underline">
										{customer.name}
									</Link>
								</>
							)}
						</div>
					</div>
				}
				actions={actions}
			/>


			<SplitView
				stacked={embedded}
				main={<InvoiceDocument invoice={invoice} snapshot={invoice.snapshot} totals={invoice.totals} currency={settings.currency} />}
				aside={
					<>
						<Card>
							<CardContent className="space-y-4">
								<div>
									<p className="text-xs font-medium text-muted-foreground">{payable ? "Rest de plată" : invoice.stornoOf ? "Valoare stornată" : "Total"}</p>
									<p className="mt-1 text-display">
										<Money value={payable ? balance : invoice.totals.gross} />
									</p>
									{payable && dueDays != null && (
										<p className={dueDays < 0 ? cn("mt-1 text-sm font-medium", tone("red").text) : "mt-1 text-sm text-muted-foreground"}>
											{dueDays < 0 ? `Restantă de ${Math.abs(dueDays)} ${Math.abs(dueDays) === 1 ? "zi" : "zile"}` : `Scadentă ${fmtDays(dueDays)}`}
										</p>
									)}
								</div>
								{!invoice.stornoOf && invoice.status === "issued" && (
									<div className="space-y-1.5">
										<Meter value={paid} max={invoice.totals.gross} tone={state === "paid" ? "green" : state === "overdue" ? "red" : "blue"} label="Încasat" />
										<div className="flex justify-between text-xs text-muted-foreground">
											<span>
												Încasat <Money value={paid} />
											</span>
											<span>
												din <Money value={invoice.totals.gross} />
											</span>
										</div>
									</div>
								)}
								{payable && (
									<Button className="w-full max-md:h-11" onClick={() => openSheet("payment", { invoiceId: invoice.id })}>
										<Banknote /> Înregistrează plata
									</Button>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Plăți" description={list.length ? `${list.length} înregistrate` : "Nicio plată încă"} />
							<CardContent className="pt-3">
								{list.length ? (
									<ul className="divide-y">
										{list.map((p) => {
											const Method = PAYMENT_METHODS[p.method]?.icon ?? Banknote;
											return (
												<li key={p.id} className="flex items-center gap-3 py-2.5">
													<Method className="size-4 text-muted-foreground" aria-hidden />
													<div className="min-w-0 flex-1">
														<p className="text-sm font-medium">{PAYMENT_METHODS[p.method]?.label}</p>
														<p className="text-xs text-muted-foreground">
															{fmtDate(p.date)}
															{p.note ? ` · ${p.note}` : ""}
														</p>
													</div>
													<Money value={p.amount} className="text-sm font-medium" />
													<Button variant="ghost" size="icon-sm" aria-label="Șterge plata" onClick={() => removePayment(p)}>
														<Trash2 />
													</Button>
												</li>
											);
										})}
									</ul>
								) : (
									<p className="text-sm text-muted-foreground">Plățile apar aici pe măsură ce le înregistrezi.</p>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Legături" />
							<CardContent className="grid gap-2 pt-3">
{vehicle && (
									<Button asChild variant="outline" className="justify-start">
										<Link href={`/vehicles/detail/?id=${vehicle.id}`}>
											<CarFront /> Istoric mașină
										</Link>
									</Button>
								)}
								{customer && (
									<Button asChild variant="outline" className="justify-start">
										<Link href={`/customers/detail/?id=${customer.id}`}>
											<User /> Fișa clientului
										</Link>
									</Button>
								)}
							</CardContent>
						</Card>

						{timeline.length > 0 && (
							<Card>
								<CardHeader title="Activitate" />
								<CardContent className="pt-4">
									<Timeline items={timeline} />
								</CardContent>
							</Card>
						)}
					</>
				}
			/>

			{payable && (
				<StickyBar inline={embedded} className="md:hidden">
					<Button className="h-11 flex-1" onClick={() => openSheet("payment", { invoiceId: invoice.id })}>
						<Banknote /> Încasează · <Money value={balance} decimals={0} />
					</Button>
				</StickyBar>
			)}
		</Page>
	);
}
