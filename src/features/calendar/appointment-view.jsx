"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronRight, CircleX, Clock, Mail, Phone, Plus, Timer, UserX } from "lucide-react";
import { Initials, Money } from "@/components/ds/data";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { FlowSteps, usePanelEscape } from "@/components/ds/flow-steps";
import { InlineText } from "@/components/ds/inline-text";
import { PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { Overline } from "@/components/ds/page";
import { StateTag, ToneBadge, kindText } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { warningSection } from "@/domain/booking-warnings";
import { customerFacts, telHref } from "@/domain/customer";
import { dayOfInstant, diffDaysISO, minutesBetween, relativeTo } from "@/domain/dates";
import { appointmentFlow, bookingNow, NOW_KINDS } from "@/domain/flow";
import { formatInvoiceNumber } from "@/domain/invoice";
import { operationFigures, operationFromService, operationsEstimate, operationVatRate } from "@/domain/lines";
import { deadline, lastJob, lastReading } from "@/domain/vehicle";
import { orderTotals } from "@/domain/work-order";
import { fmtDate, fmtDays, fmtKm, fmtTime, fmtWorkOrder, formatPhone, plural } from "@/lib/format";
import { useNowMinute } from "@/lib/hooks";
import { APPOINTMENT_STATUS, CANCEL_REASON, DEADLINE_STATUS } from "@/lib/labels";
import { useRemember } from "@/lib/recents";
import { bookingLook, invoiceLook, orderKind, orderLook } from "@/lib/record-state";
import { openSheet } from "@/lib/sheets";
import { moveAppointment, saveAppointment } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectActive, selectCustomerBalances, selectPaymentsByInvoice } from "@/lib/store/selectors";
import { toast } from "@/lib/toast";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { fmtLength } from "@/features/dashboard/visit-ui";
import { VisitBarFor, visitTitle } from "@/features/flow/visit-bar";
import { CustomerNote } from "@/features/reviews/customer-note";
import { AppointmentHistory, CallOffPanel, DelayPanel, ReschedulePanel, undoTo } from "./appointment-state";
import { FixButton, useBookingWarnings, WarningItems } from "./booking-warnings";

// The booking's sheet (docs/APPOINTMENT-SHEET.md): it answers the desk's questions in the order they
// are asked (when, what now, who and which car, what is done, who does it, what happened, stopping
// it), and every action and every warning sits next to the thing it changes, once.

const STEPS = ["scheduled", "confirmed", "arrived", "done"].map((key) => ({ key, label: APPOINTMENT_STATUS[key].label, tone: APPOINTMENT_STATUS[key].tone }));
const EDITABLE = ["scheduled", "confirmed", "arrived"];
const AHEAD = ["scheduled", "confirmed"];

/** The booking's own words when it has none: its operations, or just "Programare". */
const autoTitle = (a) => (a.operations ?? []).map((op) => op.name).filter(Boolean).join(", ") || "Programare";

/** A stretch of time as it is said in passing: "45 min", "3 h", "2 zile". */
const span = (minutes) => (minutes < 1 ? "un minut" : minutes < 60 ? `${minutes} min` : minutes < 24 * 60 ? `${Math.round(minutes / 60)} h` : plural(Math.round(minutes / 1440), "zi", "zile"));

/** The few words a warning is named by in the Acum card's "De rezolvat" line. */
const ELSEWHERE = { overlap: "suprapunere", closed: "în afara programului", delayOverrun: "vine după interval", unassigned: "fără mecanic", documents: "acte de verificat" };

/** One section of the sheet: an overline title, then its content; set apart from the one before by a rule. */
function Section({ title, sectionRef, plain = false, className, children }) {
	return (
		<section ref={sectionRef} aria-label={title} className={cn("scroll-mt-4 space-y-3", !plain && "border-t pt-5", className)}>
			{title && <Overline>{title}</Overline>}
			{children}
		</section>
	);
}

