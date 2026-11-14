// Every user-facing name of a domain value, with its tone and icon.
// Single source for badges, filters, boards and the calendar.
// Colours (docs/RECORD-COLORS.md): a record's kind has its own colour (RECORD_KIND); a status or state has a
// signal colour: red (late, missed), amber (waiting on someone, due), green (agreed, ready, paid), grey (not
// started or closed), or its kind's own colour while it is under way.

import {
	Banknote,
	CalendarCheck,
	CalendarClock,
	CalendarDays,
	CalendarX2,
	CarFront,
	Check,
	CircleCheck,
	CircleDashed,
	CircleX,
	Clock,
	CreditCard,
	FilePen,
	Hourglass,
	KeyRound,
	Landmark,
	Package,
	PackageSearch,
	Receipt,
	ReceiptText,
	Shield,
	ShieldCheck,
	Star,
	ThumbsUp,
	Undo2,
	UserX,
	Wrench,
} from "lucide-react";

/** What a record is, and its colour everywhere: the card's fill, the title of its page and sheet, the calendar, the day ruler. */
export const RECORD_KIND = {
	appointment: { label: "Programare", plural: "Programări", tone: "teal", icon: CalendarDays },
	estimate: { label: "Deviz", plural: "Devize", tone: "purple", icon: FilePen },
	job: { label: "Lucrare", plural: "Lucrări", tone: "orange", icon: Wrench },
	invoice: { label: "Factură", plural: "Facturi", tone: "blue", icon: ReceiptText },
	// The visit's last record (docs/VISIT-BAR.md B5): pink, a star.
	review: { label: "Recenzie", plural: "Recenzii", tone: "pink", icon: Star },
};

/** The icon in a state's dot, by the state's key (src/domain/record-state.js). */
export const STATE_ICON = {
	// Programare
	cancelled: CircleX,
	no_show: UserX,
	done: CircleCheck,
	arrived: CarFront,
	missed: CalendarX2,
	late: Clock,
	to_confirm: CalendarClock,
	confirmed: CalendarCheck,
	// Deviz, Lucrare
	overdue: Clock,
	awaiting_approval: Hourglass,
	approved: ThumbsUp,
	in_progress: Wrench,
	waiting_parts: PackageSearch,
	parts_late: PackageSearch,
	ready: CircleCheck,
	not_collected: KeyRound,
	delivered: KeyRound,
	// Factură
	draft: FilePen,
	stornoed: Undo2,
	storno: Undo2,
	paid: CircleCheck,
	partial: CircleDashed,
	due: Clock,
};

/** What a booking's card on the calendar is marked as, in its top-left corner (src/domain/visit.js bookingMark). */
export const BOOKING_MARK = {
	booking: { label: "Programare", tone: "teal", icon: CalendarDays },
	job: { label: "Lucrare", tone: "orange", icon: Wrench },
	done: { label: "Finalizată", tone: "green", icon: Check },
};

export const WORK_ORDER_STATUS = {
	estimate: { label: "Deviz", tone: "yellow", icon: Hourglass, hint: "Așteaptă aprobarea clientului" },
	approved: { label: "Aprobat", tone: "green", icon: ThumbsUp, hint: "Aprobat, încă neînceput" },
	in_progress: { label: "În lucru", tone: "orange", icon: Wrench, hint: "Mecanicul lucrează" },
	waiting_parts: { label: "Așteaptă piese", tone: "yellow", icon: PackageSearch, hint: "Blocat până vin piesele" },
	ready: { label: "Gata", tone: "green", icon: CircleCheck, hint: "Gata de predare" },
	delivered: { label: "Predat", tone: "neutral", icon: KeyRound, hint: "Mașina a fost predată" },
	cancelled: { label: "Anulat", tone: "neutral", icon: CircleX, hint: "Lucrare anulată" },
};

export const WORK_ORDER_ACTIONS = {
	approved: "Aprobă devizul",
	in_progress: "Începe lucrul",
	waiting_parts: "Așteaptă piese",
	ready: "Marchează gata",
	delivered: "Predă mașina",
	estimate: "Înapoi la deviz",
	cancelled: "Anulează lucrarea",
};

export const APPOINTMENT_STATUS = {
	scheduled: { label: "Programat", tone: "yellow", icon: CalendarClock },
	confirmed: { label: "Confirmat", tone: "green", icon: CalendarCheck },
	arrived: { label: "Sosit", tone: "teal", icon: CarFront },
	done: { label: "Finalizat", tone: "neutral", icon: CircleCheck },
	no_show: { label: "Neprezentat", tone: "red", icon: UserX },
	cancelled: { label: "Anulat", tone: "neutral", icon: CircleX },
};

/**
 * A visit on the dashboard calendar (src/domain/visit.js): booked, then the job's own
 * stages with the board's labels and tones. "Programat" is drawn as an outline
 * (`outline`), so it never reads as the solid neutral of "Predat".
 */
