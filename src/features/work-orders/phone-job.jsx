"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FilePlus2, MessageCircle, MessageSquareText, MoreHorizontal, PauseCircle, Phone, Timer } from "lucide-react";
import { MakeLogo } from "@/components/ds/make-logo";
import { useConfirm } from "@/components/ds/confirm";
import { IosCaps, IosPill } from "@/components/ds/ios";
import { NavGroup, PhoneNavBar } from "@/components/ds/nav-bar";
import { Plate } from "@/components/ds/plate";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { smsHref, telHref, whatsappHref } from "@/domain/customer";
import { formatInvoiceNumber, invoiceState } from "@/domain/invoice";
import { vehicleName } from "@/domain/vehicle";
import { isRunning, steps as jobSteps, workedMs } from "@/domain/work-clock";
import { WO_NEXT, WO_TRANSITIONS, estimateMessage, readyMessage } from "@/domain/work-order";
import { STATE, TONE_COLOR, makeCover, makeInk } from "@/lib/colors";
import { useDraft } from "@/lib/hooks";
import { FUELS, INVOICE_STATE, WORK_ORDER_ACTIONS, WORK_ORDER_STATUS } from "@/lib/labels";
import { deleteWorkOrder, invoiceForWorkOrder, setLineDone, updateWorkOrder } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive, selectPaymentsByInvoice } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAccount } from "@/components/shell/account-menu";
import { useTick } from "@/features/running/running-job";
import { IosLines } from "@/features/lines/ios-lines";
import { primaryAction } from "./job-action";
import { clockText, jobHeadline } from "./job-text";
import { moveWorkOrder } from "./status";

// A job on a phone, as the iPhone app's (ios-native/Garaj/Views/WorkOrderDetailView.swift), strictly (owner, 17 Nov
// 2026): the car's cover colour behind the top; its logo, plate and state; what the job is; the next step, call and
// "…"; then Reclamație, Operații și piese, Factură, Note, and Șterge when it may be deleted.

const field = "w-full resize-none bg-transparent px-4 py-3 outline-none [field-sizing:content] placeholder:text-muted-foreground/70 disabled:opacity-100";

