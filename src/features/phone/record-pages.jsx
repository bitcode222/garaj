"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgeCheck, ChevronLeft, ChevronRight, ClockAlert, Gauge, MessageCircle, MessageSquare, Phone, Plus, TriangleAlert, User, Wrench } from "lucide-react";
import { useConfirm } from "@/components/ds/confirm";
import { IosCaps, IosHeader } from "@/components/ds/ios";
import { MakeLogo } from "@/components/ds/make-logo";
import { NavGroup, PhoneNavBar } from "@/components/ds/nav-bar";
import { Plate } from "@/components/ds/plate";
import { customerFacts, formatPhone, joinAddress, smsHref, telHref, whatsappHref } from "@/domain/customer";
import { dayOfInstant } from "@/domain/dates";
import { invoiceBalance } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { deadline, estimateKm, formatPlate, serviceDue, vehicleName } from "@/domain/vehicle";
import { STATE, TONE_COLOR, makeCover, makeInk } from "@/lib/colors";
import { fmtDate, formatMoney } from "@/lib/format";
import { FUELS, SERVICE_CATEGORIES, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { deleteCustomer, deleteVehicle, recordMileage } from "@/lib/store/actions";
import { useCollection, useSettings, useToday } from "@/lib/store/hooks";
import { selectPaymentsByInvoice } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { jobHeadline } from "@/features/work-orders/job-text";
import { IosAvatar, MakeCircle, vehicleFlag } from "./registry-lists";

// A client's and a car's page on a phone, as the iPhone app's CustomerDetailView and VehicleDetailView
// (ios-native/Garaj/Views), strictly (owner, 17 Nov 2026).

const card = "overflow-hidden rounded-[20px] bg-card [&>li+li]:border-t [&>li+li]:[border-image:linear-gradient(to_right,transparent_16px,var(--border)_16px)_1]";
const display = (day) => (day ? fmtDate(day, "dd.MM.yyyy") : "");
const km = (n) => `${Number(n).toLocaleString("ro-RO")} km`;

/** LabeledContent: the label at the left, the value grey at the right. */
function Row({ label, children, valueClass, style }) {
	return (
		<li className="flex min-h-[52px] items-center gap-3 px-4 py-2">
			<span className="shrink-0 text-[17px]">{label}</span>
			<span className={cn("min-w-0 flex-1 truncate text-right text-[17px] text-muted-foreground", valueClass)} style={style}>
				{children}
			</span>
		</li>
	);
}

/** The nav row of a record: "‹" back where it came from, the title, Editează. */
function RecordNav({ title, onEdit, scrolled, ink }) {
	const router = useRouter();
	return (
		<PhoneNavBar
			title={title}
			collapsed={scrolled}
			ink={ink}
			autoBack={false}
			leading={
				<NavGroup>
					<button type="button" onClick={() => router.back()} aria-label="Înapoi" className="flex size-11 items-center justify-center rounded-full active:opacity-60">
						<ChevronLeft className="size-6" aria-hidden />
					</button>
				</NavGroup>
			}
			actions={
				<button type="button" onClick={onEdit} className="h-11 px-4 text-[17px] active:opacity-60">
					Editează
				</button>
			}
		/>
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

// ── Client ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function PhoneClient({ customer: c }) {
	const router = useRouter();
	const confirm = useConfirm();
	const settings = useSettings();
	const today = useToday();
	const vehicles = Object.values(useCollection("vehicles"))
		.filter((v) => v.customerId === c.id)
		.sort((a, b) => String(a.plate).localeCompare(String(b.plate)));
	const allOrders = Object.values(useCollection("workOrders"));
	const orders = allOrders.filter((o) => o.customerId === c.id).sort((a, b) => b.number - a.number);
	const vehiclesById = useCollection("vehicles");
	const paidBy = selectPaymentsByInvoice(useCollection("payments"));
	const balance = Object.values(useCollection("invoices"))
		.filter((i) => i.customerId === c.id && i.status === "issued" && !i.stornoOf)
		.reduce((n, i) => n + Math.max(0, invoiceBalance(i, paidBy.get(i.id) ?? [])), 0);
	const facts = customerFacts(c.id, { appointments: Object.values(useCollection("appointments")), workOrders: allOrders });
	const scrolled = useScrolled(80);
	const company = c.type === "company";
	const address = joinAddress(c);
	const remove = async () => {
		if (!(await confirm({ title: "Ștergi clientul?", description: "Se șterg și mașinile, programările și ciornele lui.", confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteCustomer(c.id);
			router.replace("/customers/");
		} catch (error) {
			toast.error(error.message);
		}
	};
	const quick = "flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] bg-foreground/[0.07] text-[12px] font-medium active:opacity-70";
	return (
		<div className="pb-10">
			<RecordNav title={c.name} onEdit={() => openSheet("customer", { id: c.id })} scrolled={scrolled} ink="var(--foreground)" />
			<div className="mx-auto max-w-xl space-y-6 px-4 pt-[calc(var(--safe-top)+3.5rem)]">
				<section className="flex flex-col gap-3 rounded-[20px] bg-card p-4">
					<span className="flex items-center gap-3.5">
						<IosAvatar name={c.name} id={c.id} company={company} size={52} />
						<span className="flex min-w-0 flex-col gap-0.5">
							<span className="truncate text-[20px] leading-[25px] font-semibold">{c.name}</span>
							<span className="text-[15px] text-muted-foreground">{company ? `Persoană juridică${c.cui ? ` · CUI ${c.cui}` : ""}` : "Persoană fizică"}</span>
						</span>
					</span>
					{c.phone && (
						<>
							<div className="h-px bg-border" />
							<span className="flex gap-2">
								<a href={telHref(c.phone)} className={quick}>
									<Phone className="size-4 fill-current" aria-hidden /> Sună
								</a>
								<a href={smsHref(c.phone, "")} className={quick}>
									<MessageSquare className="size-4 fill-current" aria-hidden /> SMS
								</a>
								<a href={whatsappHref(c.phone, "")} target="_blank" rel="noreferrer" className={quick}>
									<MessageCircle className="size-4 fill-current" aria-hidden /> WhatsApp
								</a>
							</span>
						</>
					)}
				</section>

				<ul className={card}>
					<Row label="Vizite">{facts.visits}</Row>
					{facts.lastVisit && <Row label="Ultima vizită">{display(dayOfInstant(facts.lastVisit))}</Row>}
					{facts.noShows > 0 && (
						<Row label="Neprezentări" style={{ color: STATE.late }}>
							{facts.noShows}
						</Row>
					)}
					<Row label="De încasat" valueClass="tabular-nums" style={balance > 0 ? { color: STATE.wait } : undefined}>
						{formatMoney(balance, settings.currency)}
					</Row>
				</ul>

				<section className="space-y-1.5">
					<IosHeader title="Contact" />
					<ul className={card}>
						{c.phone && <Row label="Telefon">{formatPhone(c.phone)}</Row>}
						{c.email && <Row label="Email">{c.email}</Row>}
						{company && c.contactName && <Row label="Persoană de contact">{c.contactName}</Row>}
						{address && <Row label="Adresă">{address}</Row>}
						<Row label="Acord marketing">{c.marketingConsent ? "Da" : "Nu"}</Row>
					</ul>
				</section>

				<section className="space-y-1.5">
					<IosHeader title="Mașini" />
					<ul className={card}>
						{vehicles.map((v) => {
							const flag = vehicleFlag(v, today);
							const est = estimateKm(v, today);
							return (
								<li key={v.id}>
									<Link href={`/vehicles/detail/?id=${v.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-foreground/[0.06]">
										<MakeCircle make={v.make} />
										<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
											<span className="truncate text-[17px] leading-[22px] font-semibold tracking-[0.02em]">{formatPlate(v.plate)}</span>
											<span className="truncate text-[15px] text-muted-foreground">{vehicleName(v)}</span>
											{flag && (
												<span className="mt-0.5 inline-flex h-5 self-start rounded-full px-2 text-[12px] leading-5 font-semibold" style={{ background: `color-mix(in srgb, ${flag.color} 16%, transparent)`, color: flag.color }}>
													{flag.label}
												</span>
											)}
										</span>
										{est != null && <span className="shrink-0 text-[17px] text-muted-foreground tabular-nums">{km(est)}</span>}
										<ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
									</Link>
								</li>
							);
						})}
						<li>
							<button type="button" onClick={() => openSheet("vehicle", { customerId: c.id })} className="flex min-h-11 w-full items-center gap-2 px-4 text-[17px] text-brand">
								<span className="flex size-[22px] items-center justify-center rounded-full bg-brand text-white">
									<Plus className="size-4" strokeWidth={3} aria-hidden />
								</span>
								Adaugă o mașină
							</button>
						</li>
					</ul>
				</section>

				{orders.length > 0 && (
					<section className="space-y-1.5">
						<IosHeader title="Lucrări" />
						<ul className={card}>
							{orders.slice(0, 20).map((o) => (
								<li key={o.id}>
									<Link href={`/work-orders/detail/?id=${o.id}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-foreground/[0.06]">
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-[17px]">
												#{o.number} · {vehiclesById[o.vehicleId] ? formatPlate(vehiclesById[o.vehicleId].plate) : ""}
											</span>
											{o.complaint && <span className="truncate text-[15px] text-muted-foreground">{o.complaint}</span>}
										</span>
										<span className="shrink-0 text-[17px]" style={{ color: TONE_COLOR[WORK_ORDER_STATUS[o.status]?.tone] }}>
											{WORK_ORDER_STATUS[o.status]?.label}
										</span>
										<ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
									</Link>
								</li>
							))}
						</ul>
					</section>
				)}

				{c.notes && (
					<section className="space-y-1.5">
						<IosHeader title="Note" />
						<p className="rounded-[20px] bg-card px-4 py-3 text-[17px] whitespace-pre-line">{c.notes}</p>
					</section>
				)}

				<button type="button" onClick={remove} className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-card text-[17px]" style={{ color: STATE.late }}>
					Șterge clientul
				</button>
			</div>
		</div>
	);
}

// ── Car ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const statusColor = (status) => (status === "expired" ? STATE.late : status === "soon" ? STATE.wait : status === "ok" ? STATE.ok : undefined);

/** DeadlineRow: the symbol and name in the deadline's colour, the date and how far it is. */
function DeadlineRow({ title, date, d }) {
	const Icon = d.status === "expired" ? TriangleAlert : d.status === "soon" ? ClockAlert : BadgeCheck;
	const tint = d.status === "expired" ? STATE.late : d.status === "soon" ? STATE.wait : undefined;
	return (
		<li className="flex min-h-[52px] items-center gap-3 px-4 py-2">
			<span className="flex flex-1 items-center gap-2.5 text-[17px]" style={tint ? { color: tint } : undefined}>
				<Icon className="size-5" aria-hidden /> {title}
			</span>
			<span className="flex flex-col items-end">
				<span className={cn("text-[17px] tabular-nums", d.status === "unknown" && "text-muted-foreground")} style={tint ? { color: tint } : undefined}>
					{date ? display(date) : "necompletat"}
				</span>
				{d.days != null && <span className="text-[12px] text-muted-foreground">{d.days < 0 ? `expirat de ${-d.days} zile` : d.days === 0 ? "expiră azi" : `în ${d.days} zile`}</span>}
			</span>
		</li>
	);
}

export function PhoneCar({ vehicle: v }) {
	const router = useRouter();
	const confirm = useConfirm();
	const settings = useSettings();
	const today = useToday();
	const owner = useCollection("customers")[v.customerId];
	const services = useCollection("services");
	const orders = Object.values(useCollection("workOrders"))
		.filter((o) => o.vehicleId === v.id)
		.sort((a, b) => b.number - a.number);
	const [reading, setReading] = useState("");
	const scrolled = useScrolled(360);
	const ink = makeInk(v.make);
	const cover = makeCover(v.make);
	const service = serviceDue(v, today);
	const spent = orders.filter((o) => o.status === "delivered").reduce((n, o) => n + computeTotals((o.lines ?? []).filter((l) => !l.refused), { vatPayer: settings.invoicing.vatPayer }).gross, 0);
	const mileage = [...(v.mileage ?? [])].reverse();
	const last = v.mileage?.at(-1);
	const est = estimateKm(v, today);
	const remove = async () => {
		if (!(await confirm({ title: "Ștergi mașina?", description: "Se șterg și programările ei.", confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteVehicle(v.id);
			router.replace("/vehicles/");
		} catch (error) {
			toast.error(error.message);
		}
	};
	const save = () => {
		const n = Number(reading.replace(/\D/g, ""));
		if (!n) return;
		try {
			recordMileage(v.id, n);
			setReading("");
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<div className="relative -mt-[var(--safe-top)] pt-[var(--safe-top)] pb-10">
			<div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: `linear-gradient(to bottom, ${cover} 0%, ${cover} 60%, var(--background) 100%)` }} />
			<RecordNav title={formatPlate(v.plate)} onEdit={() => openSheet("vehicle", { id: v.id })} scrolled={scrolled} ink={ink} />
			<div className="relative mx-auto max-w-xl space-y-6">
				<section className="flex flex-col gap-2 px-5 pt-14" style={{ color: ink }}>
					<span className="flex justify-center py-[18px]">
						<MakeLogo make={v.make} className="text-current" style={{ width: 110, height: 110 }} />
					</span>
					<span className="flex items-center gap-2.5">
						<h1 className="line-clamp-2 text-[34px] leading-[41px] font-bold">{vehicleName(v) || "Mașină"}</h1>
						{v.plate && <Plate value={v.plate} />}
					</span>
					<p className="text-[15px] opacity-80">{[v.year, v.engine, v.fuel ? (FUELS[v.fuel]?.toLowerCase() ?? v.fuel) : null, last ? km(last.km) : null].filter(Boolean).join(" · ")}</p>
					{v.vin && <p className="font-mono text-[12px] opacity-70 select-text">VIN {v.vin}</p>}
					{owner && (
						<Link href={`/customers/detail/?id=${owner.id}`} className="mt-2 flex h-[50px] items-center gap-3 rounded-full px-5 text-[17px] font-medium active:opacity-70" style={{ background: `color-mix(in srgb, ${ink} 14%, transparent)` }}>
							<User className="size-5 fill-current" aria-hidden />
							<span className="flex-1 truncate">{owner.name}</span>
							<ChevronRight className="size-[18px] opacity-50" aria-hidden />
						</Link>
					)}
				</section>

				{orders.length > 0 && (
					<section className="space-y-2">
						<div className="px-5">
							<IosHeader title="Istoric" subtitle={`${orders.length} ${orders.length === 1 ? "lucrare" : "lucrări"}${spent > 0 ? ` · ${formatMoney(spent, settings.currency, { decimals: 0 })} predate` : ""}`} className="px-0" />
						</div>
						<div className="flex gap-3 overflow-x-auto px-5 [scrollbar-width:none]">
							{orders.map((o) => {
								const first = (o.lines ?? []).find((l) => l.kind === "labor") ?? o.lines?.[0];
								const category = first?.refId ? services[first.refId]?.category : null;
								const tint = TONE_COLOR[SERVICE_CATEGORIES[category]?.tone] ?? TONE_COLOR.neutral;
								return (
									<Link key={o.id} href={`/work-orders/detail/?id=${o.id}`} className="flex size-[150px] shrink-0 flex-col rounded-[24px] p-3 active:opacity-80" style={{ background: `color-mix(in srgb, ${cover} 75%, ${tint})`, color: ink }}>
										<Wrench className="size-6" aria-hidden />
										<span className="flex-1" />
										<span className="line-clamp-2 text-[15px] leading-5 font-semibold">{jobHeadline(o)}</span>
										<span className="truncate text-[12px] opacity-75">
											{display(dayOfInstant(o.createdAt))} · {WORK_ORDER_STATUS[o.status]?.label.toLowerCase()}
										</span>
									</Link>
								);
							})}
						</div>
					</section>
				)}

				<section className="space-y-1.5 px-4">
					<IosCaps>Termene</IosCaps>
					<ul className={card}>
						<DeadlineRow title="ITP" date={v.itpExpiry} d={deadline(v.itpExpiry, today)} />
						<DeadlineRow title="RCA" date={v.rcaExpiry} d={deadline(v.rcaExpiry, today)} />
						<li className="flex min-h-[52px] items-center gap-3 px-4 py-2">
							<span className="flex flex-1 items-center gap-2.5 text-[17px]">
								<Wrench className="size-5" aria-hidden /> Revizie
							</span>
							<span className="flex flex-col items-end">
								<span className="text-[17px]" style={{ color: statusColor(service.status) }}>
									{service.status === "unknown" ? "fără date" : display(service.dueDate)}
								</span>
								{service.kmLeft != null && <span className="text-[12px] text-muted-foreground">{service.kmLeft < 0 ? `depășită cu ${km(-service.kmLeft)}` : `încă ~${km(service.kmLeft)}`}</span>}
							</span>
						</li>
					</ul>
				</section>

				<section className="space-y-1.5 px-4">
					<IosCaps>Kilometraj</IosCaps>
					<ul className={card}>
						{mileage.map((r, i) => (
							<Row key={`${r.date}-${i}`} label={display(r.date)} valueClass="tabular-nums">
								{km(r.km)}
							</Row>
						))}
						<li className="flex min-h-[52px] items-center gap-3 px-4">
							<Gauge className="size-5 text-muted-foreground" aria-hidden />
							<input inputMode="numeric" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="Kilometraj de azi" aria-label="Kilometraj de azi" className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground/70" />
							<button type="button" disabled={!Number(reading.replace(/\D/g, ""))} onClick={save} className="text-[17px] text-brand disabled:text-muted-foreground">
								Salvează
							</button>
						</li>
					</ul>
					{est != null && last && last.date !== today && <p className="px-4 text-[13px] text-muted-foreground">Azi, estimat: ~{km(est)}</p>}
				</section>

				{v.notes && (
					<section className="space-y-1.5 px-4">
						<IosCaps>Note</IosCaps>
						<p className="rounded-[20px] bg-card px-4 py-3 text-[17px] whitespace-pre-line">{v.notes}</p>
					</section>
				)}

				<div className="px-4">
					<button type="button" onClick={remove} className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-card text-[17px]" style={{ color: STATE.late }}>
						Șterge mașina
					</button>
				</div>
			</div>
		</div>
	);
}
