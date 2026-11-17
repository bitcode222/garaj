"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowUpDown, Banknote, Car, Check, ChevronRight, CircleAlert, FileText, Hand, MessageCircle, MessageSquare, Moon, Package, Phone, Plus, Users, Wrench } from "lucide-react";
import { PageTitle } from "@/components/ds/blocks";
import { IosCaps, IosChip, IosChipRow, IosEmpty, IosHeader, IosPill, IosSearchField, IosSegmented, IosSortMenu, IosStat } from "@/components/ds/ios";
import { useProgressive } from "@/components/ds/list";
import { MakeLogo } from "@/components/ds/make-logo";
import { NavIcon } from "@/components/ds/nav-bar";
import { Page } from "@/components/ds/page";
import { SwipeRow } from "@/components/ds/swipe-row";
import { formatPhone, initials, smsHref, telHref, whatsappHref } from "@/domain/customer";
import { dayOfInstant } from "@/domain/dates";
import { stockLevel } from "@/domain/inventory";
import { formatInvoiceNumber, invoiceState, sumPayments } from "@/domain/invoice";
import { laborPrice } from "@/domain/lines";
import { formatQuantity } from "@/domain/money";
import { reminderMessage } from "@/domain/reminders";
import { fold, matchesTokens, queryTokens } from "@/domain/search";
import { deadline, estimateKm, formatPlate, lastReading, normalizePlate, serviceDue, vehicleName } from "@/domain/vehicle";
import { STATE, TONE_COLOR, makeColor } from "@/lib/colors";
import { fmtDate, fmtTime, formatMoney } from "@/lib/format";
import { useLocalPreference } from "@/lib/hooks";
import { INVOICE_STATE, REMINDER_TYPES, SERVICE_CATEGORIES } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { createInvoiceDraft, logContact } from "@/lib/store/actions";
import { useCollection, useSettings, useToday } from "@/lib/store/hooks";
import { selectReminders, selectReserved } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Registru's lists on a phone, as the iPhone app's (ios-native/Garaj/Views: CustomersViews, VehiclesViews,
// RemindersView, InvoicesView, CatalogView): a large title with ⇅ and "+", the search, then inset grouped rows.

const ro = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "ro");
const count = (n) => n.toLocaleString("ro-RO");

/** A card of rows, separators inset by `inset` px. */
function Rows({ inset = 16, children }) {
	return <ul className="overflow-hidden rounded-[20px] bg-card [&>li+li]:border-t [&>li+li]:[border-image:linear-gradient(to_right,transparent_var(--inset),var(--border)_var(--inset))_1]" style={{ "--inset": `${inset}px` }}>{children}</ul>;
}

/** The progressive list: what is shown, and the sentinel that brings the next page. */
function More({ hasMore, sentinelRef }) {
	return hasMore ? <div ref={sentinelRef} aria-hidden className="h-10" /> : null;
}

function sortButton(label = "Sortează") {
	return (
		<NavIcon label={label}>
			<ArrowUpDown />
		</NavIcon>
	);
}

// ── Clienți ──────────────────────────────────────────────────────────────────────────────────────────────────────

const AVATAR = ["#007aff", "#af52de", "#ff9500", "#34c759", "#ff2d55", "#30b0c7", "#5856d6", "#a2845e"];
function avatarTint(id) {
	let h = 0;
	for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) & 0x7fffffff;
	return AVATAR[h % AVATAR.length];
}

/** Initials on a tinted circle (a square for a company), the same colour for a client every time. */
export function IosAvatar({ name, id, company = false, size = 38 }) {
	const tint = avatarTint(id);
	return (
		<span aria-hidden className={cn("flex shrink-0 items-center justify-center text-[15px] font-semibold", company ? "rounded-[10px]" : "rounded-full")} style={{ width: size, height: size, color: tint, background: `color-mix(in srgb, ${tint} 15%, transparent)` }}>
			{initials(name)}
		</span>
	);
}

