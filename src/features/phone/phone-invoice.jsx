"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, BadgeCheck, ChevronLeft, ChevronRight, FileText, RefreshCw, TriangleAlert, Wrench, X } from "lucide-react";
import { useConfirm } from "@/components/ds/confirm";
import { IosCaps, IosHeader, IosPill } from "@/components/ds/ios";
import { NavGroup, PhoneNavBar } from "@/components/ds/nav-bar";
import { SwipeRow } from "@/components/ds/swipe-row";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { whatsappHref } from "@/domain/customer";
import { diffDaysISO } from "@/domain/dates";
import { buildSnapshot, formatInvoiceNumber, invoiceMessage, issueProblems } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { draftBehindOrder } from "@/domain/work-order";
import { STATE, TONE_COLOR } from "@/lib/colors";
import { fmtDate, formatMoney } from "@/lib/format";
import { printPage, useDraft } from "@/lib/hooks";
import { INVOICE_STATE, PAYMENT_METHODS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { deleteInvoiceDraft, deletePayment, issueAndPayInvoice, issueInvoiceDraft, redoInvoice, refreshDraftFromOrder, stornoInvoiceById, updateInvoiceDraft } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive, selectInvoiceStates, selectPaymentsByInvoice } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { IosLines } from "@/features/lines/ios-lines";
import { InvoiceDocument } from "@/features/invoices/invoice-document";

// An invoice on a phone, as the iPhone app's InvoiceDetailView (ios-native/Garaj/Views/InvoiceDetailView.swift),
// strictly (owner, 17 Nov 2026). Issued: its state and amount, the printed page small (a tap shows it whole), Încasează
// and the WhatsApp reminder, Detalii, Plăți, its job, Stornează. A draft: Emite (and pay at once), what is missing, the
// client and dates, the lines, the total, the notes, Șterge ciorna.

const card = "overflow-hidden rounded-[20px] bg-card [&>li+li]:border-t [&>li+li]:[border-image:linear-gradient(to_right,transparent_16px,var(--border)_16px)_1]";
const display = (day) => (day ? fmtDate(day, "dd.MM.yyyy") : "—");
const primary = "flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-foreground text-[17px] font-semibold text-background active:opacity-80 disabled:opacity-40";
const secondary = "flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-[17px] font-semibold active:opacity-80 disabled:opacity-40";

function Row({ label, children, sub }) {
	return (
		<li className="flex min-h-[52px] items-center gap-3 px-4 py-2">
			<span className="flex min-w-0 shrink-0 flex-col">
				<span className="text-[17px]">{label}</span>
				{sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}
			</span>
			<span className="min-w-0 flex-1 truncate text-right text-[17px] text-muted-foreground">{children}</span>
		</li>
	);
}

function useScrolled(at) {
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > at);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [at]);
	return scrolled;
}

function Nav({ title, scrolled, actions }) {
	const router = useRouter();
	return (
		<PhoneNavBar
			title={title}
			collapsed={scrolled}
			ink="var(--foreground)"
			autoBack={false}
			actions={actions}
			leading={
				<NavGroup>
					<button type="button" onClick={() => router.back()} aria-label="Înapoi" className="flex size-11 items-center justify-center rounded-full active:opacity-60">
						<ChevronLeft className="size-6" aria-hidden />
					</button>
				</NavGroup>
			}
		/>
	);
}

const PAGE = 680; // px: the A4 page's layout (two columns, no VAT column), as printed

