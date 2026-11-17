"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, Car, Check, ChevronLeft, ChevronRight, CircleEllipsis, Phone, Plus, Wrench } from "lucide-react";
import { IosHeader, IosIconSquare } from "@/components/ds/ios";
import { NavGroup } from "@/components/ds/nav-bar";
import { useConfirm } from "@/components/ds/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatPhone, telHref } from "@/domain/customer";
import { dayOfInstant, minutesBetween } from "@/domain/dates";
import { operationFigures, operationFromService, operationsEstimate, operationVatRate } from "@/domain/lines";
import { formatPlate, vehicleName } from "@/domain/vehicle";
import { arrivalDelay } from "@/domain/visit";
import { STATE, TONE_COLOR } from "@/lib/colors";
import { fmtDate, fmtTime, formatMoney } from "@/lib/format";
import { useNowMinute } from "@/lib/hooks";
import { APPOINTMENT_STATUS, SERVICE_CATEGORIES, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { callOffAppointmentById, deleteAppointment, restoreAppointment, setAppointmentStatus } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

// A booking on a phone, as the iPhone app's AppointmentDetailView (ios-native/Garaj/Views/BookingViews.swift),
// strictly (owner, 17 Nov 2026): a page over everything (the iPhone pushes it), its state with the next step, the
// car, client, mechanic and number, the operations with their estimate, the notes, its job, and every action.

const length = (m) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);

/** LabeledContent: the label at the left, the value grey at the right. */
function Row({ label, children }) {
	return (
		<li className="flex min-h-[52px] items-center gap-3 px-4">
			<span className="text-[17px]">{label}</span>
			<span className="min-w-0 flex-1 truncate text-right text-[17px] text-muted-foreground">{children}</span>
		</li>
	);
}

function undoTo(previous) {
	return { label: "Anulează", onClick: () => restoreAppointment(previous) };
}