export function PhoneCustomers() {
	const router = useRouter();
	const today = useToday();
	const settings = useSettings();
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const [query, setQuery] = useState("");
	const [sort, setSort] = useLocalPreference("garaj.customers.sort", "name", ["name", "visits", "recent", "debt"]);
	const [group, setGroup] = useLocalPreference("garaj.customers.group", "none", ["none", "letter", "type"]);

	const sections = useMemo(() => {
		const visits = {};
		const last = {};
		for (const o of Object.values(workOrders)) {
			if (o.status === "cancelled" || !o.customerId) continue;
			visits[o.customerId] = (visits[o.customerId] ?? 0) + 1;
			if ((o.createdAt ?? "") > (last[o.customerId] ?? "")) last[o.customerId] = o.createdAt;
		}
		const byInvoice = new Map();
		for (const p of Object.values(payments)) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p]);
		const debt = {};
		for (const inv of Object.values(invoices)) {
			const pays = byInvoice.get(inv.id) ?? [];
			if (today && invoiceState(inv, pays, today) === "overdue") debt[inv.customerId] = (debt[inv.customerId] ?? 0) + inv.totals.gross - sumPayments(pays);
		}
		const cars = {};
		for (const v of Object.values(vehicles)) if (v.customerId) (cars[v.customerId] ??= []).push(v);
		const tokens = queryTokens(query);
		const rows = Object.values(customers)
			.filter((c) => !tokens.length || matchesTokens(fold([c.name, c.phone, String(c.phone ?? "").replace(/\D/g, ""), c.cui, c.email, c.contactName, ...(cars[c.id] ?? []).flatMap((v) => [v.plate, normalizePlate(v.plate), vehicleName(v)])].filter(Boolean).join(" ")), tokens))
			.map((c) => ({ c, cars: cars[c.id] ?? [], visits: visits[c.id] ?? 0, last: last[c.id] ?? "", debt: debt[c.id] ?? 0 }))
			.sort((a, b) => (sort === "visits" ? b.visits - a.visits : sort === "recent" ? ro(b.last, a.last) : sort === "debt" ? b.debt - a.debt : ro(a.c.name, b.c.name)));
		if (group === "type") {
			const people = rows.filter((r) => r.c.type !== "company");
			const firms = rows.filter((r) => r.c.type === "company");
			return [["Persoane", people], ["Firme", firms]].filter(([, list]) => list.length);
		}
		if (group === "letter") {
			const map = new Map();
			for (const r of rows) {
				const key = fold(r.c.name).slice(0, 1).toUpperCase() || "#";
				map.set(key, [...(map.get(key) ?? []), r]);
			}
			return [...map.entries()];
		}
		return rows.length ? [["", rows]] : [];
	}, [customers, vehicles, workOrders, invoices, payments, today, query, sort, group]);
	const flat = useMemo(() => sections.flatMap(([title, rows]) => rows.map((r, i) => ({ ...r, head: i === 0 ? title : null, size: rows.length }))), [sections]);
	const { visible, hasMore, sentinelRef } = useProgressive(flat, 60);
	const shownSections = [];
	for (const r of visible) {
		if (r.head != null) shownSections.push([r.head, r.size, []]);
		shownSections.at(-1)[2].push(r);
	}

	return (
		<Page width="narrow" className="space-y-4">
			<PageTitle
				title="Clienți"
				actions={
					<>
						<IosSortMenu sorts={[["name", "Nume (A–Z)"], ["visits", "Cele mai multe vizite"], ["recent", "Ultima vizită"], ["debt", "Restanțe"]]} sort={sort} onSort={setSort} groups={[["none", "Fără grupare"], ["letter", "Literă"], ["type", "Persoane / firme"]]} group={group} onGroup={setGroup}>
							{sortButton("Sortează și grupează")}
						</IosSortMenu>
						<NavIcon label="Client nou" onClick={() => openSheet("customer")}>
							<Plus />
						</NavIcon>
					</>
				}
			/>
			<IosSearchField value={query} onChange={setQuery} placeholder="Nume, telefon, număr, CUI" />
			{!flat.length ? (
				query ? <IosEmpty title={`Niciun rezultat pentru „${query}”`} className="pt-8">Verifică ce ai scris sau încearcă altceva.</IosEmpty> : <IosEmpty icon={Users} title="Niciun client" className="pt-8">Clienții se adaugă singuri când faci o programare. Îi poți adăuga și de aici.</IosEmpty>
			) : (
				shownSections.map(([title, size, rows]) => (
					<section key={title || "all"} className="space-y-1.5">
						{title && <IosCaps>{`${title} · ${size}`}</IosCaps>}
						<Rows inset={66}>
							{rows.map(({ c, cars, visits, debt }) => (
								<li key={c.id}>
									<SwipeRow leading={c.phone ? [{ key: "call", label: "Sună", icon: Phone, tone: "green", onSelect: () => (window.location.href = telHref(c.phone)) }] : []} trailing={[{ key: "edit", label: "Editează", icon: FileText, tone: "neutral", onSelect: () => openSheet("customer", { id: c.id }) }]}>
										<button type="button" onClick={() => router.push(`/customers/detail/?id=${c.id}`)} className="flex w-full items-center gap-3 bg-card px-4 py-2.5 text-left active:bg-foreground/[0.06]">
											<IosAvatar name={c.name} id={c.id} company={c.type === "company"} />
											<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
												<span className="truncate text-[17px] leading-[22px]">{c.name}</span>
												<span className="truncate text-[15px] text-muted-foreground">
													{[c.type === "company" && c.cui ? `CUI ${c.cui}` : formatPhone(c.phone), cars.length === 1 ? vehicleName(cars[0]) || formatPlate(cars[0].plate) : cars.length > 1 ? `${cars.length} mașini` : ""].filter(Boolean).join(" · ")}
												</span>
											</span>
											{debt > 0 ? (
												<span className="flex shrink-0 flex-col items-end">
													<span className="text-[17px] font-semibold tabular-nums" style={{ color: STATE.late }}>{formatMoney(debt, settings.currency, { decimals: 0 })}</span>
													<span className="text-[12px] text-muted-foreground">restanță</span>
												</span>
											) : (
												<span className="shrink-0 text-[17px] text-muted-foreground tabular-nums">{visits === 1 ? "1 vizită" : `${visits} vizite`}</span>
											)}
											<ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
										</button>
									</SwipeRow>
								</li>
							))}
						</Rows>
					</section>
				))
			)}
			<More hasMore={hasMore} sentinelRef={sentinelRef} />
		</Page>
	);
}

