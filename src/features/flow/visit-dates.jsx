"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { canReschedule } from "@/domain/appointment";
import { dayOfInstant, diffDaysISO, pad2, toISODate } from "@/domain/dates";
import { dateDelta, editableJobDates, visitDates } from "@/domain/visit-dates";
import { fmtDate, fmtDays, fmtTime, plural } from "@/lib/format";
import { moveAppointment, rescheduleAppointmentTo, setJobDates } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** An instant as a `datetime-local` input wants it, in local time. */
function toInput(iso) {
	if (!iso) return "";
	const date = new Date(iso);
	return `${toISODate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "azi", "ieri", "mâine", otherwise the day; the year only when it is another one. */
function dayWord(iso, today) {
	const day = dayOfInstant(iso);
	const away = today ? diffDaysISO(today, day) : null;
	if (away !== null && Math.abs(away) <= 1) return fmtDays(away);
	return fmtDate(iso, !today || day.slice(0, 4) === today.slice(0, 4) ? "d MMM" : "d MMM yyyy");
}

const shortSpan = (minutes) => (minutes < 60 ? `${minutes} min` : minutes < 24 * 60 ? `${Math.round(minutes / 60)} h` : plural(Math.round(minutes / (24 * 60)), "zi", "zile"));

/** Against the plan, in two words and a colour; on time is said only when it is worth saying. */
function deltaNote(delta) {
	if (!delta) return null;
	if (delta.kind === "on_time") return { text: "la timp", className: tone("green").text };
	if (delta.kind === "early") return { text: `cu ${shortSpan(delta.minutes)} mai devreme`, className: "text-muted-foreground" };
	return { text: `cu ${shortSpan(delta.minutes)} mai târziu`, className: tone("red").text };
}

function DateEditor({ title, fields, onSave, onClose }) {
	const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.key, toInput(field.value)])));
	const save = (event) => {
		event.preventDefault();
		const patch = {};
		for (const field of fields) {
			if (values[field.key] === toInput(field.value)) continue;
			const date = new Date(values[field.key]);
			if (!values[field.key] || Number.isNaN(date.getTime())) return toast.error("Alege o dată și o oră.");
			patch[field.key] = date.toISOString();
		}
		if (!Object.keys(patch).length) return onClose();
		try {
			onSave(patch);
			toast.success("Data a fost salvată.");
			onClose();
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<form onSubmit={save} className="space-y-3">
			<p className="text-sm font-semibold">{title}</p>
			{fields.map((field) => (
				<label key={field.key} className="block space-y-1">
					<span className="text-xs text-muted-foreground">{field.label}</span>
					<Input type="datetime-local" step={300} value={values[field.key]} onChange={(event) => setValues((all) => ({ ...all, [field.key]: event.target.value }))} />
				</label>
			))}
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={onClose}>
					Renunță
				</Button>
				<Button type="submit" size="sm" className="max-md:h-11">
					Salvează
				</Button>
			</div>
		</form>
	);
}

function Stop({ label, value, detail, empty = "—", addable = false, note, reached, current, next, last, fields, onSave, onOpen, today }) {
	const [open, setOpen] = useState(false);
	const body = (
		<>
			<span className="block text-xs text-muted-foreground">{label}</span>
			<span className={cn("mt-0.5 block text-[15px] leading-snug font-semibold first-letter:uppercase", !value && (addable ? "font-medium text-brand" : "font-normal text-muted-foreground"))}>{value ? dayWord(value, today) : addable ? "Adaugă" : empty}</span>
			{value && <span className="block text-xs text-muted-foreground tabular-nums">{detail ?? fmtTime(value)}</span>}
			{note && <span className={cn("mt-0.5 block text-xs leading-tight", note.className)}>{note.text}</span>}
		</>
	);
	const cell = "-mx-1.5 block w-[calc(100%+0.75rem)] rounded-lg px-1.5 py-1 text-left";
	const action = "transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-foreground/[0.08] pointer-coarse:min-h-11";
	return (
		<li className="relative min-w-0">
			<div className="relative mb-1.5 flex h-3 items-center" aria-hidden>
				{!last && <span className={cn("absolute -right-3 left-3 h-0.5", reached && next?.reached ? "bg-foreground/60" : "bg-border")} />}
				<span className={cn("relative size-3 rounded-full border-2", reached ? "border-foreground bg-foreground" : current ? "border-brand bg-card" : "border-border bg-card")} />
			</div>
			{onOpen ? (
				<button type="button" onClick={onOpen} aria-label={`Modifică: ${label}`} className={cn(cell, action)}>
					{body}
				</button>
			) : fields ? (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<button type="button" aria-label={`Modifică: ${label}`} className={cn(cell, action)}>
							{body}
						</button>
					</PopoverTrigger>
					<PopoverContent align="start" className="w-72">
						<DateEditor title={label} fields={fields} onSave={onSave} onClose={() => setOpen(false)} />
					</PopoverContent>
				</Popover>
			) : (
				<div className={cell}>{body}</div>
			)}
		</li>
	);
}

/**
 * When a visit happens, as one line of four stops: booked, in, due or ready, handed over. Each stop opens its own small
 * editor; a real date says how it went against the plan. `onEditBooked` hands a booking still ahead to its reschedule panel.
 */
export function VisitDates({ appointment = null, order = null, today, now, onEditBooked, bookedNote }) {
	const dates = visitDates({ appointment, order });
	const editable = editableJobDates(order, appointment);
	const can = (field) => editable.includes(field);
	const instant = now ?? new Date().toISOString();

	const saveJob = (patch) => setJobDates(order.id, patch);
	const saveBooked = (patch) => {
		const start = patch.start ?? appointment.start;
		const end = patch.end ?? appointment.end;
		if (appointment.status === "arrived") moveAppointment(appointment.id, start, end);
		else rescheduleAppointmentTo(appointment.id, { start, end });
	};

	const bookedEditable = Boolean(appointment) && canReschedule(appointment);
	const bookedFields = bookedEditable && !onEditBooked ? [{ key: "start", label: "Începe", value: appointment.start }, { key: "end", label: "Se termină", value: appointment.end }] : null;
	const sameDay = dates.booked && dayOfInstant(dates.booked.start) === dayOfInstant(dates.booked.end);

	const isReady = Boolean(dates.ready);
	const overdue = !isReady && !dates.delivered && order && dates.promised && dates.promised < instant;
	const finishNote = isReady ? deltaNote(dateDelta(dates.ready, dates.promised)) : overdue ? { text: "termen depășit", className: tone("red").text } : null;
	const finishFields = order && can("promised") ? [...(isReady && can("ready") ? [{ key: "ready", label: "A fost gata", value: dates.ready }] : []), { key: "promised", label: "Termen promis clientului", value: dates.promised }] : null;

	const stops = [
		{
			key: "booked",
			label: "Programat",
			value: dates.booked?.start ?? null,
			detail: dates.booked ? (sameDay ? `${fmtTime(dates.booked.start)}–${fmtTime(dates.booked.end)}` : fmtTime(dates.booked.start)) : null,
			empty: "Fără",
			note: bookedNote ?? null,
			reached: Boolean(dates.booked),
			fields: bookedFields,
			onSave: saveBooked,
			onOpen: bookedEditable ? onEditBooked : undefined,
		},
		{
			key: "arrived",
			label: "A intrat",
			value: dates.arrived,
			empty: "Încă nu",
			note: dates.arrived ? deltaNote(dateDelta(dates.arrived, dates.booked?.start)) : null,
			reached: Boolean(dates.arrived),
			fields: can("arrived") ? [{ key: "arrived", label: "A intrat în service", value: dates.arrived }] : null,
			onSave: saveJob,
		},
		{
			key: "finish",
			label: isReady ? "Gata" : "Termen",
			value: isReady ? dates.ready : dates.promised,
			addable: Boolean(finishFields),
			note: finishNote,
			reached: isReady,
			fields: finishFields,
			onSave: saveJob,
			// A booking without a job yet: its end is the promise, moved together with its slot.
			onOpen: !order && bookedEditable ? onEditBooked : undefined,
		},
		{
			key: "delivered",
			label: "Predat",
			value: dates.delivered,
			empty: "Încă nu",
			reached: Boolean(dates.delivered),
			fields: can("delivered") ? [{ key: "delivered", label: "Predat clientului", value: dates.delivered }] : null,
			onSave: saveJob,
		},
	];
	const lastReached = stops.reduce((found, stop, index) => (stop.reached ? index : found), -1);
	const marked = stops.map((stop, index) => ({ ...stop, current: index === lastReached + 1 }));

	return (
		<ol aria-label="Datele vizitei" className="grid grid-cols-4 gap-x-3">
			{marked.map(({ key, ...stop }, index) => (
				<Stop key={key} {...stop} next={marked[index + 1]} last={index === marked.length - 1} today={today} />
			))}
		</ol>
	);
}