export function PhoneBooking({ open, onOpenChange, id }) {
	useNowMinute();
	const router = useRouter();
	const confirm = useConfirm();
	const settings = useSettings();
	const a = useEntity("appointments", id);
	const customer = useEntity("customers", a?.customerId);
	const vehicle = useEntity("vehicles", a?.vehicleId);
	const staff = useEntity("staff", a?.staffId);
	const bay = useEntity("bays", a?.bayId);
	const job = useEntity("workOrders", a?.workOrderId);
	const services = useCollection("services");
	useEffect(() => {
		if (!open) return undefined;
		const onKey = (event) => event.key === "Escape" && onOpenChange(false);
		window.addEventListener("keydown", onKey);
		document.documentElement.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKey);
			document.documentElement.style.overflow = "";
		};
	}, [open, onOpenChange]);
	if (!open || typeof document === "undefined") return null;
	const close = () => onOpenChange(false);
	if (!a) {
		return createPortal(
			<div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-background p-8 text-center text-[17px] text-muted-foreground" onClick={close}>
				Programarea nu mai există.
			</div>,
			document.body,
		);
	}

	const style = APPOINTMENT_STATUS[a.status];
	const now = new Date().toISOString();
	const late = arrivalDelay(a, now);
	const vat = { vatPayer: settings.invoicing.vatPayer, vatRate: settings.invoicing.vatRate };
	const ops = a.operations ?? (a.serviceIds ?? []).map((sid) => services[sid]).filter(Boolean).map((s) => operationFromService(s, settings.laborRate));
	const estimate = operationsEstimate(ops, vat);
	const editable = !a.workOrderId && ["scheduled", "confirmed", "arrived"].includes(a.status);
	const opNames = ops.map((op) => op.name).join(", ");
	const edit = () => openSheet("appointment", { id: a.id });
	const subject = a.number != null ? `Programarea #${a.number}` : "Programarea";
	const act = (message, run) => {
		try {
			const previous = { ...a };
			run();
			toast.success(message, { action: undoTo(previous) });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const checkIn = () => openSheet("checkin", { appointmentId: a.id });
	const callOff = async (to) => {
		if (!(await confirm({ title: to === "cancelled" ? "Anulezi programarea?" : "O marchezi neprezentată?", confirmLabel: to === "cancelled" ? "Anulează programarea" : "Neprezentat", destructive: true }))) return;
		try {
			const { previous } = callOffAppointmentById(a.id, { to, reason: to === "cancelled" ? "client" : null });
			toast.success(`${subject}: ${to === "cancelled" ? "anulată" : "neprezentat"}`, { action: undoTo(previous) });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const remove = async () => {
		if (!(await confirm({ title: "Ștergi programarea?", description: "Dacă doar nu mai vine, anuleaz-o: rămâne în istoric.", confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteAppointment(a.id);
			close();
		} catch (error) {
			toast.error(error.message);
		}
	};
	const card = "overflow-hidden rounded-[20px] bg-card [&>li+li]:border-t [&>li+li]:[border-image:linear-gradient(to_right,transparent_16px,var(--border)_16px)_1]";
	const action = "flex min-h-11 w-full items-center gap-2 px-4 text-left text-[17px] text-brand";

	return createPortal(
		<div role="dialog" aria-modal aria-label={subject} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background pb-[calc(var(--safe-bottom)+2rem)]">
			<div className="sticky top-0 z-10 flex h-11 items-center gap-2 bg-background/85 px-4 backdrop-blur-xl" style={{ marginTop: "var(--safe-top)" }}>
				<NavGroup>
					<button type="button" onClick={close} aria-label="Înapoi" className="flex size-11 items-center justify-center rounded-full active:opacity-60">
						<ChevronLeft className="size-6" aria-hidden />
					</button>
				</NavGroup>
				<span className="pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold">{a.number != null ? `Programarea #${a.number}` : "Programare"}</span>
				<span className="flex-1" />
				{["scheduled", "confirmed", "arrived"].includes(a.status) && (
					<NavGroup>
						<button type="button" onClick={edit} className="h-11 px-4 text-[17px] active:opacity-60">
							Editează
						</button>
					</NavGroup>
				)}
			</div>
			<div className="mx-auto max-w-xl space-y-6 px-4 pt-4">
				<section className="flex flex-col gap-3 rounded-[20px] bg-card p-4">
					<span className="flex items-center gap-3">
						{style && (
							<span className="flex size-11 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${TONE_COLOR[style.tone]} 15%, transparent)`, color: TONE_COLOR[style.tone] }}>
								<style.icon className="size-6" aria-hidden />
							</span>
						)}
						<span className="flex flex-col gap-0.5">
							<span className="text-[20px] leading-[25px] font-semibold">{style?.label}</span>
							<span className={late > 0 ? "text-[15px]" : "text-[15px] text-muted-foreground"} style={late > 0 ? { color: STATE.wait } : undefined}>
								{late > 0 ? `întârzie ${late} min` : `${fmtDate(dayOfInstant(a.start), "EEE, d MMM")} · ${fmtTime(a.start)}–${fmtTime(a.end)}`}
							</span>
						</span>
					</span>
					{(a.status === "scheduled" || (a.status === "confirmed" && !a.workOrderId)) && (
						<span className="flex gap-2">
							{a.status === "scheduled" && (
								<button type="button" onClick={() => act(`${subject}: confirmată`, () => setAppointmentStatus(a.id, "confirmed"))} className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[17px] font-semibold text-background active:opacity-80">
									<Check className="size-5" aria-hidden /> Confirmă
								</button>
							)}
							{(a.status === "scheduled" || a.status === "confirmed") && !a.workOrderId && (
								<button type="button" onClick={checkIn} className={a.status === "confirmed" ? "flex h-[50px] flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[17px] font-semibold text-background active:opacity-80" : "flex h-[50px] flex-1 items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-[17px] font-semibold active:opacity-80"}>
									<Car className="size-5 fill-current" aria-hidden /> A sosit
								</button>
							)}
						</span>
					)}
				</section>

				<ul className={card}>
					{vehicle && <Row label="Mașina">{[formatPlate(vehicle.plate), vehicleName(vehicle)].filter(Boolean).join(" · ")}</Row>}
					{customer && <Row label="Client">{customer.name}</Row>}
					{customer?.phone && (
						<li>
							<a href={telHref(customer.phone)} className="flex min-h-[52px] items-center gap-3 px-4 text-[17px] text-brand">
								<Phone className="size-5 fill-current" aria-hidden /> {formatPhone(customer.phone)}
							</a>
						</li>
					)}
					<Row label="Mecanic">{staff?.name ?? "—"}</Row>
					{bay && <Row label="Rampă">{bay.name}</Row>}
					{a.number != null && <Row label="Număr">#{a.number}</Row>}
				</ul>

				<section className="space-y-1.5">
					<IosHeader title={`Operații · ${ops.length}`} />
					<ul className={card}>
						{ops.map((op, i) => {
							const category = op.category ?? (op.serviceId ? services[op.serviceId]?.category : null);
							return (
								<li key={op.id ?? `${op.name}-${i}`}>
									<button type="button" disabled={!editable} onClick={edit} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
										<IosIconSquare icon={Wrench} color={TONE_COLOR[SERVICE_CATEGORIES[category]?.tone] ?? "#ff9500"} />
										<span className="flex min-w-0 flex-1 flex-col gap-0.5">
											<span className="text-[17px] leading-[22px]">{op.name || "Operație"}</span>
											{Number(op.hours) > 0 && <span className="text-[12px] text-muted-foreground">{length(Math.round(Number(op.hours) * 60))}</span>}
										</span>
										<span className="shrink-0 text-[17px] font-semibold tabular-nums">{formatMoney(operationFigures(op, operationVatRate(op, vat)).gross, settings.currency, { decimals: 0 })}</span>
										{editable && <ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />}
									</button>
								</li>
							);
						})}
						{editable && (
							<li>
								<button type="button" onClick={edit} className={action}>
									<span className="flex size-[22px] items-center justify-center rounded-full bg-brand text-white">
										<Plus className="size-4" strokeWidth={3} aria-hidden />
									</span>
									Adaugă o operație
								</button>
							</li>
						)}
						{ops.length > 0 && (
							<li className="flex items-baseline gap-3 px-4 py-3">
								<span className="flex flex-1 flex-col gap-0.5">
									<span className="text-[17px] font-semibold">Total estimat</span>
									<span className="text-[12px] text-muted-foreground">{estimate.minutes ? length(estimate.minutes) : ""}</span>
								</span>
								<span className="flex flex-col items-end gap-0.5">
									<span className="text-[17px] font-semibold tabular-nums">{formatMoney(estimate.gross, settings.currency)}</span>
									{settings.invoicing.vatPayer && <span className="text-[12px] text-muted-foreground">cu TVA</span>}
								</span>
							</li>
						)}
					</ul>
					{editable && estimate.minutes > 0 && estimate.minutes !== minutesBetween(a.start, a.end) && (
						<p className="px-4 text-[13px] text-muted-foreground">
							Operațiile cer {length(estimate.minutes)}; intervalul are {length(minutesBetween(a.start, a.end))}.
						</p>
					)}
				</section>

				{(a.notes || (a.title && a.title !== opNames)) && (
					<section className="space-y-1.5">
						<IosHeader title="Note" />
						<div className="space-y-1 rounded-[20px] bg-card px-4 py-3">
							{a.title && a.title !== opNames && <p className="text-[17px]">{a.title}</p>}
							{a.notes && <p className="text-[15px] whitespace-pre-line text-muted-foreground">{a.notes}</p>}
						</div>
					</section>
				)}

				{job && (
					<section className="space-y-1.5">
						<IosHeader title="Lucrarea" />
						<ul className={card}>
							<li>
								<button type="button" onClick={() => (close(), router.push(`/work-orders/detail/?id=${job.id}`))} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left">
									<span className="flex-1 text-[17px]">Lucrarea #{job.number}</span>
									<span className="text-[17px]" style={{ color: TONE_COLOR[WORK_ORDER_STATUS[job.status]?.tone] }}>{WORK_ORDER_STATUS[job.status]?.label}</span>
									<ChevronRight className="size-[18px] text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
								</button>
							</li>
						</ul>
					</section>
				)}

				<ul className={card}>
					<li>
						<DropdownMenu>
							<DropdownMenuTrigger className={action}>
								<CircleEllipsis className="size-5" aria-hidden /> Toate acțiunile
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-72">
								{a.status === "scheduled" && <DropdownMenuItem onSelect={() => act(`${subject}: confirmată`, () => setAppointmentStatus(a.id, "confirmed"))}>Confirmă</DropdownMenuItem>}
								{a.status === "confirmed" && <DropdownMenuItem onSelect={() => act(`${subject}: neconfirmată`, () => setAppointmentStatus(a.id, "scheduled"))}>Marchează neconfirmată</DropdownMenuItem>}
								{(a.status === "scheduled" || a.status === "confirmed") && !a.workOrderId && <DropdownMenuItem onSelect={checkIn}>A sosit (deschide lucrarea)</DropdownMenuItem>}
								{(a.status === "no_show" || a.status === "cancelled") && <DropdownMenuItem onSelect={() => act(`${subject}: reprogramată`, () => setAppointmentStatus(a.id, "scheduled"))}>Programează din nou</DropdownMenuItem>}
								{["scheduled", "confirmed", "arrived"].includes(a.status) && <DropdownMenuItem onSelect={edit}>Editează</DropdownMenuItem>}
								{["scheduled", "confirmed"].includes(a.status) && a.start <= now && (
									<DropdownMenuItem variant="destructive" onSelect={() => callOff("no_show")}>
										Neprezentat
									</DropdownMenuItem>
								)}
								{["scheduled", "confirmed"].includes(a.status) && (
									<DropdownMenuItem variant="destructive" onSelect={() => callOff("cancelled")}>
										Anulează
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</li>
					{["scheduled", "confirmed"].includes(a.status) && (
						<li>
							<button type="button" onClick={edit} className={action}>
								<CalendarClock className="size-5" aria-hidden /> Mută sau editează
							</button>
						</li>
					)}
					{!a.workOrderId && (
						<li>
							<button type="button" onClick={remove} className="flex min-h-11 w-full items-center px-4 text-left text-[17px]" style={{ color: STATE.late }}>
								Șterge programarea
							</button>
						</li>
					)}
				</ul>
			</div>
		</div>,
		document.body,
	);
}