// ── Mașini ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The most urgent of ITP, RCA and service, as a pill (VehicleRow.flag). */
export function vehicleFlag(v, today) {
	const itp = deadline(v.itpExpiry, today);
	const rca = deadline(v.rcaExpiry, today);
	const service = serviceDue(v, today);
	const days = (n) => (n === 1 ? "o zi" : `${n} zile`);
	if (itp.status === "expired") return { label: "ITP expirat", color: STATE.late };
	if (rca.status === "expired") return { label: "RCA expirat", color: STATE.late };
	if (service.status === "expired") return { label: "Revizie depășită", color: STATE.late };
	const soon = [];
	if (itp.status === "soon") soon.push([itp.days, { label: `ITP în ${days(itp.days)}`, color: "#ff9500" }]);
	if (rca.status === "soon") soon.push([rca.days, { label: `RCA în ${days(rca.days)}`, color: "#af52de" }]);
	if (service.status === "soon") soon.push([service.days ?? 999, { label: service.kmLeft != null ? `Revizie în ~${count(Math.max(0, service.kmLeft))} km` : "Revizie curând", color: "#007aff" }]);
	return soon.sort((a, b) => a[0] - b[0])[0]?.[1] ?? null;
}

/** The make's logo on a circle of its colour (MakeLogo, 36 pt). */
export function MakeCircle({ make, size = 36 }) {
	return (
		<span aria-hidden className="flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: makeColor(make) }}>
			<MakeLogo make={make} className="text-white" style={{ width: size * 0.56, height: size * 0.56 }} />
		</span>
	);
}

