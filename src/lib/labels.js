// Every user-facing name of a domain value, with its tone and icon.
// Single source for badges, filters, boards and the calendar.

import {
	Banknote,
	CalendarCheck,
	CalendarClock,
	CarFront,
	CircleCheck,
	CircleDashed,
	CircleX,
	CreditCard,
	FilePen,
	FileText,
	KeyRound,
	Landmark,
	Package,
	PackageSearch,
	Receipt,
	Shield,
	ShieldCheck,
	ThumbsUp,
	TriangleAlert,
	Undo2,
	UserX,
	Wrench,
} from "lucide-react";

export const WORK_ORDER_STATUS = {
	estimate: { label: "Deviz", tone: "blue", icon: FilePen, hint: "Așteaptă aprobarea clientului" },
	approved: { label: "Aprobat", tone: "purple", icon: ThumbsUp, hint: "Aprobat, încă neînceput" },
	in_progress: { label: "În lucru", tone: "orange", icon: Wrench, hint: "Mecanicul lucrează" },
	waiting_parts: { label: "Așteaptă piese", tone: "yellow", icon: PackageSearch, hint: "Blocat până vin piesele" },
	ready: { label: "Gata", tone: "green", icon: CircleCheck, hint: "Gata de predare" },
	delivered: { label: "Predat", tone: "neutral", icon: KeyRound, hint: "Mașina a fost predată" },
	cancelled: { label: "Anulat", tone: "red", icon: CircleX, hint: "Lucrare anulată" },
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
	scheduled: { label: "Programat", tone: "blue", icon: CalendarClock },
	confirmed: { label: "Confirmat", tone: "purple", icon: CalendarCheck },
	arrived: { label: "Sosit", tone: "orange", icon: CarFront },
	done: { label: "Finalizat", tone: "green", icon: CircleCheck },
	no_show: { label: "Neprezentat", tone: "red", icon: UserX },
	cancelled: { label: "Anulat", tone: "neutral", icon: CircleX },
};

export const INVOICE_STATE = {
	draft: { label: "Ciornă", tone: "neutral", icon: FilePen },
	issued: { label: "Emisă", tone: "blue", icon: FileText },
	partial: { label: "Parțial plătită", tone: "yellow", icon: CircleDashed },
	paid: { label: "Plătită", tone: "green", icon: CircleCheck },
	overdue: { label: "Restantă", tone: "red", icon: TriangleAlert },
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
