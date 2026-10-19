"use client";

import { useState } from "react";
import { CalendarCheck, CalendarClock, CarFront, CircleX, Clock, History, Undo2, UserX } from "lucide-react";
import { toast } from "@/lib/toast";
import { Timeline } from "@/components/ds/data";
import { FlowSteps } from "@/components/ds/flow-steps";
import { Field } from "@/components/ds/inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANCEL_REASONS, delayOverruns, findConflicts } from "@/domain/appointment";
import { addDaysISO, combineDateTime, dayOfInstant, minutesBetween, timeOfInstant } from "@/domain/dates";
import { appointmentFlow } from "@/domain/flow";
import { fmtDate, fmtTime } from "@/lib/format";
import { APPOINTMENT_STATUS, CANCEL_REASON } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { announceAppointmentDelay, callOffAppointmentById, rescheduleAppointmentTo, restoreAppointment, setAppointmentStatus } from "@/lib/store/actions";
import { useCollection, useToday } from "@/lib/store/hooks";
import { selectAppointmentsByDay } from "@/lib/store/selectors";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { useNowMinute } from "@/lib/hooks";

const DURATIONS = [30, 60, 90, 120, 180, 240, 480];
const lengthLabel = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);
const addMinutes = (instant, minutes) => new Date(new Date(instant).getTime() + minutes * 60_000).toISOString();
const when = (instant) => `${fmtDate(instant, "EEE d MMM")}, ${fmtTime(instant)}`;

const STEPS = ["scheduled", "confirmed", "arrived", "done"].map((key) => ({ key, label: APPOINTMENT_STATUS[key].label, tone: APPOINTMENT_STATUS[key].tone }));

const MOVE_LABEL = {
	confirm: "Confirmă",
	unconfirm: "Înapoi la Programat",
	checkin: "A sosit — primire",
	reschedule: "Reprogramează",
	delay: "Întârzie",
	no_show: "Neprezentat",
	cancel: "Anulează",
	restore: "Restabilește",
};
const MOVE_ICON = { confirm: CalendarCheck, checkin: CarFront, reschedule: CalendarClock, delay: Clock, no_show: UserX, cancel: CircleX, restore: Undo2 };

/** The undo every booking change offers: the booking exactly as it was. */
const undoTo = (previous) => ({
	label: "Anulează",
	onClick: () => {
		try {
			restoreAppointment(previous);
		} catch (error) {
			toast.error(error.message);
		}
	},
});

/**
 * The booking's state section (docs/VISIT-FLOW.md §6.1): Programat → Confirmat → Sosit →
 * Finalizat, the next step, every other move, and the small panels that some moves open
 * in place (a new time, an announced delay, a reason for calling it off).
 */