export const VISIT_STAGE = {
	scheduled: { label: "Programat", tone: "neutral", icon: CalendarClock, outline: true, hint: "Încă nu a sosit" },
	estimate: WORK_ORDER_STATUS.estimate,
	approved: WORK_ORDER_STATUS.approved,
	in_progress: WORK_ORDER_STATUS.in_progress,
	waiting_parts: WORK_ORDER_STATUS.waiting_parts,
	ready: WORK_ORDER_STATUS.ready,
	delivered: WORK_ORDER_STATUS.delivered,
	no_show: APPOINTMENT_STATUS.no_show,
};

/** Why a booking was called off (src/domain/appointment.js CANCEL_REASONS). */
export const CANCEL_REASON = {
	client: "Clientul a anulat",
	shop: "Service-ul a anulat",
	other: "Alt motiv",
};

/** How far a review got (src/domain/review.js reviewState). */
export const REVIEW_STATE = {
	none: { label: "Necerută", tone: "neutral" },
	requested: { label: "Cerută", tone: "blue" },
	received: { label: "Primită", tone: "green" },
};

/** The admin's quick tags on a customer, in a review. */
export const REVIEW_TAGS = {
	punctual: "Punctual",
	pays_on_time: "Plătește la timp",
	demanding: "Pretențios",
	recommends: "Ne recomandă",
};

export const INVOICE_STATE = {
	draft: { label: "Ciornă", tone: "neutral", icon: FilePen },
	issued: { label: "Emisă", tone: "yellow", icon: Clock },
	partial: { label: "Parțial plătită", tone: "yellow", icon: CircleDashed },
	paid: { label: "Plătită", tone: "green", icon: CircleCheck },
	overdue: { label: "Restantă", tone: "red", icon: Clock },
	cancelled: { label: "Stornată", tone: "neutral", icon: Undo2 },
	storno: { label: "Stornare", tone: "neutral", icon: Undo2 },
};

export const DEADLINE_STATUS = {
	ok: { label: "Valabil", tone: "green" },
	soon: { label: "Expiră curând", tone: "yellow" },
	expired: { label: "Expirat", tone: "red" },
	unknown: { label: "Necompletat", tone: "neutral" },
};

export const STOCK_STATUS = {
	ok: { label: "În stoc", tone: "green" },
	low: { label: "Stoc redus", tone: "yellow" },
	out: { label: "Epuizat", tone: "red" },
};

export const PAYMENT_METHODS = {
	cash: { label: "Numerar", icon: Banknote },
	card: { label: "Card", icon: CreditCard },
	transfer: { label: "Transfer bancar", icon: Landmark },
};

export const LINE_KINDS = {
	labor: { label: "Manoperă", icon: Wrench },
	part: { label: "Piesă", icon: Package },
	fee: { label: "Altele", icon: Receipt },
};

export const SERVICE_CATEGORIES = {
	maintenance: { label: "Întreținere", tone: "blue" },
	brakes: { label: "Frâne", tone: "red" },
	engine: { label: "Motor", tone: "orange" },
	diagnostics: { label: "Diagnoză", tone: "purple" },
	electrical: { label: "Electrică", tone: "yellow" },
	tires: { label: "Roți", tone: "green" },
	ac: { label: "Climatizare", tone: "blue" },
	suspension: { label: "Suspensie", tone: "orange" },
	transmission: { label: "Transmisie", tone: "purple" },
	inspection: { label: "ITP", tone: "green" },
	exhaust: { label: "Evacuare", tone: "neutral" },
	bodywork: { label: "Caroserie", tone: "red" },
};

export const FUELS = {
	petrol: "Benzină",
	diesel: "Diesel",
	hybrid: "Hibrid",
	electric: "Electric",
	lpg: "GPL",
};

export const FUEL_LEVELS = ["Rezervă", "1/4", "1/2", "3/4", "Plin"];

export const STAFF_ROLES = {
	mechanic: "Mecanic",
	electrician: "Electrician",
	bodywork: "Tinichigiu",
	painter: "Vopsitor",
	advisor: "Consilier service",
};

export const BAY_KINDS = {
	lift: "Elevator",
	alignment: "Geometrie",
	diagnostics: "Diagnoză",
	bodywork: "Caroserie",
	other: "Alt post",
};

export const REMINDER_TYPES = {
	itp: { label: "ITP", icon: ShieldCheck, tone: "yellow" },
	rca: { label: "RCA", icon: Shield, tone: "purple" },
	service: { label: "Revizie", icon: Wrench, tone: "blue" },
	unpaid: { label: "Restanță", icon: Receipt, tone: "red" },
	pickup: { label: "De ridicat", icon: KeyRound, tone: "green" },
	tomorrow: { label: "Programare mâine", icon: CalendarClock, tone: "blue" },
};

export const INSPECTION_STATUS = {
	ok: { label: "OK", tone: "green" },
	attention: { label: "Atenție", tone: "yellow" },
	urgent: { label: "Urgent", tone: "red" },
};

export const CUSTOMER_TYPES = {
	person: "Persoană fizică",
	company: "Persoană juridică",
};

export const UNITS = ["h", "buc", "set", "l", "kg", "m", "100 g"];

export const CALENDAR_COLORS = ["blue", "green", "red", "yellow", "purple", "orange"];