/** The printed page at the width it has, clipped to 390 pt; prints whole (print: no scale). */
function Paper({ children, onOpen }) {
	const box = useRef(null);
	const [scale, setScale] = useState(0.6);
	useEffect(() => {
		const el = box.current;
		if (!el) return undefined;
		const fit = () => setScale(el.offsetWidth / PAGE);
		fit();
		const observer = new ResizeObserver(fit);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return (
		<button ref={box} type="button" onClick={onOpen} aria-label="Factura, atinge pentru toată pagina" className="relative block h-[390px] w-full overflow-hidden rounded-[10px] bg-white text-left shadow-[0_4px_12px_rgb(0_0_0/0.08),0_0_0_0.5px_var(--border)] print:h-auto print:overflow-visible print:shadow-none">
			<div className="w-[680px] origin-top-left [transform:scale(var(--paper-scale))] print:w-auto print:transform-none" style={{ "--paper-scale": scale }}>
				{children}
			</div>
		</button>
	);
}

/** DocumentSheet: the whole page, full screen, to read; "×" closes it. */
function DocumentOverlay({ open, onClose, title, children }) {
	useEffect(() => {
		if (!open) return undefined;
		const onKey = (event) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);
	if (!open || typeof document === "undefined") return null;
	return createPortal(
		<div role="dialog" aria-modal aria-label={title} data-print="hide" className="fixed inset-0 z-50 overflow-auto bg-background">
			<div className="sticky top-0 z-10 flex h-11 items-center justify-between bg-background/85 px-4 backdrop-blur-xl" style={{ marginTop: "var(--safe-top)" }}>
				<span className="text-[17px] font-semibold">{title}</span>
				<NavGroup>
					<button type="button" onClick={onClose} aria-label="Închide" className="flex size-11 items-center justify-center rounded-full">
						<X className="size-5" aria-hidden />
					</button>
				</NavGroup>
			</div>
			<div className="overflow-x-auto p-2">
				<div className="w-[680px] rounded-lg bg-white">{children}</div>
			</div>
		</div>,
		document.body,
	);
}

export function PhoneInvoice({ invoice }) {
	return invoice.status === "draft" ? <PhoneDraft key={invoice.id} invoice={invoice} /> : <PhoneIssued invoice={invoice} />;
}

// ── Issued ───────────────────────────────────────────────────────────────────────────────────────────────────────

function PhoneIssued({ invoice }) {
	const router = useRouter();
	const confirm = useConfirm();
	const settings = useSettings();
	const today = useToday();
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customer = useEntity("customers", invoice.customerId);
	const order = useEntity("workOrders", invoice.workOrderId);
	const [whole, setWhole] = useState(false);
	const scrolled = useScrolled(60);
	const list = selectPaymentsByInvoice(payments).get(invoice.id) ?? [];
	const info = today ? selectInvoiceStates(invoices, payments, today).get(invoice.id) : null;
	const state = info?.state ?? "issued";
	const style = INVOICE_STATE[state];
	const balance = info?.balance ?? 0;
	const number = formatInvoiceNumber(invoice.series, invoice.number);
	const money = (v) => formatMoney(v, settings.currency);
	const phone = customer?.phone || invoice.snapshot?.buyer?.phone;
	const other = invoices[invoice.stornoOf ?? invoice.stornoId];
	const due = invoice.dueDate && today ? diffDaysISO(today, invoice.dueDate) : null;
	const doc = <InvoiceDocument invoice={invoice} snapshot={invoice.snapshot} totals={invoice.totals} currency={settings.currency} />;

	const storno = async () => {
		const ok = await confirm({ title: `Stornezi factura ${number}?`, description: "Se emite o factură de stornare cu valori negative, piesele revin în stoc, iar lucrarea poate fi refacturată. Nu se poate anula.", confirmLabel: "Stornează", destructive: true });
		if (!ok) return;
		try {
			const { storno: created, refundDue: refund } = await stornoInvoiceById(invoice.id);
			toast.success(`Stornare emisă: ${formatInvoiceNumber(created.series, created.number)}${refund > 0 ? `. Clientul a plătit deja ${money(refund)}; dă-i banii înapoi.` : ""}`);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const redo = () => {
		try {
			const draft = redoInvoice(invoice.id);
			toast.success("Ciorna nouă e gata.");
			router.push(`/invoices/detail/?id=${draft.id}`);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const removePayment = async (p) => {
		if (!(await confirm({ title: "Ștergi plata?", description: "Soldul facturii crește cu suma plății.", confirmLabel: "Șterge plata", destructive: true }))) return;
		try {
			deletePayment(p.id);
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<div className="pb-10">
			<Nav
				title={number}
				scrolled={scrolled}
				actions={
					<button type="button" onClick={() => printPage(`Factura ${number}`)} className="h-11 px-4 text-[17px] active:opacity-60">
						PDF
					</button>
				}
			/>
			<div className="mx-auto max-w-xl space-y-6 px-4 pt-[calc(var(--safe-top)+3.5rem)]">
				<section className="space-y-2">
					<div className="flex items-center justify-between px-1" data-print="hide">
						{style && <IosPill color={TONE_COLOR[style.tone]} className="h-5 rounded-full text-[12px] font-semibold">{style.label}</IosPill>}
						<span className="text-[15px] font-semibold tabular-nums">{["partial", "overdue"].includes(state) ? `rest ${money(balance)}` : money(invoice.totals.gross)}</span>
					</div>
					<Paper onOpen={() => setWhole(true)}>{doc}</Paper>
				</section>
				<div className="space-y-2.5" data-print="hide">
					{["issued", "partial", "overdue"].includes(state) && (
						<button type="button" onClick={() => openSheet("payment", { invoiceId: invoice.id })} className={primary}>
							Încasează {money(balance)}
						</button>
					)}
					{phone && !invoice.stornoOf && (
						<a href={whatsappHref(phone, invoiceMessage({ invoice, balance, settings }))} target="_blank" rel="noreferrer" className={secondary}>
							Trimite pe WhatsApp
						</a>
					)}
				</div>
				<section className="space-y-1.5" data-print="hide">
					<IosHeader title="Detalii" />
					<ul className={card}>
						{customer && <Row label="Client">{customer.name}</Row>}
						<Row label="Data emiterii">{display(invoice.issueDate)}</Row>
						{invoice.dueDate && <Row label="Scadență">{display(invoice.dueDate)}</Row>}
						{other && (
							<li>
								<Link href={`/invoices/detail/?id=${other.id}`} className="flex min-h-[52px] items-center gap-3 px-4">
									<span className="text-[17px]">{invoice.stornoOf ? "Stornează" : "Stornată prin"}</span>
									<span className="flex-1 text-right text-[17px] text-muted-foreground">{formatInvoiceNumber(other.series, other.number)}</span>
									<ChevronRight className="size-[18px] text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
								</Link>
							</li>
						)}
					</ul>
				</section>
				{!invoice.stornoOf && (
					<section className="space-y-1.5" data-print="hide">
						<IosHeader title="Plăți" />
						<ul className={card}>
							{list.map((p) => (
								<li key={p.id}>
									<SwipeRow trailing={[{ key: "delete", label: "Șterge", icon: X, tone: "red", onSelect: () => removePayment(p) }]}>
										<div className="flex min-h-[52px] items-center gap-3 bg-card px-4 py-2">
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="text-[17px]">{PAYMENT_METHODS[p.method]?.label ?? p.method}</span>
												<span className="truncate text-[12px] text-muted-foreground">
													{display(p.date)}
													{p.note ? ` · ${p.note}` : ""}
												</span>
											</span>
											<span className="shrink-0 text-[17px] text-muted-foreground tabular-nums">{money(p.amount)}</span>
										</div>
									</SwipeRow>
								</li>
							))}
							{!list.length && (
								<li className="flex flex-col px-4 py-3">
									<span className="text-[17px]">Nicio plată încă</span>
									{invoice.dueDate && (
										<span className="text-[15px] text-muted-foreground">
											Scadentă pe {display(invoice.dueDate)}
											{due > 0 ? `, peste ${due === 1 ? "o zi" : `${due} zile`}` : due === 0 ? ", azi" : ""}
										</span>
									)}
								</li>
							)}
						</ul>
					</section>
				)}
				{order && (
					<ul className={card} data-print="hide">
						<li>
							<Link href={`/work-orders/detail/?id=${order.id}`} className="flex min-h-[52px] items-center gap-3 px-4">
								<Wrench className="size-5 text-brand" aria-hidden />
								<span className="flex-1 text-[17px]">Lucrarea #{order.number}</span>
								<ChevronRight className="size-[18px] text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
							</Link>
						</li>
					</ul>
				)}
				{invoice.status === "issued" && !invoice.stornoOf && (
					<button type="button" onClick={storno} data-print="hide" className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-card text-[17px]" style={{ color: STATE.late }}>
						Stornează factura
					</button>
				)}
				{invoice.status === "cancelled" && (
					<button type="button" onClick={redo} data-print="hide" className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-card text-[17px] text-brand">
						Reface factura
					</button>
				)}
			</div>
			<DocumentOverlay open={whole} onClose={() => setWhole(false)} title={number}>
				<InvoiceDocument invoice={invoice} snapshot={invoice.snapshot} totals={invoice.totals} currency={settings.currency} />
			</DocumentOverlay>
		</div>
	);
}

// ── Draft ────────────────────────────────────────────────────────────────────────────────────────────────────────

function PhoneDraft({ invoice }) {
	const router = useRouter();
	const confirm = useConfirm();
	const settings = useSettings();
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const staff = selectActive(useCollection("staff"));
	const order = useEntity("workOrders", invoice.workOrderId);
	const [preview, setPreview] = useState(false);
	const [busy, setBusy] = useState(false);
	const scrolled = useScrolled(60);
	const [draft, update, flush] = useDraft(invoice, (next) =>
		updateInvoiceDraft(invoice.id, { customerId: next.customerId, vehicleId: next.vehicleId, issueDate: next.issueDate, dueDate: next.dueDate, mileage: next.mileage, lines: next.lines, notes: next.notes }),
	);
	const customer = draft.customerId ? customers[draft.customerId] : null;
	const vehicle = draft.vehicleId ? vehicles[draft.vehicleId] : null;
	const vatPayer = settings.invoicing.vatPayer;
	const totals = computeTotals(draft.lines, { vatPayer });
	const problems = issueProblems(draft, { customer });
	const behind = Boolean(order && order.updatedAt > invoice.updatedAt && draftBehindOrder(invoice, order, { settings }));
	const money = (v) => formatMoney(v, settings.currency);
	const style = INVOICE_STATE.draft;
	const people = Object.values(customers).sort((a, b) => String(a.name).localeCompare(String(b.name), "ro"));

	const issue = async () => {
		flush();
		if (problems.length) return toast.error(problems[0]);
		if (!(await confirm({ title: "Emiți factura?", description: `Primește numărul următor din seria ${draft.series}. După emitere nu se mai poate modifica, doar storna.`, confirmLabel: "Emite factura" }))) return;
		setBusy(true);
		try {
			const issued = await issueInvoiceDraft(invoice.id);
			toast.success(`Emisă: ${formatInvoiceNumber(issued.series, issued.number)}`);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setBusy(false);
		}
	};
	const issueAndPay = async (method) => {
		flush();
		setBusy(true);
		try {
			const { invoice: issued } = await issueAndPayInvoice(invoice.id, { method });
			toast.success(`Emisă și încasată: ${formatInvoiceNumber(issued.series, issued.number)}`);
		} catch (error) {
			toast.error(error.message);
		} finally {
			setBusy(false);
		}
	};
	const refresh = () => {
		flush();
		try {
			refreshDraftFromOrder(invoice.id);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const remove = async () => {
		if (!(await confirm({ title: "Ștergi ciorna?", description: "Ciorna nu are număr, deci se poate șterge fără urme.", confirmLabel: "Șterge", destructive: true }))) return;
		deleteInvoiceDraft(invoice.id);
		router.replace("/invoices/");
	};
	const field = "min-w-0 flex-1 bg-transparent text-right text-[17px] text-muted-foreground outline-none";

	return (
		<div className="pb-10">
			<Nav title="Ciornă" scrolled={scrolled} actions={null} />
			<div className="mx-auto max-w-xl space-y-6 px-4 pt-[calc(var(--safe-top)+3.5rem)]">
				<section className="flex flex-col gap-3 rounded-[20px] bg-card p-4">
					<span className="flex items-center gap-3">
						<span className="flex size-11 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${TONE_COLOR[style.tone]} 15%, transparent)`, color: TONE_COLOR[style.tone] }}>
							<FileText className="size-6" aria-hidden />
						</span>
						<span className="flex flex-col gap-0.5">
							<span className="text-[20px] leading-[25px] font-semibold">{style.label}</span>
							<span className="text-[15px] text-muted-foreground tabular-nums">{money(totals.gross)}</span>
						</span>
					</span>
					<button type="button" onClick={issue} disabled={busy || problems.length > 0} className={primary}>
						<BadgeCheck className="size-5" aria-hidden /> Emite factura
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger disabled={busy || problems.length > 0} className={secondary}>
							<Banknote className="size-5" aria-hidden /> Emite și încasează integral
						</DropdownMenuTrigger>
						<DropdownMenuContent align="center" className="w-60">
							{Object.entries(PAYMENT_METHODS).map(([key, m]) => (
								<DropdownMenuItem key={key} onSelect={() => issueAndPay(key)}>
									<m.icon /> {m.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					{problems.map((p) => (
						<p key={p} className="flex items-start gap-2 text-[15px]" style={{ color: STATE.wait }}>
							<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {p}
						</p>
					))}
				</section>

				<ul className={card}>
					<li className="flex min-h-[52px] items-center gap-3 px-4">
						<span className="text-[17px]">Client</span>
						<select value={draft.customerId ?? ""} onChange={(e) => update({ customerId: e.target.value || null })} aria-label="Client" className={cn(field, "appearance-none")}>
							<option value="">Alege</option>
							{people.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</select>
						<ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
					</li>
					<li className="flex min-h-[52px] items-center gap-3 px-4">
						<span className="text-[17px]">Data emiterii</span>
						<input type="date" value={draft.issueDate ?? ""} onChange={(e) => update({ issueDate: e.target.value })} aria-label="Data emiterii" className={field} />
					</li>
					<li className="flex min-h-[52px] items-center gap-3 px-4">
						<span className="text-[17px]">Scadență</span>
						<input type="date" value={draft.dueDate ?? ""} onChange={(e) => update({ dueDate: e.target.value })} aria-label="Scadență" className={field} />
					</li>
				</ul>

				{behind && (
					<ul className={card}>
						<li>
							<button type="button" onClick={refresh} className="flex min-h-[52px] w-full items-center gap-2 px-4 text-left text-[17px] text-brand">
								<RefreshCw className="size-5" aria-hidden /> Lucrarea s-a schimbat: ia din nou liniile
							</button>
						</li>
					</ul>
				)}

				<section className="space-y-1.5">
					<IosCaps>Linii</IosCaps>
					<ul className="overflow-hidden rounded-[20px] bg-card [&>li+li]:border-t">
						<IosLines lines={draft.lines} onChange={(lines) => update({ lines })} staff={staff} vatPayer={vatPayer} currency={settings.currency} hideTotal addLabel="Adaugă o linie" />
					</ul>
				</section>

				{draft.lines.length > 0 && (
					<section className="space-y-1.5">
						<IosCaps>Total</IosCaps>
						<ul className={card}>
							{vatPayer && <Row label="Fără TVA">{money(totals.net)}</Row>}
							{vatPayer &&
								totals.byRate.map((g) => (
									<Row key={g.rate} label={`TVA ${g.rate}%`}>
										{money(g.vat)}
									</Row>
								))}
							<li className="flex min-h-[52px] items-center gap-3 px-4">
								<span className="flex-1 text-[17px] font-semibold">Total de plată</span>
								<span className="text-[17px] font-semibold tabular-nums">{money(totals.gross)}</span>
							</li>
						</ul>
					</section>
				)}

				<section className="space-y-1.5">
					<IosCaps>Mențiuni pe factură</IosCaps>
					<ul className={card}>
						<li>
							<textarea value={draft.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} placeholder="Mențiuni" aria-label="Mențiuni" rows={1} className="w-full resize-none bg-transparent px-4 py-3 text-[17px] outline-none [field-sizing:content] placeholder:text-muted-foreground/70" />
						</li>
						<li>
							<button type="button" onClick={() => (flush(), setPreview(true))} className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[17px] text-brand">
								<FileText className="size-5" aria-hidden /> Previzualizează
							</button>
						</li>
					</ul>
				</section>

				<button type="button" onClick={remove} className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-card text-[17px]" style={{ color: STATE.late }}>
					Șterge ciorna
				</button>
			</div>
			<DocumentOverlay open={preview} onClose={() => setPreview(false)} title="Ciornă">
				<InvoiceDocument invoice={draft} snapshot={buildSnapshot({ settings, customer, vehicle, mileage: draft.mileage })} totals={totals} currency={settings.currency} draft />
			</DocumentOverlay>
		</div>
	);
}