export function AppointmentState({ appointment, order, panel = null, onPanel }) {
	useNowMinute(); // "its time has passed" changes with the clock
	const setPanel = onPanel; // the open panel: reschedule · delay · no_show · cancel (owned by the sheet)
	const now = new Date().toISOString();
	const flow = appointmentFlow(appointment, { now, order });
	const subject = appointment.title || "Programarea";

	const quick = (to, verb) => {
		try {
			setAppointmentStatus(appointment.id, to);
			toast.success(`${subject}: ${verb}`, { action: undoTo(appointment) });
		} catch (error) {
			toast.error(error.message);
		}
	};
	const run = {
		confirm: () => quick("confirmed", "confirmată"),
		unconfirm: () => quick("scheduled", "înapoi la programat"),
		restore: () => quick("scheduled", "restabilită"),
		checkin: () => openSheet("checkin", { appointmentId: appointment.id }),
		reschedule: () => setPanel("reschedule"),
		delay: () => setPanel("delay"),
		no_show: () => setPanel("no_show"),
		cancel: () => setPanel("cancel"),
	};
	const toMove = (move) => ({ id: move.id, label: MOVE_LABEL[move.id], icon: MOVE_ICON[move.id], onClick: run[move.id], disabled: !move.allowed, reason: move.reason, destructive: move.kind === "end" });

	const NEXT = {
		confirm: { label: "Clientul a confirmat", icon: CalendarCheck, hint: "Dacă nu a răspuns încă, trimite-i o reamintire de mai jos." },
		checkin: { label: "A sosit — începe lucrarea", icon: CarFront, hint: "Deschide lucrarea: kilometrajul, combustibilul și ce reclamă clientul." },
		reschedule: { label: "Reprogramează", icon: CalendarClock, hint: "Alege o oră nouă; programarea revine la Programat." },
	};
	const next = flow.next ? { ...NEXT[flow.next.id], onClick: run[flow.next.id] } : null;
	const others = flow.moves.filter((move) => move !== flow.next).map(toMove);

	// A side state is a banner with what happened, when, why, and the way back.
	let off = null;
	if (flow.off) {
		const entry = [...(appointment.activity ?? [])].reverse().find((item) => item.type === "status" && item.to === flow.off);
		const reason = appointment.cancelReason;
		const why = reason ? [reason.code && CANCEL_REASON[reason.code], reason.note].filter(Boolean).join(": ") : null;
		off = {
			title: flow.off === "no_show" ? "Clientul nu s-a prezentat" : "Programare anulată",
			description: [entry ? `pe ${fmtDate(entry.at, "d MMM, HH:mm")}` : null, why].filter(Boolean).join(" · ") || null,
			tone: flow.off === "no_show" ? "red" : "neutral",
			icon: flow.off === "no_show" ? UserX : CircleX,
			actions: flow.moves.filter((move) => move.allowed).map((move) => ({ label: MOVE_LABEL[move.id], onClick: run[move.id], primary: move.kind === "next" })),
		};
	}

	// Its time has passed and nothing was recorded: the warning "missed" above asks, with its fixes (docs/WARNINGS.md).
	const notice =
		appointment.status === "arrived" ? (
		<p className="text-sm text-muted-foreground">Mașina e în service: totul continuă în lucrare (pasul următor, sus).</p>
	) : appointment.status === "done" ? (
		<p className="text-sm text-muted-foreground">Vizita s-a încheiat.</p>
	) : null;

	const close = () => setPanel(null);
	return (
		<FlowSteps
			label="Starea programării"
			steps={STEPS}
			current={flow.current}
			off={off}
			mark={appointment.expectedAt && !flow.off && appointment.status !== "arrived" ? { label: `anunțat: vine la ${fmtTime(appointment.expectedAt)}`, tone: "blue" } : null}
			notice={notice}
			next={next}
			moves={flow.off ? [] : others}
			onPanelClose={close}
			panel={
				panel === "reschedule" ? (
					<ReschedulePanel appointment={appointment} onClose={close} />
				) : panel === "delay" ? (
					<DelayPanel appointment={appointment} onClose={close} />
				) : panel === "no_show" || panel === "cancel" ? (
					<CallOffPanel appointment={appointment} to={panel === "no_show" ? "no_show" : "cancelled"} onClose={close} />
				) : null
			}
		/>
	);
}

function PanelFrame({ title, children, onClose, onSave, saveLabel, destructive = false, disabled = false }) {
	return (
		<div className="space-y-4 rounded-lg border p-4">
			<p className="text-sm font-semibold">{title}</p>
			{children}
			<div className="flex flex-wrap justify-end gap-2">
				<Button variant="outline" className="max-md:h-11 max-md:flex-1" onClick={onClose}>
					Renunță
				</Button>
				<Button variant={destructive ? "destructive" : "default"} className="max-md:h-11 max-md:flex-1" onClick={onSave} disabled={disabled}>
					{saveLabel}
				</Button>
			</div>
		</div>
	);
}