export function PhoneJob({ order }) {
	const router = useRouter();
	const confirm = useConfirm();
	const today = useToday();
	const settings = useSettings();
	const customer = useEntity("customers", order.customerId);
	const vehicle = useEntity("vehicles", order.vehicleId);
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const staff = selectActive(useCollection("staff"));
	const { member } = useAccount();
	const [scrolled, setScrolled] = useState(false);
	const [draft, update] = useDraft(order, (next) => updateWorkOrder(order.id, { complaint: next.complaint, diagnosis: next.diagnosis, notes: next.notes, lines: next.lines }));
	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 300);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);
	const running = isRunning(order);
	const now = useTick(running);

	const make = vehicle?.make;
	const ink = makeInk(make);
	const status = WORK_ORDER_STATUS[order.status];
	const locked = ["delivered", "cancelled"].includes(order.status);
	const primary = primaryAction(order, { staffId: member?.id ?? null });
	const next = WO_NEXT[order.status];
	const others = (WO_TRANSITIONS[order.status] ?? []).filter((to) => WORK_ORDER_STATUS[to] && (to !== next || order.status === "in_progress"));
	const phone = customer?.phone ?? "";
	const message = customer ? (order.status === "ready" ? readyMessage({ customer, vehicle, settings }) : estimateMessage({ order: draft, customer, vehicle, settings })) : "";
	const worked = workedMs(order, now);
	const progress = jobSteps(order);
	const invoice = order.invoiceId ? invoices[order.invoiceId] : null;
	const invoiceStateKey = invoice && today ? invoiceState(invoice, selectPaymentsByInvoice(payments).get(invoice.id) ?? [], today) : null;
	const facts = [vehicleName(vehicle), vehicle?.year, vehicle?.fuel ? FUELS[vehicle.fuel]?.toLowerCase() : null, order.mileage != null ? `${order.mileage.toLocaleString("ro-RO")} km` : null].filter(Boolean);
	const deletable = ["estimate", "cancelled"].includes(order.status) && !order.invoiceId;

	const move = async (to) => {
		if (to === "cancelled" && !(await confirm({ title: `Anulezi lucrarea #${order.number}?`, description: "O poți reactiva mai târziu.", confirmLabel: "Anulează lucrarea", destructive: true }))) return;
		moveWorkOrder(order, to);
	};
	const remove = async () => {
		if (!(await confirm({ title: `Ștergi lucrarea #${order.number}?`, description: "Nu se poate anula.", confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteWorkOrder(order.id);
			router.replace("/work-orders/");
		} catch (error) {
			toast.error(error.message);
		}
	};
	const makeInvoice = () => {
		try {
			router.push(`/invoices/detail/?id=${invoiceForWorkOrder(order.id).id}`);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const toggleDone = (line) => {
		try {
			setLineDone(order.id, line.id, !line.done);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const circle = { background: `color-mix(in srgb, ${ink} 20%, transparent)`, color: ink };

	return (
		<div className="relative -mt-[var(--safe-top)] pt-[var(--safe-top)] pb-10">
			{/* The cover colour behind the top, fading into the page (CoverBackground, 520 pt). */}
			<div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={{ background: `linear-gradient(to bottom, ${makeCover(make)} 0%, ${makeCover(make)} 60%, var(--background) 100%)` }} />
			<PhoneNavBar
				title={`Lucrarea #${order.number}`}
				collapsed={scrolled}
				ink={ink}
				actions={null}
				leading={
					<NavGroup>
						<Link href="/work-orders/" aria-label="Înapoi la Atelier" className="flex size-11 items-center justify-center rounded-full active:opacity-60">
							<ChevronLeft className="size-6" aria-hidden />
						</Link>
					</NavGroup>
				}
			/>
			<div className="relative mx-auto max-w-xl space-y-6">
				<section className="flex flex-col gap-2 px-5 pt-14" style={{ color: ink }} aria-label={jobHeadline(order)}>
					<div className="flex items-center gap-3.5">
						{vehicle && <MakeLogo make={make} className="shrink-0 text-current" style={{ width: 64, height: 64 }} />}
						{vehicle?.plate && <Plate value={vehicle.plate} />}
						<span className="flex-1" />
						{status && (
							<span className="rounded-full px-2.5 py-1 text-[13px] font-semibold" style={{ background: `color-mix(in srgb, ${ink} 18%, transparent)` }}>
								{status.label}
							</span>
						)}
					</div>
					<p className="pt-2 text-[13px] font-medium tracking-[0.03em] uppercase opacity-75">
						Lucrarea #{order.number}
						{customer ? ` · ${customer.name}` : ""}
					</p>
					<h1 className="line-clamp-3 text-[28px] leading-[34px] font-bold">{jobHeadline(order)}</h1>
					{facts.length > 0 && <p className="text-[15px] opacity-80">{facts.join(" · ")}</p>}
					<div className="flex items-center gap-2.5 pt-2">
						{primary && (
							<button type="button" onClick={primary.run} className="flex h-[50px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 text-[17px] font-semibold text-black active:opacity-80">
								<primary.icon className="size-5 shrink-0" aria-hidden /> <span className="truncate">{primary.label}</span>
							</button>
						)}
						{phone && (
							<a href={telHref(phone)} aria-label="Sună" className="flex size-[50px] shrink-0 items-center justify-center rounded-full active:opacity-60" style={circle}>
								<Phone className="size-5 fill-current" aria-hidden />
							</a>
						)}
						{(others.length > 0 || phone) && (
							<DropdownMenu>
								<DropdownMenuTrigger aria-label="Altă stare și mesaje" className="flex size-[50px] shrink-0 items-center justify-center rounded-full active:opacity-60" style={circle}>
									<MoreHorizontal className="size-5" aria-hidden />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-64">
									{others.map((to) => {
										const Icon = WORK_ORDER_STATUS[to].icon;
										return (
											<DropdownMenuItem key={to} variant={to === "cancelled" ? "destructive" : undefined} onSelect={() => move(to)}>
												<Icon /> {WORK_ORDER_ACTIONS[to] ?? WORK_ORDER_STATUS[to].label}
											</DropdownMenuItem>
										);
									})}
									{phone && (
										<>
											{others.length > 0 && <DropdownMenuSeparator />}
											<DropdownMenuItem asChild>
												<a href={whatsappHref(phone, message)} target="_blank" rel="noreferrer">
													<MessageCircle /> Trimite pe WhatsApp
												</a>
											</DropdownMenuItem>
											<DropdownMenuItem asChild>
												<a href={smsHref(phone, message)}>
													<MessageSquareText /> Trimite SMS
												</a>
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						{!primary && <span className="flex-1" />}
					</div>
					{(running || worked > 0 || progress.done > 0) && (
						<p className="flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
							{running ? <Timer className="size-4" aria-hidden /> : <PauseCircle className="size-4" aria-hidden />}
							{[running ? "pornită" : "oprită", clockText(worked), progress.total ? `${progress.done} din ${progress.total} operații gata` : null].filter(Boolean).join(" · ")}
						</p>
					)}
					{status?.hint && <p className="text-[13px] opacity-70">{status.hint}</p>}
				</section>

				<section className="space-y-1.5 px-4" aria-label="Reclamație">
					<IosCaps>Reclamație</IosCaps>
					<div className="overflow-hidden rounded-[20px] bg-card">
						<textarea value={draft.complaint ?? ""} disabled={locked} onChange={(e) => update({ complaint: e.target.value })} placeholder="Ce spune clientul" aria-label="Ce spune clientul" className={cn(field, "text-[17px]")} rows={1} />
						<div className="ml-4 h-px bg-border" />
						<textarea value={draft.diagnosis ?? ""} disabled={locked} onChange={(e) => update({ diagnosis: e.target.value })} placeholder="Diagnoză: ce a găsit mecanicul" aria-label="Diagnoză" className={cn(field, "text-[15px] text-muted-foreground")} rows={1} />
					</div>
				</section>

				<section className="space-y-1.5 px-4" aria-label="Operații și piese">
					<IosCaps>Operații și piese</IosCaps>
					<ul className="overflow-hidden rounded-[20px] bg-card [&>li+li]:border-t">
						<IosLines lines={draft.lines} onChange={(lines) => update({ lines })} staff={staff} vatPayer={settings.invoicing.vatPayer} readOnly={locked} defaultStaffId={order.staffId ?? member?.id ?? null} currency={settings.currency} onToggleDone={toggleDone} />
					</ul>
				</section>

				<section className="space-y-1.5 px-4" aria-label="Factură">
					<IosCaps>Factură</IosCaps>
					<div className="overflow-hidden rounded-[20px] bg-card">
						{invoice ? (
							<Link href={`/invoices/detail/?id=${invoice.id}`} className="flex min-h-[52px] items-center gap-3 px-4 active:bg-foreground/[0.06]">
								<span className="flex-1 text-[17px]">{invoice.number == null ? "Ciornă" : formatInvoiceNumber(invoice.series, invoice.number)}</span>
								{invoiceStateKey && INVOICE_STATE[invoiceStateKey] && <IosPill color={TONE_COLOR[INVOICE_STATE[invoiceStateKey].tone]} className="h-5 rounded-full text-[12px] font-semibold">{INVOICE_STATE[invoiceStateKey].label}</IosPill>}
								<ChevronRight className="size-[18px] text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
							</Link>
						) : (
							<button type="button" disabled={!order.lines.length} onClick={makeInvoice} className="flex min-h-[52px] w-full items-center gap-2 px-4 text-[17px] text-brand disabled:text-muted-foreground">
								<FilePlus2 className="size-5" aria-hidden /> Fă factura
							</button>
						)}
					</div>
				</section>

				<section className="space-y-1.5 px-4" aria-label="Note">
					<IosCaps>Note</IosCaps>
					<div className="overflow-hidden rounded-[20px] bg-card">
						<textarea value={draft.notes ?? ""} onChange={(e) => update({ notes: e.target.value })} placeholder="Note interne" aria-label="Note interne" className={cn(field, "text-[17px]")} rows={1} />
					</div>
				</section>

				{deletable && (
					<div className="px-4">
						<button type="button" onClick={remove} className="flex min-h-[52px] w-full items-center justify-center rounded-[20px] bg-card text-[17px]" style={{ color: STATE.late }}>
							Șterge lucrarea
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