export default function AppointmentView({ open, onOpenChange, id, panel: openOn = null }) {
	useNowMinute(); // "peste 45 min", late, missed: they all move with the clock
	const settings = useSettings();
	const today = useToday();
	const a = useEntity("appointments", id);
	useRemember("appointment", a?.id);
	const customer = useEntity("customers", a?.customerId);
	const vehicle = useEntity("vehicles", a?.vehicleId);
	// A panel opened in place: reschedule, delay (Când); no_show, cancel (the last section).
	const [panel, setPanel] = useState(openOn);
	const closePanel = () => setPanel(null);
	usePanelEscape(Boolean(panel), closePanel);
	const { warnings, items, fixOf, order } = useBookingWarnings(a, { onPanel: setPanel });
	const timeRef = useRef(null);
	const staffRef = useRef(null);
	const carRef = useRef(null);
	const stopRef = useRef(null);
	// "De rezolvat" jumps to the section a warning sits in.
	const jumpTo = (section) => ({ time: timeRef, staff: staffRef, car: carRef })[section]?.current?.scrollIntoView({ block: "start", behavior: "smooth" });

	// A panel opened from the Acum card lives in its own section: bring that section into view.
	useEffect(() => {
		const section = panel === "reschedule" || panel === "delay" ? timeRef : panel === "no_show" || panel === "cancel" ? stopRef : null;
		section?.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [panel]);

	const now = new Date().toISOString();
	const flow = a ? appointmentFlow(a, { now, order }) : null;
	const card = a ? bookingNow(a, { now, order, warnings, phone: Boolean(customer?.phone) }) : null;
	const inCard = new Set(card ? [card.primary, ...card.others, ...card.quiet].filter(Boolean).map((fix) => fix.id) : []);
	const placed = (section) => items.filter((item) => warningSection(item.kind) === section);
	const primary = card?.primary && card.key !== "off" ? labelled(fixOf(card.primary), card.primary, card.key) : null;

	const rename = (text) => {
		try {
			saveAppointment({ ...a, title: text || autoTitle(a) });
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={a}
			missing="Programarea a fost ștearsă."
			// The visit bar opens it; the title is the car and the booking's number (docs/VISIT-BAR.md).
			title={visitTitle({ vehicle }, a?.number != null ? `#${a.number}` : null, customer?.name ?? "Programare")}
			kind="appointment"
			state={a ? bookingLook(a, now) : undefined}
			bar={a ? <VisitBarFor from="appointment" record={a} /> : null}
			make={vehicle?.make}
			description={a ? <InlineText value={a.title} placeholder={autoTitle(a)} label="Descrierea programării" onSave={rename} /> : undefined}
			onEdit={() => openSheet("appointment", { id: a.id })}
			// The phone's thumb reach: the next step, the same button as in the Acum card (hidden there on a phone).
			footer={primary ? <FixButton fix={primary} variant="default" size="default" className="h-11" /> : null}
			footerClassName="md:hidden"
		>
			{a && (
				<div className="space-y-5">
					<WhenSection appointment={a} now={now} today={today} flow={flow} card={card} inCard={inCard} panel={panel} setPanel={setPanel} closePanel={closePanel} warnings={placed("time")} sectionRef={timeRef} />

					<Section title="Acum">
						<NowCard appointment={a} card={card} flow={flow} items={items} fixOf={fixOf} order={order} now={now} today={today} primary={primary} onJump={jumpTo} />
					</Section>

					<div className="grid gap-5 border-t pt-5 md:grid-cols-2">
						<CustomerBlock customer={customer} today={today} />
						<CarBlock appointment={a} vehicle={vehicle} order={order} today={today} sectionRef={carRef} />
					</div>

					<WorkSection appointment={a} settings={settings} now={now} />

					<StaffSection appointment={a} warnings={placed("staff")} sectionRef={staffRef} />

					<Section title="Istoric">
						<AppointmentHistory appointment={a} />
					</Section>

					<StopSection appointment={a} flow={flow} inCard={inCard} panel={panel} setPanel={setPanel} closePanel={closePanel} sectionRef={stopRef} />
				</div>
			)}
		</DetailSheet>
	);
}

/** A fix's button as the Acum card says it: "A sosit — începe lucrarea" when it is the next step, "A venit mai devreme" days ahead. */
function labelled(spec, fix, key, role = "primary") {
	if (!spec) return null;
	if (fix.id !== "checkin") return spec;
	if (role === "primary") return { ...spec, label: "A sosit — începe lucrarea" };
	return { ...spec, label: key === "waiting" ? "A venit mai devreme" : "A sosit" };
}

// ── Când ────────────────────────────────────────────────────────────────────

function WhenSection({ appointment: a, now, today, flow, card, inCard, panel, setPanel, closePanel, warnings, sectionRef }) {
	const day = dayOfInstant(a.start);
	const away = today ? diffDaysISO(today, day) : 0;
	const near = Math.abs(away) <= 1 ? fmtDays(away) : null;
	const sameYear = !today || day.slice(0, 4) === today.slice(0, 4);
	const where = relativeTo(a.start, a.end, now);
	const ahead = AHEAD.includes(a.status);
	const until =
		a.status === "arrived"
			? "în service"
			: a.status === "cancelled" || a.status === "no_show"
				? null
				: where.kind === "ahead"
					? `peste ${span(where.minutes)}`
					: where.kind === "now"
						? `a început acum ${span(where.minutes)}`
						: `acum ${span(where.minutes)}`;
	const announced = a.expectedAt && ahead && a.expectedAt > a.start;
	const delay = flow.moves.find((move) => move.id === "delay");
	const canReschedule = ahead && !inCard.has("reschedule");
	const canDelay = delay?.allowed && card.key !== "late";

	return (
		<Section title="Când" sectionRef={sectionRef} plain>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-base font-semibold first-letter:uppercase">
						{near ? `${near} · ` : ""}
						{fmtDate(a.start, sameYear ? "EEEE, d MMMM" : "EEEE, d MMMM yyyy")}
					</p>
					<p className="text-sm text-muted-foreground tabular-nums">
						{fmtTime(a.start)} – {fmtTime(a.end)} · {fmtLength(minutesBetween(a.start, a.end))}
					</p>
					{announced && <p className={cn("text-sm font-medium", tone("blue").text)}>Anunțat: vine la {fmtTime(a.expectedAt)}</p>}
				</div>
				{until && <span className={cn("shrink-0 pt-0.5 text-sm whitespace-nowrap", where.kind === "past" && ahead ? tone("red").text : "text-muted-foreground")}>{until}</span>}
			</div>
			{(canReschedule || canDelay) && (
				<div className="flex flex-wrap gap-2">
					{canReschedule && (
						<Button variant="outline" size="sm" className="max-md:h-11" onClick={() => setPanel("reschedule")}>
							<CalendarClock /> Reprogramează
						</Button>
					)}
					{canDelay && (
						<Button variant="outline" size="sm" className="max-md:h-11" onClick={() => setPanel("delay")}>
							<Clock /> Anunță o întârziere
						</Button>
					)}
				</div>
			)}
			{panel === "reschedule" && <ReschedulePanel appointment={a} onClose={closePanel} />}
			{panel === "delay" && <DelayPanel appointment={a} onClose={closePanel} />}
			<WarningItems items={warnings} size="sheet" />
		</Section>
	);
}

// ── Acum ────────────────────────────────────────────────────────────────────

/** What the card says for its situation: a sentence and, at times, a line of context. */
function nowWords(card, { appointment: a, items, now, today }) {
	const item = card.warning ? items.find((i) => i.kind === card.warning.kind) : null;
	if (item) return { title: item.title, detail: item.detail };
	const day = dayOfInstant(a.start);
	const away = today ? diffDaysISO(today, day) : 0;
	switch (card.key) {
		case "confirm":
			return { title: "Așteaptă confirmarea clientului.", detail: [] };
		case "waiting":
			return { title: `Confirmată. Vine ${away === 1 ? "mâine" : fmtDate(a.start, "EEEE, d MMMM")} la ${fmtTime(a.start)}.`, detail: [] };
		case "today": {
			if (a.start <= now) return { title: "Mașina e așteptată acum.", detail: [`Programarea a început la ${fmtTime(a.start)}.`] };
			const left = relativeTo(a.start, a.end, now).minutes;
			return { title: `Vine azi la ${fmtTime(a.start)}, peste ${span(left)}.`, detail: [] };
		}
		case "inShop":
			return { title: "Mașina e în service.", detail: ["Totul continuă în lucrare."] };
		case "done":
			return { title: "Vizita s-a încheiat.", detail: [] };
		default:
			return { title: "", detail: [] };
	}
}

/** The side states as a banner: what happened, when, why, and the way back. */
function offBanner(a, card, fixOf) {
	const entry = [...(a.activity ?? [])].reverse().find((item) => item.type === "status" && item.to === a.status);
	const reason = a.cancelReason;
	const why = reason ? [reason.code && CANCEL_REASON[reason.code], reason.note].filter(Boolean).join(": ") : null;
	const actions = [card.primary, ...card.others]
		.map((fix, index) => {
			const spec = fixOf(fix);
			return spec?.onClick ? { label: spec.label, onClick: spec.onClick, primary: index === 0 } : null;
		})
		.filter(Boolean);
	return {
		title: a.status === "no_show" ? "Clientul nu s-a prezentat" : "Programare anulată",
		description: [entry ? `pe ${fmtDate(entry.at, "d MMM, HH:mm")}` : null, why].filter(Boolean).join(" · ") || null,
		tone: a.status === "no_show" ? "red" : "neutral",
		icon: a.status === "no_show" ? UserX : CircleX,
		actions,
	};
}

function NowCard({ appointment: a, card, flow, items, fixOf, order, now, today, primary, onJump }) {
	if (card.key === "off") return <FlowSteps label="Starea programării" steps={STEPS} current={flow.current} off={offBanner(a, card, fixOf)} />;

	const words = nowWords(card, { appointment: a, items, now, today });
	const others = card.others.map((fix) => labelled(fixOf(fix, card.warning), fix, card.key, "other")).filter(Boolean);
	const quiet = card.quiet.map((fix) => labelled(fixOf(fix), fix, card.key, "quiet")).filter(Boolean);
	// Warnings of this card that it does not stand for (no phone, the job's own); the rest are named and jumped to.
	const extra = items.filter((item) => warningSection(item.kind) === "now" && !NOW_KINDS.includes(item.kind));
	const elsewhere = items.filter((item) => warningSection(item.kind) !== "now");
	const severe = card.warning?.severity === "danger";

	const body = (
		<div className={cn("space-y-3 rounded-lg border p-3", severe ? tone("red").chip : card.warning ? tone("yellow").chip : "bg-muted/30")}>
			<div>
				<p className="text-sm font-medium">{words.title}</p>
				{words.detail.map((line) => (
					<p key={line} className="text-xs opacity-80">
						{line}
					</p>
				))}
			</div>
			{(card.key === "inShop" || card.key === "done") && order && <JobFacts order={order} appointment={a} today={today} />}
			{(primary || others.length > 0) && (
				<div className="flex flex-wrap gap-2">
					{primary && <FixButton fix={primary} variant="default" className="max-md:hidden" />}
					{others.map((fix, index) => (
						<FixButton key={`${fix.label}-${index}`} fix={fix} className="bg-background/80 max-md:h-11" />
					))}
				</div>
			)}
			{quiet.length > 0 && (
				<div className="flex flex-wrap gap-x-1">
					{quiet.map((fix) => (
						<FixButton key={fix.label} fix={fix} variant="ghost" className="-ml-2 text-muted-foreground max-md:h-11" />
					))}
				</div>
			)}
		</div>
	);

	return (
		<div className="space-y-3">
			<FlowSteps label="Starea programării" steps={STEPS} current={flow.current} notice={body} />
			<WarningItems items={extra} size="sheet" />
			{elsewhere.length > 0 && (
				<p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
					De rezolvat:
					{elsewhere.map((item, index) => {
						const section = warningSection(item.kind);
						return (
							<button
								key={item.key}
								type="button"
								onClick={() => onJump(section)}
								className="inline-flex min-h-11 items-center font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid md:min-h-0"
							>
								{ELSEWHERE[item.kind] ?? item.title}
								{index < elsewhere.length - 1 ? "," : ""}
							</button>
						);
					})}
				</p>
			)}
		</div>
	);
}

/** The job a booking became, in figures: its state, its total, its invoice's state, each in its kind's colour. The way to it is the flow strip above. */
function JobFacts({ order, appointment, today }) {
	const settings = useSettings();
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const invoice = order.invoiceId ? invoices[order.invoiceId] : null;
	const live = invoice && invoice.status !== "cancelled" ? invoice : null;
	const invoiceState = live && today ? invoiceLook(live, selectPaymentsByInvoice(payments).get(live.id) ?? [], { today, currency: settings.currency }) : null;
	const kind = orderKind(order);
	const total = order.lines?.length ? orderTotals(order, settings).gross : null;
	return (
		<ul className="space-y-1.5 text-sm">
			<li className="flex flex-wrap items-center gap-2">
				<span className={cn("font-medium", kindText(kind))}>
					{kind === "estimate" ? "Devizul" : "Lucrarea"} {fmtWorkOrder(order.number)}
				</span>
				{today && <StateTag state={orderLook(order, { today, appointment })} size="sm" />}
				{total != null && (
					<span className="ml-auto font-semibold tabular-nums">
						<Money value={total} decimals={0} />
					</span>
				)}
			</li>
			{live && (
				<li className="flex flex-wrap items-center gap-2">
					<span className={cn("font-medium", kindText("invoice"))}>{live.status === "draft" ? "Ciorna facturii" : `Factura ${formatInvoiceNumber(live.series, live.number)}`}</span>
					{invoiceState && <StateTag state={invoiceState} size="sm" />}
				</li>
			)}
		</ul>
	);
}

// ── Client · Mașina ─────────────────────────────────────────────────────────

/** A record's name that opens it: the whole row is the target, with a chevron. */
function OpenRow({ onClick, label, children }) {
	return (
		<button type="button" onClick={onClick} aria-label={label} className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/60">
			<span className="min-w-0 flex-1">{children}</span>
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
		</button>
	);
}

function CustomerBlock({ customer, today }) {
	const appointments = useCollection("appointments");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	if (!customer) {
		return (
			<Section title="Client" plain>
				<p className="text-sm text-muted-foreground">Fără client.</p>
			</Section>
		);
	}
	const facts = customerFacts(customer.id, { appointments: Object.values(appointments), workOrders: Object.values(workOrders) });
	const owed = today ? (selectCustomerBalances(invoices, payments, today).get(customer.id) ?? 0) : 0;
	const history = facts.visits ? `${plural(facts.visits, "vizită", "vizite")} · ultima pe ${fmtDate(facts.lastVisit, "d MMM yyyy")}` : "Client nou: prima vizită";
	return (
		<Section title="Client" plain>
			<div className="space-y-1.5">
				<OpenRow onClick={() => openSheet("customer-view", { id: customer.id })} label={`Deschide clientul ${customer.name}`}>
					<span className="block truncate text-sm font-semibold">{customer.name}</span>
				</OpenRow>
				{customer.phone && (
					<a href={telHref(customer.phone)} className="flex min-h-11 items-center gap-2 text-sm tabular-nums md:min-h-0">
						<Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
						<span className="underline decoration-dotted underline-offset-2">{formatPhone(customer.phone)}</span>
					</a>
				)}
				{customer.email && (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Mail className="size-4 shrink-0" aria-hidden />
						<span className="truncate">{customer.email}</span>
					</p>
				)}
				<p className="text-xs text-muted-foreground">{history}</p>
				{(facts.noShows > 0 || owed > 0) && (
					<div className="flex flex-wrap gap-1.5">
						{facts.noShows > 0 && (
							<ToneBadge tone="red" size="sm">
								{plural(facts.noShows, "neprezentare", "neprezentări")}
							</ToneBadge>
						)}
						{owed > 0 && (
							<ToneBadge tone="yellow" size="sm">
								De încasat <Money value={owed} decimals={0} />
							</ToneBadge>
						)}
					</div>
				)}
				<CustomerNote customerId={customer.id} />
			</div>
		</Section>
	);
}

function CarBlock({ appointment: a, vehicle, order, today, sectionRef }) {
	const workOrders = useCollection("workOrders");
	if (!vehicle) {
		return (
			<Section title="Mașina" sectionRef={sectionRef} plain className="max-md:border-t max-md:pt-5">
				<p className="text-sm text-muted-foreground">Fără mașină: primirea are nevoie de una.</p>
				<Button variant="outline" size="sm" className="max-md:h-11" onClick={() => openSheet("appointment", { id: a.id })}>
					<Plus /> Adaugă mașina
				</Button>
			</Section>
		);
	}
	const last = lastReading(vehicle);
	// Documents are checked against the visit's day (or today, once it has passed), as the warning does.
	const day = dayOfInstant(a.start);
	const visitDay = today && day < today ? today : day;
	const docs = [
		["ITP", vehicle.itpExpiry],
		["RCA", vehicle.rcaExpiry],
	].filter(([, date]) => date);
	const job = lastJob(vehicle.id, Object.values(workOrders), { except: order?.id });
	const what = job ? job.complaint || job.lines?.[0]?.description || "" : "";
	return (
		<Section title="Mașina" sectionRef={sectionRef} plain className="max-md:border-t max-md:pt-5">
			<div className="space-y-1.5">
				<OpenRow onClick={() => openSheet("vehicle-view", { id: vehicle.id })} label="Deschide mașina">
					<span className="flex min-w-0 flex-col gap-1">
						<VehicleLabel vehicle={vehicle} nameClassName="text-sm font-semibold" />
						<PlateTag value={vehicle.plate} className="self-start" />
					</span>
				</OpenRow>
				{last && (
					<p className="text-sm text-muted-foreground">
						{fmtKm(last.km)} <span className="text-xs">({fmtDate(last.date, "d MMM yyyy")})</span>
					</p>
				)}
				{docs.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{docs.map(([doc, date]) => {
							const status = deadline(date, visitDay).status;
							return (
								<ToneBadge key={doc} tone={DEADLINE_STATUS[status].tone} size="sm">
									{doc} {status === "expired" ? "expirat" : status === "soon" ? "expiră" : ""} {fmtDate(date, "dd.MM.yyyy")}
								</ToneBadge>
							);
						})}
					</div>
				)}
				{job && (
					<button type="button" onClick={() => openSheet("work-order-view", { id: job.id })} className="block min-h-11 w-full text-left text-xs text-muted-foreground hover:text-foreground md:min-h-0">
						Ultima lucrare: <span className="font-medium text-foreground">{fmtWorkOrder(job.number)}</span> · {fmtDate(job.dates?.delivered ?? job.createdAt, "d MMM yyyy")}
						{what ? ` · ${what}` : ""}
					</button>
				)}
			</div>
		</Section>
	);
}

// ── Ce se face ──────────────────────────────────────────────────────────────

function WorkSection({ appointment: a, settings, now }) {
	const services = useCollection("services");
	const ops = a.operations ?? (a.serviceIds ?? []).map((sid) => services[sid]).filter(Boolean).map((service) => operationFromService(service, settings.laborRate));
	const vat = { vatPayer: settings.invoicing.vatPayer, vatRate: settings.invoicing.vatRate };
	const estimate = operationsEstimate(ops, vat);
	const slot = minutesBetween(a.start, a.end);
	const fits = !estimate.minutes || estimate.minutes <= slot;
	const extendable = AHEAD.includes(a.status) && a.end > now;
	const longer = new Date(new Date(a.start).getTime() + estimate.minutes * 60_000).toISOString();

	const extend = () => {
		try {
			const { conflicts = [] } = moveAppointment(a.id, a.start, longer) ?? {};
			toast.success(`Prelungită până la ${fmtTime(longer)}`, { description: conflicts.length ? "Atenție: se suprapune cu altă programare." : undefined, action: undoTo(a) });
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<Section title="Ce se face">
			{ops.length > 0 ? (
				<div className="text-sm">
					<ul className="divide-y">
						{ops.map((op, index) => (
							<li key={op.id ?? `${op.name}-${index}`} className="flex items-baseline gap-3 py-2">
								<span className="min-w-0 flex-1">{op.name || "Operațiune"}</span>
								<span className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">{Number(op.hours) ? fmtLength(Math.round(Number(op.hours) * 60)) : ""}</span>
								<span className="w-24 shrink-0 text-right tabular-nums">
									<Money value={operationFigures(op, operationVatRate(op, vat)).gross} decimals={0} />
								</span>
							</li>
						))}
					</ul>
					<div className="flex items-baseline gap-3 border-t pt-2 font-semibold">
						<span className="min-w-0 flex-1">Estimat</span>
						<span className="w-20 shrink-0 text-right tabular-nums">{estimate.minutes ? fmtLength(estimate.minutes) : ""}</span>
						<span className="w-24 shrink-0 text-right tabular-nums">
							~ <Money value={estimate.gross} decimals={0} />
						</span>
					</div>
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-3">
					<p className="text-sm text-muted-foreground">Nicio operațiune.</p>
					<Button variant="outline" size="sm" className="max-md:h-11" onClick={() => openSheet("appointment", { id: a.id })}>
						<Plus /> Adaugă
					</Button>
				</div>
			)}
			{!fits && extendable && (
				<div className={cn("flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center", tone("yellow").chip)}>
					<p className="flex-1 text-sm">
						<Timer className="mr-1.5 inline size-4 align-text-bottom" aria-hidden />
						Operațiunile cer {fmtLength(estimate.minutes)}; intervalul are {fmtLength(slot)}.
					</p>
					<Button variant="outline" size="sm" className="bg-background/80 max-md:h-11" onClick={extend}>
						Prelungește până la {fmtTime(longer)}
					</Button>
				</div>
			)}
			{a.notes && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">„{a.notes}”</p>}
		</Section>
	);
}

// ── Cine lucrează ───────────────────────────────────────────────────────────

/** A pick saved at once, with its undo; the current one is kept in the list even when it is no longer active. */
function PickField({ label, value, options, onChange, disabled }) {
	return (
		<label className="block space-y-1.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<Select value={value ?? "none"} onValueChange={(next) => onChange(next === "none" ? null : next)} disabled={disabled}>
				<SelectTrigger className="w-full" aria-label={label}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">Nealocat</SelectItem>
					{options.map((option) => (
						<SelectItem key={option.id} value={option.id}>
							{option.color ? <Initials name={option.name} tone={option.color} size="sm" className="size-4.5" /> : null}
							{option.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</label>
	);
}

function StaffSection({ appointment: a, warnings, sectionRef }) {
	const staffMap = useCollection("staff");
	const baysMap = useCollection("bays");
	const keep = (list, map, current) => (current && map[current] && !list.some((item) => item.id === current) ? [...list, map[current]] : list);
	const staff = keep(selectActive(staffMap), staffMap, a.staffId);
	const bays = keep(selectActive(baysMap), baysMap, a.bayId);
	const editable = EDITABLE.includes(a.status);

	const assign = (patch, message) => {
		try {
			const { conflicts = [] } = saveAppointment({ ...a, ...patch }) ?? {};
			toast.success(message, { description: conflicts.length ? "Atenție: se suprapune cu altă programare." : undefined, action: undoTo(a) });
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<Section title="Cine lucrează" sectionRef={sectionRef}>
			<div className="grid gap-3 sm:grid-cols-2">
				<PickField label="Mecanic" value={a.staffId} options={staff} disabled={!editable} onChange={(staffId) => assign({ staffId }, staffId ? `La ${staffMap[staffId]?.name}` : "Fără mecanic")} />
				<PickField label="Post" value={a.bayId} options={bays} disabled={!editable} onChange={(bayId) => assign({ bayId }, bayId ? `Pe ${baysMap[bayId]?.name}` : "Fără post")} />
			</div>
			<WarningItems items={warnings} size="sheet" />
		</Section>
	);
}

// ── Oprire ──────────────────────────────────────────────────────────────────

/** Ending a booking, last and quiet, away from the moves that carry it on; each asks for a reason first. */
function StopSection({ appointment: a, flow, inCard, panel, setPanel, closePanel, sectionRef }) {
	const noShow = flow.moves.find((move) => move.id === "no_show");
	const cancel = flow.moves.find((move) => move.id === "cancel");
	const showNoShow = noShow?.allowed && !inCard.has("no_show");
	const callOff = panel === "no_show" || panel === "cancel";
	if (!cancel && !callOff) return null;
	return (
		<section ref={sectionRef} aria-label="Oprește programarea" className="scroll-mt-4 space-y-3 border-t pt-4">
			<div className="flex flex-wrap gap-x-2">
				{showNoShow && (
					<Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-destructive max-md:h-11" onClick={() => setPanel("no_show")}>
						<UserX /> Neprezentat
					</Button>
				)}
				{cancel && (
					<Button variant="ghost" size="sm" className={cn("text-muted-foreground hover:text-destructive max-md:h-11", !showNoShow && "-ml-2")} onClick={() => setPanel("cancel")}>
						<CircleX /> Anulează programarea
					</Button>
				)}
			</div>
			{callOff && <CallOffPanel appointment={a} to={panel === "no_show" ? "no_show" : "cancelled"} onClose={closePanel} />}
		</section>
	);
}