function Chips({ options, value, onChange, label }) {
	return (
		<div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
					className={cn("inline-flex h-11 items-center rounded-full border px-3 text-sm transition-colors hover:bg-accent md:h-8", value === option.value && "border-foreground bg-accent font-medium")}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

/** A new time, in place: date, time, length, quick choices, and the overlap shown as it is picked. */
function ReschedulePanel({ appointment, onClose }) {
	const today = useToday();
	const byDay = selectAppointmentsByDay(useCollection("appointments"));
	const length = minutesBetween(appointment.start, appointment.end);
	const startDay = dayOfInstant(appointment.start);
	const [date, setDate] = useState(startDay < today ? today : startDay);
	const [time, setTime] = useState(timeOfInstant(appointment.start));
	const [minutes, setMinutes] = useState(length);
	const [knows, setKnows] = useState(true);
	const start = date && time ? combineDateTime(date, time) : null;
	const end = start ? addMinutes(start, minutes) : null;
	const conflicts = start ? findConflicts({ ...appointment, status: "scheduled", start, end }, byDay.get(date) ?? []) : [];
	const past = start && start < new Date().toISOString();
	const confirmed = appointment.status === "confirmed";

	const save = () => {
		try {
			const { appointment: moved, previous } = rescheduleAppointmentTo(appointment.id, { start, end, customerKnows: confirmed && knows });
			const reconfirm = previous.status === "confirmed" && moved.status === "scheduled";
			toast.success(`Reprogramată: ${when(start)}–${fmtTime(end)}`, {
				description: conflicts.length ? "Atenție: se suprapune cu altă programare." : reconfirm ? "Trebuie confirmată din nou: anunță clientul." : undefined,
				action: undoTo(previous),
			});
			onClose();
		} catch (error) {
			toast.error(error.message);
		}
	};

	const shift = (days) => setDate(addDaysISO(date, days));
	return (
		<PanelFrame title="Reprogramează" onClose={onClose} onSave={save} saveLabel="Mută programarea" disabled={!start}>
			<div className="flex flex-wrap gap-1.5">
				<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => setTime(timeOfInstant(addMinutes(combineDateTime(date, time), 60)))}>
					+1 h
				</Button>
				<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => shift(1)}>
					+1 zi
				</Button>
				<Button size="sm" variant="outline" className="max-md:h-11" onClick={() => shift(7)}>
					+1 săptămână
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<Field label="Data">{(id) => <Input id={id} type="date" value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
				<Field label="Ora">{(id) => <Input id={id} type="time" step={900} value={time} onChange={(event) => setTime(event.target.value)} />}</Field>
				<Field label="Durată" className="col-span-2 sm:col-span-1">
					{(id) => (
						<Select value={String(minutes)} onValueChange={(value) => setMinutes(Number(value))}>
							<SelectTrigger id={id} className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{[...new Set([...DURATIONS, minutes])]
									.sort((a, b) => a - b)
									.map((m) => (
										<SelectItem key={m} value={String(m)}>
											{lengthLabel(m)}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					)}
				</Field>
			</div>
			{confirmed && (
				<label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
					<input type="checkbox" className="size-4" checked={knows} onChange={(event) => setKnows(event.target.checked)} />
					Clientul știe de noua oră (rămâne confirmată)
				</label>
			)}
			{(conflicts.length > 0 || past) && (
				<p className={cn("rounded-md border p-2.5 text-xs", tone("yellow").chip)}>
					{past ? "Ora aleasă a trecut. " : ""}
					{conflicts.length ? `Se suprapune cu ${conflicts.map((c) => `${fmtTime(c.start)}–${fmtTime(c.end)} ${c.title}`).join(", ")}.` : ""}
				</p>
			)}
		</PanelFrame>
	);
}

/** The customer called to say they come later: the booking keeps its slot and gets the time they gave. */
function DelayPanel({ appointment, onClose }) {
	const length = minutesBetween(appointment.start, appointment.end);
	const [late, setLate] = useState(15);
	const [other, setOther] = useState(timeOfInstant(addMinutes(appointment.start, 45)));
	const expectedAt = late === "other" ? combineDateTime(dayOfInstant(appointment.start), other) : addMinutes(appointment.start, late);
	const overruns = delayOverruns({ ...appointment, expectedAt });
	const [move, setMove] = useState(true);

	const save = () => {
		try {
			if (overruns && move) {
				const { previous } = rescheduleAppointmentTo(appointment.id, { start: expectedAt, end: addMinutes(expectedAt, length), customerKnows: true });
				toast.success(`Mutată la ${fmtTime(expectedAt)}`, { action: undoTo(previous) });
			} else {
				const { previous } = announceAppointmentDelay(appointment.id, expectedAt);
				toast.success(`Anunțat: vine la ${fmtTime(expectedAt)}`, { action: undoTo(previous) });
			}
			onClose();
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<PanelFrame title={`Întârzie față de ${fmtTime(appointment.start)}`} onClose={onClose} onSave={save} saveLabel={overruns && move ? "Mută programarea" : "Salvează"}>
			<Chips
				label="Cu cât întârzie"
				value={late}
				onChange={setLate}
				options={[
					{ value: 15, label: "15 min" },
					{ value: 30, label: "30 min" },
					{ value: 60, label: "1 h" },
					{ value: "other", label: "Altă oră" },
				]}
			/>
			{late === "other" && <Field label="Vine la">{(id) => <Input id={id} type="time" step={300} value={other} onChange={(event) => setOther(event.target.value)} className="w-40" />}</Field>}
			<p className="text-sm text-muted-foreground">
				Vine la <span className="font-medium text-foreground tabular-nums">{fmtTime(expectedAt)}</span>. Până atunci nu apare ca întârziată.
			</p>
			{overruns && (
				<label className="flex min-h-11 items-center gap-2 text-sm md:min-h-0">
					<input type="checkbox" className="size-4" checked={move} onChange={(event) => setMove(event.target.checked)} />
					Nu mai încape în interval: mută și programarea la {fmtTime(expectedAt)}–{fmtTime(addMinutes(expectedAt, length))}
				</label>
			)}
		</PanelFrame>
	);
}

/** Cancel, or record a no-show, with an optional reason. */
function CallOffPanel({ appointment, to, onClose }) {
	const [reason, setReason] = useState(null);
	const [note, setNote] = useState("");
	const save = () => {
		try {
			const { previous } = callOffAppointmentById(appointment.id, { to, reason, note });
			toast.success(to === "no_show" ? "Marcată neprezentat." : "Programare anulată.", { action: undoTo(previous) });
			onClose();
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<PanelFrame title={to === "no_show" ? "Clientul nu s-a prezentat" : "Anulezi programarea?"} onClose={onClose} onSave={save} saveLabel={to === "no_show" ? "Marchează neprezentat" : "Anulează programarea"} destructive>
			<Chips label="Motivul" value={reason} onChange={(value) => setReason(reason === value ? null : value)} options={CANCEL_REASONS.map((value) => ({ value, label: CANCEL_REASON[value] }))} />
			<Field label="Notiță (opțional)">{(id) => <Input id={id} value={note} onChange={(event) => setNote(event.target.value)} placeholder="ex. revine după concediu" />}</Field>
		</PanelFrame>
	);
}

const HISTORY_TITLE = {
	scheduled: "Înapoi la Programat",
	confirmed: "Confirmată",
	arrived: "Mașina a sosit",
	done: "Vizita s-a încheiat",
	no_show: "Neprezentat",
	cancelled: "Anulată",
};

/** The booking's history, newest first: what happened to it, and when. */
export function AppointmentHistory({ appointment }) {
	const items = [...(appointment.activity ?? [])].reverse().map((entry, index) => {
		const id = `${entry.at}-${index}`;
		if (entry.type === "created") return { id, title: "Programare creată", meta: fmtDate(entry.at, "d MMM, HH:mm") };
		if (entry.type === "rescheduled") return { id, title: `Mutată: ${when(entry.from.start)} → ${when(entry.to.start)}`, icon: CalendarClock, meta: fmtDate(entry.at, "d MMM, HH:mm") };
		if (entry.type === "delay") return { id, title: `Anunțat: vine la ${fmtTime(entry.expectedAt)}`, icon: Clock, meta: fmtDate(entry.at, "d MMM, HH:mm") };
		if (entry.type === "checked_in") return { id, title: "Mașina a sosit · lucrarea deschisă", icon: CarFront, tone: "orange", meta: fmtDate(entry.at, "d MMM, HH:mm") };
		const why = entry.reason ? [entry.reason.code && CANCEL_REASON[entry.reason.code], entry.reason.note].filter(Boolean).join(": ") : "";
		return { id, title: `${HISTORY_TITLE[entry.to] ?? entry.to}${why ? ` · ${why}` : ""}`, icon: APPOINTMENT_STATUS[entry.to]?.icon, tone: APPOINTMENT_STATUS[entry.to]?.tone, meta: fmtDate(entry.at, "d MMM, HH:mm") };
	});
	const list = items.length ? items : [{ id: "created", title: "Programare creată", meta: fmtDate(appointment.createdAt, "d MMM, HH:mm") }];
	return (
		<section aria-label="Istoricul programării" className="space-y-3">
			<h3 className="flex items-center gap-1.5 text-sm font-semibold">
				<History className="size-4 text-muted-foreground" aria-hidden /> Istoric
			</h3>
			<Timeline items={list} />
		</section>
	);
}