export function PhoneVehicles() {
	const router = useRouter();
	const today = useToday();
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const [query, setQuery] = useState("");
	const [sort, setSort] = useLocalPreference("garaj.vehicles.sort", "plate", ["plate", "make", "km", "itp"]);
	const [group, setGroup] = useLocalPreference("garaj.vehicles.group", "none", ["none", "make", "owner"]);
	const flat = useMemo(() => {
		const tokens = queryTokens(query);
		const km = (v) => estimateKm(v, today) ?? lastReading(v)?.km ?? null;
		const rows = Object.values(vehicles)
			.filter((v) => !tokens.length || matchesTokens(fold([v.plate, normalizePlate(v.plate), vehicleName(v), v.vin, customers[v.customerId]?.name].filter(Boolean).join(" ")), tokens))
			.map((v) => ({ v, owner: customers[v.customerId]?.name, km: km(v) }))
			.sort((a, b) => (sort === "make" ? ro(vehicleName(a.v), vehicleName(b.v)) : sort === "km" ? (b.km ?? 0) - (a.km ?? 0) : sort === "itp" ? ro(a.v.itpExpiry ?? "9999", b.v.itpExpiry ?? "9999") : ro(a.v.plate, b.v.plate)));
		if (group === "none") return rows.map((r, i) => ({ ...r, head: i === 0 ? "" : null, size: rows.length }));
		const map = new Map();
		for (const r of rows) {
			const key = group === "make" ? r.v.make || "Fără marcă" : r.owner || "Fără proprietar";
			map.set(key, [...(map.get(key) ?? []), r]);
		}
		return [...map.entries()].sort((a, b) => ro(a[0], b[0])).flatMap(([title, list]) => list.map((r, i) => ({ ...r, head: i === 0 ? title : null, size: list.length, make: group === "make" ? r.v.make : null })));
	}, [vehicles, customers, today, query, sort, group]);
	const { visible, hasMore, sentinelRef } = useProgressive(flat, 60);
	const sections = [];
	for (const r of visible) {
		if (r.head != null) sections.push([r.head, r.size, r.make, []]);
		sections.at(-1)[3].push(r);
	}
	return (
		<Page width="narrow" className="space-y-4">
			<PageTitle
				title="Mașini"
				actions={
					<>
						<IosSortMenu sorts={[["plate", "Număr"], ["make", "Marcă și model"], ["km", "Kilometri"], ["itp", "ITP cel mai apropiat"]]} sort={sort} onSort={setSort} groups={[["none", "Fără grupare"], ["make", "Marcă"], ["owner", "Proprietar"]]} group={group} onGroup={setGroup}>
							{sortButton("Sortează și grupează")}
						</IosSortMenu>
						<NavIcon label="Mașină nouă" onClick={() => openSheet("vehicle")}>
							<Plus />
						</NavIcon>
					</>
				}
			/>
			<IosSearchField value={query} onChange={setQuery} placeholder="Număr, marcă, VIN, proprietar" />
			{!flat.length ? (
				query ? <IosEmpty title={`Niciun rezultat pentru „${query}”`} className="pt-8">Verifică ce ai scris sau încearcă altceva.</IosEmpty> : <IosEmpty icon={Car} title="Nicio mașină" className="pt-8">Mașinile se adaugă la programare sau la primire. O poți adăuga și de aici.</IosEmpty>
			) : (
				sections.map(([title, size, make, rows]) => (
					<section key={title || "all"} className="space-y-1.5">
						{title && (
							<span className="flex items-center gap-2 px-4">
								{make && <MakeCircle make={make} size={20} />}
								<IosCaps className="px-0 pb-0">{`${title} · ${size}`}</IosCaps>
							</span>
						)}
						<Rows inset={64}>
							{rows.map(({ v, owner, km }) => {
								const flag = vehicleFlag(v, today);
								return (
									<li key={v.id}>
										<button type="button" onClick={() => router.push(`/vehicles/detail/?id=${v.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
											<MakeCircle make={v.make} />
											<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
												<span className="truncate text-[17px] leading-[22px] font-semibold tracking-[0.02em]">{formatPlate(v.plate)}</span>
												<span className="truncate text-[15px] text-muted-foreground">{[vehicleName(v), owner].filter(Boolean).join(" · ")}</span>
												{flag && <IosPill color={flag.color} className="mt-0.5 h-5 self-start rounded-full text-[12px] font-semibold">{flag.label}</IosPill>}
											</span>
											{km != null && <span className="shrink-0 text-[17px] text-muted-foreground tabular-nums">{count(km)} km</span>}
											<ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
										</button>
									</li>
								);
							})}
						</Rows>
					</section>
				))
			)}
			<More hasMore={hasMore} sentinelRef={sentinelRef} />
		</Page>
	);
}

// ── De contactat ─────────────────────────────────────────────────────────────────────────────────────────────────

const NEEDS_CONSENT = new Set(["itp", "rca", "service"]);

function reminderDetail(r, currency) {
	switch (r.type) {
		case "itp":
		case "rca":
			return r.days < 0 ? `a expirat pe ${fmtDate(r.due, "dd.MM.yyyy")} (acum ${-r.days} zile)` : `expiră pe ${fmtDate(r.due, "dd.MM.yyyy")} (în ${r.days} ${r.days === 1 ? "zi" : "zile"})`;
		case "service":
			return r.kmLeft != null && r.kmLeft < 1500 ? `aprox. ${count(Math.max(0, r.kmLeft))} km rămași` : `scadentă pe ${fmtDate(r.due, "dd.MM.yyyy")}`;
		case "unpaid":
			return `${formatMoney(r.amount, currency)} · scadentă acum ${-r.days} zile`;
		case "pickup":
			return `gata de ${-r.days} ${-r.days === 1 ? "zi" : "zile"}, încă neridicată`;
		case "tomorrow":
			return `mâine la ${fmtTime(r.start)}`;
		default:
			return "";
	}
}

export function PhoneReminders() {
	const today = useToday();
	const settings = useSettings();
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const invoices = useCollection("invoices");
	const reminders = selectReminders(today, vehicles, customers, invoices, useCollection("payments"), useCollection("workOrders"), useCollection("appointments"), useCollection("contacts"));
	const handled = (r, channel, days = 7) => {
		logContact(r.key, { channel, days });
		if (channel === "snooze") toast.success(`Amânat ${days === 1 ? "o zi" : `${days} zile`}`);
		if (channel === "manual") toast.success("Marcat ca contactat");
	};
	return (
		<Page width="narrow" className="space-y-5">
			<PageTitle title="De contactat" actions={null} />
			{!reminders.length && (
				<IosEmpty icon={Check} title="Nimeni de contactat azi" className="pt-10">
					ITP-uri, RCA-uri, revizii, restanțe și mașini de ridicat apar aici când e momentul.
				</IosEmpty>
			)}
			{Object.entries(REMINDER_TYPES).map(([type, meta]) => {
				const items = reminders.filter((r) => r.type === type);
				if (!items.length) return null;
				return (
					<section key={type} className="space-y-1.5">
						<IosHeader title={`${meta.label} · ${items.length}`} />
						<Rows>
							{items.map((r) => {
								const customer = customers[r.customerId];
								const vehicle = vehicles[r.vehicleId];
								const message = reminderMessage(r, { customer, vehicle, invoice: r.invoiceId ? invoices[r.invoiceId] : null, settings });
								const urgent = r.urgency === "expired" || r.urgency === "overdue";
								const Icon = urgent ? CircleAlert : meta.icon;
								const noConsent = NEEDS_CONSENT.has(type) && customer?.marketingConsent === false;
								return (
									<li key={r.key}>
										<SwipeRow
											leading={[{ key: "done", label: "Contactat", icon: Check, tone: "green", onSelect: () => handled(r, "manual") }]}
											trailing={[30, 7, 1].map((days) => ({ key: `z${days}`, label: days === 1 ? "O zi" : `${days} zile`, icon: Moon, tone: days === 1 ? "blue" : days === 7 ? "purple" : "neutral", onSelect: () => handled(r, "snooze", days) }))}
										>
											<div className="flex flex-col gap-1.5 bg-card px-4 py-3">
												<span className="flex items-baseline gap-2">
													<Link href={customer ? `/customers/detail/?id=${customer.id}` : "#"} className="min-w-0 flex-1 truncate text-[17px] font-semibold">
														{customer?.name ?? "Client necunoscut"}
													</Link>
													{vehicle && <span className="shrink-0 text-[15px] font-medium text-muted-foreground">{formatPlate(vehicle.plate)}</span>}
												</span>
												<span className={cn("flex items-center gap-1 text-[15px]", !urgent && "text-muted-foreground")} style={urgent ? { color: STATE.late } : undefined}>
													{urgent ? <CircleAlert className="size-4 shrink-0" fill={STATE.late} stroke="#fff" aria-hidden /> : <Icon className="size-4 shrink-0" aria-hidden />}
													<span className="truncate">{reminderDetail(r, settings.currency)}</span>
												</span>
												{noConsent && (
													<span className="flex items-center gap-1 text-[12px]" style={{ color: STATE.wait }}>
														<Hand className="size-3.5" aria-hidden /> Fără acord de marketing: doar dacă ți-a cerut
													</span>
												)}
												{customer?.phone ? (
													<span className="flex gap-2 pt-0.5">
														<a href={whatsappHref(customer.phone, message)} target="_blank" rel="noreferrer" onClick={() => handled(r, "whatsapp")} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background active:opacity-70">
															<MessageCircle className="size-4 fill-current" aria-hidden /> WhatsApp
														</a>
														<a href={smsHref(customer.phone, message)} onClick={() => handled(r, "sms")} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-foreground/[0.08] text-[15px] font-semibold active:opacity-70">
															<MessageSquare className="size-4 fill-current" aria-hidden /> SMS
														</a>
														<a href={telHref(customer.phone)} onClick={() => handled(r, "call")} aria-label="Sună" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] active:opacity-70">
															<Phone className="size-4 fill-current" aria-hidden />
														</a>
													</span>
												) : (
													<span className="text-[12px] text-muted-foreground">Clientul nu are telefon.</span>
												)}
											</div>
										</SwipeRow>
									</li>
								);
							})}
						</Rows>
					</section>
				);
			})}
		</Page>
	);
}

// ── Facturi ──────────────────────────────────────────────────────────────────────────────────────────────────────

const INVOICE_FILTERS = [
	["all", "Toate", () => true],
	["due", "Neîncasate", (s) => ["issued", "partial", "overdue"].includes(s)],
	["overdue", "Restante", (s) => s === "overdue"],
	["drafts", "Ciorne", (s) => s === "draft"],
	["paid", "Plătite", (s) => s === "paid"],
];

export function PhoneInvoices() {
	const router = useRouter();
	const today = useToday();
	const settings = useSettings();
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customers = useCollection("customers");
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState("all");
	const [sort, setSort] = useLocalPreference("garaj.invoices.sort", "new", ["new", "old", "amount", "client"]);
	const [group, setGroup] = useLocalPreference("garaj.invoices.group", "month", ["month", "state", "none"]);
	const money = (minor, decimals = 2) => formatMoney(minor, settings.currency, { decimals });

	const all = useMemo(() => {
		const byInvoice = new Map();
		for (const p of Object.values(payments)) byInvoice.set(p.invoiceId, [...(byInvoice.get(p.invoiceId) ?? []), p]);
		const q = fold(query.trim());
		return Object.values(invoices)
			.map((inv) => {
				const pays = byInvoice.get(inv.id) ?? [];
				const label = inv.number == null ? "Ciornă" : formatInvoiceNumber(inv.series, inv.number);
				return { inv, label, customer: customers[inv.customerId], state: today ? invoiceState(inv, pays, today) : "issued", gross: inv.totals.gross, balance: inv.totals.gross - sumPayments(pays) };
			})
			.filter((r) => !q || fold(`${r.label} ${r.customer?.name ?? ""}`).includes(q));
	}, [invoices, payments, customers, today, query]);
	const keep = INVOICE_FILTERS.find((f) => f[0] === filter)[2];
	const rows = useMemo(() => {
		const list = all.filter((r) => keep(r.state));
		const newest = (a, b) => (a.inv.number == null) !== (b.inv.number == null) ? (a.inv.number == null ? -1 : 1) : (b.inv.number ?? 0) - (a.inv.number ?? 0) || ro(b.inv.createdAt, a.inv.createdAt);
		return list.sort((a, b) => (sort === "old" ? -newest(a, b) : sort === "amount" ? b.gross - a.gross : sort === "client" ? ro(a.customer?.name, b.customer?.name) : newest(a, b)));
	}, [all, keep, sort]);
	const flat = useMemo(() => {
		if (group === "none") return rows.map((r, i) => ({ ...r, head: i === 0 ? "" : null }));
		// By month: drafts first, then the months newest first (whatever the sort inside them); by state: in the rows' order.
		const month = (r) => String(r.inv.issueDate ?? dayOfInstant(r.inv.createdAt) ?? "").slice(0, 7);
		const keyOf = (r) => (group === "state" ? r.state : r.state === "draft" ? "~draft" : month(r));
		const order = [];
		const map = new Map();
		for (const r of rows) {
			const k = keyOf(r);
			if (!map.has(k)) (map.set(k, []), order.push(k));
			map.get(k).push(r);
		}
		if (group === "month") order.sort((a, b) => ro(b, a));
		const year = today?.slice(0, 4);
		const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
		const title = (k) => (group === "state" ? (INVOICE_STATE[k]?.label ?? k) : k === "~draft" ? "Ciorne" : cap(fmtDate(`${k}-01`, k.startsWith(year) ? "MMMM" : "MMMM yyyy")));
		return order.flatMap((k) => map.get(k).map((r, i) => ({ ...r, head: i === 0 ? title(k) : null })));
	}, [rows, group, today]);
	const { visible, hasMore, sentinelRef } = useProgressive(flat, 60);
	const sections = [];
	for (const r of visible) {
		if (r.head != null) sections.push([r.head, []]);
		sections.at(-1)[1].push(r);
	}
	const dueRows = all.filter((r) => ["issued", "partial", "overdue"].includes(r.state));
	const due = dueRows.reduce((n, r) => n + r.balance, 0);
	const overdue = all.filter((r) => r.state === "overdue").length;
	const monthStart = today ? `${today.slice(0, 7)}-01` : "";
	const monthPayments = Object.values(payments).filter((p) => p.date >= monthStart);
	const short = (d) => (d ? fmtDate(d, "d MMM") : "");
	const detail = (r) =>
		r.state === "draft" ? `ciornă din ${short(dayOfInstant(r.inv.createdAt))}` : ["paid", "cancelled", "storno"].includes(r.state) ? short(r.inv.issueDate) : [short(r.inv.issueDate), r.inv.dueDate && `scadentă ${short(r.inv.dueDate)}`].filter(Boolean).join(" · ");

	return (
		<Page width="narrow" className="space-y-4">
			<PageTitle
				title="Facturi"
				actions={
					<>
						<IosSortMenu sorts={[["new", "Cele mai noi"], ["old", "Cele mai vechi"], ["amount", "Valoare"], ["client", "Client (A–Z)"]]} sort={sort} onSort={setSort} groups={[["month", "Lună"], ["state", "Stare"], ["none", "Fără grupare"]]} group={group} onGroup={setGroup}>
							{sortButton("Sortează și grupează")}
						</IosSortMenu>
						<NavIcon label="Factură nouă" onClick={() => router.push(`/invoices/detail/?id=${createInvoiceDraft().id}`)}>
							<Plus />
						</NavIcon>
					</>
				}
			/>
			<IosSearchField value={query} onChange={setQuery} placeholder="Număr sau client" />
			<div className="grid grid-cols-2 gap-3">
				<IosStat label="De încasat" value={money(due, 0)} detail={`${dueRows.length} ${dueRows.length === 1 ? "factură" : "facturi"}${overdue ? `, ${overdue} ${overdue === 1 ? "restantă" : "restante"}` : ""}`} detailColor={overdue ? STATE.late : undefined} onClick={() => setFilter("due")} />
				<IosStat label={`Încasat în ${monthStart ? fmtDate(monthStart, "MMMM") : ""}`} value={money(monthPayments.reduce((n, p) => n + p.amount, 0), 0)} detail={`${monthPayments.length} ${monthPayments.length === 1 ? "plată" : "plăți"}`} />
			</div>
			<IosChipRow label="Stare">
				{INVOICE_FILTERS.map(([key, label, k]) => (
					<IosChip key={key} title={label} count={all.filter((r) => k(r.state)).length} on={filter === key} onClick={() => setFilter(key)} />
				))}
			</IosChipRow>
			{!flat.length ? (
				<IosEmpty icon={FileText} title={query ? `Niciun rezultat pentru „${query}”` : "Nicio factură"} className="pt-8">
					{filter === "all" ? "Facturile se fac din lucrări, cu butonul „Fă factura”, sau de aici." : filter === "overdue" ? "Toți clienții au plătit la termen." : "Nimic aici acum."}
				</IosEmpty>
			) : (
				sections.map(([title, list]) => (
					<section key={title || "all"} className="space-y-1.5 pt-1">
						{title && <IosHeader title={title} />}
						<Rows>
							{list.map((r) => {
								const state = INVOICE_STATE[r.state];
								const collectable = ["issued", "partial", "overdue"].includes(r.state);
								return (
									<li key={r.inv.id}>
										<SwipeRow leading={collectable ? [{ key: "pay", label: "Încasează", icon: Banknote, tone: "green", onSelect: () => openSheet("payment", { invoiceId: r.inv.id }) }] : []}>
											<button type="button" onClick={() => router.push(`/invoices/detail/?id=${r.inv.id}`)} className="flex w-full items-center gap-3 bg-card px-4 py-2.5 text-left active:bg-foreground/[0.06]">
												<span className="flex min-w-0 flex-1 flex-col gap-[3px]">
													<span className="truncate text-[17px] leading-[22px]">{r.label} · {r.customer?.name ?? "Fără client"}</span>
													<span className="truncate text-[15px] text-muted-foreground">{detail(r)}</span>
													{state && <IosPill color={TONE_COLOR[state.tone]} className="mt-0.5 h-5 self-start rounded-full text-[12px] font-semibold">{state.label}</IosPill>}
												</span>
												<span className="flex shrink-0 flex-col items-end gap-0.5">
													<span className="text-[17px] font-semibold tabular-nums">{money(r.gross)}</span>
													{(r.state === "partial" || r.state === "overdue") && <span className="text-[12px] tabular-nums" style={{ color: TONE_COLOR[state.tone] }}>rest {money(r.balance)}</span>}
												</span>
												<ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
											</button>
										</SwipeRow>
									</li>
								);
							})}
						</Rows>
					</section>
				))
			)}
			<More hasMore={hasMore} sentinelRef={sentinelRef} />
		</Page>
	);
}

// ── Catalog ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function PhoneCatalog() {
	const settings = useSettings();
	const services = useCollection("services");
	const parts = useCollection("parts");
	const reserved = selectReserved(useCollection("workOrders"), useCollection("invoices"));
	const [tab, setTab] = useState("services");
	const [query, setQuery] = useState("");
	const money = (minor) => formatMoney(minor, settings.currency);
	const tokens = queryTokens(query);
	const shownServices = Object.values(services).filter((s) => !tokens.length || matchesTokens(fold(`${s.name} ${s.code ?? ""}`), tokens));
	const shownParts = Object.values(parts)
		.filter((p) => !tokens.length || matchesTokens(fold(`${p.name} ${p.brand ?? ""} ${p.code ?? ""} ${p.location ?? ""}`), tokens))
		.sort((a, b) => ro(a.name, b.name));
	return (
		<Page width="narrow" className="space-y-4">
			<PageTitle
				title="Catalog"
				actions={
					<NavIcon label={tab === "parts" ? "Piesă nouă" : "Operație nouă"} onClick={() => openSheet(tab === "parts" ? "part" : "service")}>
						<Plus />
					</NavIcon>
				}
			/>
			<IosSearchField value={query} onChange={setQuery} placeholder={tab === "services" ? "Caută o operație" : "Caută o piesă, cod, raft"} />
			<IosSegmented
				label="Arată"
				value={tab}
				onChange={setTab}
				options={[
					{ value: "services", label: "Operații" },
					{ value: "parts", label: "Piese" },
				]}
			/>
			{tab === "services" ? (
				!shownServices.length ? (
					<IosEmpty icon={Wrench} title={query ? `Niciun rezultat pentru „${query}”` : "Nicio operație"} className="pt-8">
						Adaugă operațiile pe care le faci des, cu timpul normat.
					</IosEmpty>
				) : (
					Object.entries(SERVICE_CATEGORIES).map(([key, meta]) => {
						const list = shownServices.filter((s) => (s.category ?? "other") === key).sort((a, b) => ro(a.name, b.name));
						if (!list.length) return null;
						return (
							<section key={key} className="space-y-1.5 pt-1">
								<IosHeader title={meta.label} />
								<Rows>
									{list.map((s) => (
										<li key={s.id}>
											<button type="button" onClick={() => openSheet("service", { id: s.id })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
												<span className="flex min-w-0 flex-1 flex-col gap-px">
													<span className="truncate text-[17px] leading-[22px]">{s.name}</span>
													<span className="text-[12px] text-muted-foreground">
														{String(s.hours ?? 0).replace(".", ",")} h{s.parts?.length ? ` · ${s.parts.length} piese incluse` : ""}
													</span>
												</span>
												<span className="shrink-0 text-[15px] tabular-nums">{money(s.price ? s.price : laborPrice(s.hours, settings.laborRate))}</span>
											</button>
										</li>
									))}
								</Rows>
							</section>
						);
					})
				)
			) : !shownParts.length ? (
				<IosEmpty icon={Package} title={query ? `Niciun rezultat pentru „${query}”` : "Nicio piesă"} className="pt-8">
					Piesele cu stoc apar aici.
				</IosEmpty>
			) : (
				<section className="space-y-1.5">
					<Rows>
						{shownParts.map((p) => {
							const level = stockLevel(p, reserved.get(p.id) ?? 0);
							const tint = level.status === "out" ? STATE.late : level.status === "low" ? STATE.wait : undefined;
							return (
								<li key={p.id}>
									<button type="button" onClick={() => openSheet("part", { id: p.id })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-foreground/[0.06]">
										<span className="flex min-w-0 flex-1 flex-col gap-px">
											<span className="truncate text-[17px] leading-[22px]">{[p.name, p.brand].filter(Boolean).join(" ")}</span>
											{(p.code || p.location) && <span className="truncate text-[12px] text-muted-foreground">{[p.code, p.location].filter(Boolean).join(" · ")}</span>}
											<span className="text-[12px]" style={tint ? { color: tint } : undefined}>
												{formatQuantity(level.available)} {p.unit} disponibil{level.reserved > 0 ? ` (+${formatQuantity(level.reserved)} rezervat)` : ""}
											</span>
										</span>
										<span className="flex shrink-0 flex-col items-end">
											<span className="text-[15px] tabular-nums">{money(p.price)}</span>
											{p.cost > 0 && <span className="text-[12px] text-muted-foreground tabular-nums">cost {money(p.cost)}</span>}
										</span>
									</button>
								</li>
							);
						})}
					</Rows>
					<p className="px-4 text-[13px] text-muted-foreground">Stocul scade la emiterea facturii; piesele de pe lucrările deschise sunt rezervate.</p>
				</section>
			)}
		</Page>
	);
}
