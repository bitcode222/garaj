"use client";

import { useState } from "react";
import { CalendarCheck, Check, ExternalLink, MoreHorizontal, Phone } from "lucide-react";
import { COVER_HEIGHT, COVER_WIDTH, CarCover, CoverButton, CoverIconButton } from "@/components/ds/car";
import { EmptyState } from "@/components/ds/data";
import { GlassPill } from "@/components/ds/glass";
import { SectionHeader } from "@/components/ds/blocks";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { addDaysISO, dayOfInstant } from "@/domain/dates";
import { STATE } from "@/lib/colors";
import { openSheet } from "@/lib/sheets";
import { restoreAppointment, setAppointmentStatus } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Azi A, first section (docs/DESIGN.md §4): the bookings still to accept, as outlined covers in day order, the soonest
// first, each naming its day. Confirming is one tap, with "Anulează" in the toast. Nothing to accept: the section stays, with a quiet empty card.

const carName = (vehicle) => [vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Mașină";
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Azi", "Mâine", "Vineri". */
function dayLabel(day, today) {
	if (day === today) return "Azi";
	if (day === addDaysISO(today, 1)) return "Mâine";
	return capital(fmtDate(day, "EEEE"));
}

const FILTERS = [
	{ value: "all", label: "Toate", keep: () => true },
	{ value: "today", label: "Azi", keep: (day, today) => day === today },
	{ value: "tomorrow", label: "Mâine", keep: (day, today) => day === addDaysISO(today, 1) },
	{ value: "later", label: "Mai târziu", keep: (day, today) => day > addDaysISO(today, 1) },
];

function BookingCover({ appointment: a, vehicle, customer, staff, bay, today }) {
	const day = dayOfInstant(a.start);
	const when = `${dayLabel(day, today).toLowerCase()} ${fmtTime(a.start)}`;
	const subject = carName(vehicle);
	// Outlined (dashed, on the card colour): not yet in the shop, unlike the jobs' covers below. The art tile keeps the car's colour.
	const light = "outline";
	const open = () => openSheet("appointment-view", { id: a.id });
	const confirm = () => {
		try {
			const previous = { ...a };
			setAppointmentStatus(a.id, "confirmed");
			toast.success(`${subject}: confirmată`, {
				action: {
					label: "Anulează",
					onClick: () => {
						try {
							restoreAppointment(previous);
						} catch (error) {
							toast.error(error.message);
						}
					},
				},
			});
		} catch (error) {
			toast.error(error.message);
		}
	};
	return (
		<CarCover
			make={vehicle?.make}
			car={subject}
			code={`${a.number ? `PRG #${a.number}` : "PRG"}${a.source === "online" ? " · Online" : ""}`}
			plate={vehicle?.plate}
			status="De confirmat"
			statusColor={STATE.wait}
			eyebrow={when}
			title={a.title || "Programare"}
			detail={[customer?.name, staff?.name?.split(" ")[0], bay?.name].filter(Boolean).join(" · ")}
			outline
			width={COVER_WIDTH}
			height={COVER_HEIGHT}
			onOpen={open}
			className="snap-start"
			action={
				<CoverButton icon={Check} outline onClick={confirm}>
					Confirmă
				</CoverButton>
			}
			menu={
				<>
					{customer?.phone && (
						<CoverIconButton href={`tel:${customer.phone}`} icon={Phone} label={`Sună: ${customer.name}`} light={light} />
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<CoverIconButton icon={MoreHorizontal} label="Mai multe" light={light} />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" data-sheet-menu>
							<DropdownMenuItem onSelect={open}>
								<ExternalLink /> Deschide programarea
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</>
			}
		/>
	);
}

/** `groups`: bookingsToConfirm's day groups (the passed ones left out), each { day, items }. */
export function ToAccept({ groups, today, vehicles, customers, staff, bays }) {
	const [filter, setFilter] = useState("all");
	const days = groups.filter((g) => g.day);
	const total = days.reduce((n, g) => n + g.items.length, 0);
	if (!total) {
		return (
			<section className="space-y-3" aria-label="De acceptat">
				<SectionHeader title="De acceptat" subtitle="Nicio programare de confirmat" href="/appointments/" />
				<EmptyState
					compact
					icon={CalendarCheck}
					title="Ești la zi cu programările"
					description="Programările noi apar aici până le confirmi."
					className="bg-card"
					action={
						<GlassPill active onClick={() => openSheet("appointment")} className="h-8 rounded-[8px] px-3 text-[13px]">
							Programare nouă
						</GlassPill>
					}
				/>
			</section>
		);
	}
	const counts = Object.fromEntries(FILTERS.map((f) => [f.value, days.filter((g) => f.keep(g.day, today)).reduce((n, g) => n + g.items.length, 0)]));
	const active = counts[filter] ? filter : "all";
	const keep = FILTERS.find((f) => f.value === active).keep;
	const shown = days.filter((g) => keep(g.day, today));
	const summary = days
		.slice(0, 3)
		.map((g) => `${g.items.length} ${dayLabel(g.day, today).toLowerCase()}`)
		.join(", ");
	return (
		<section className="space-y-3" aria-label="De acceptat">
			<SectionHeader title="De acceptat" subtitle={`${plural(total, "programare", "programări")} · ${summary}${days.length > 3 ? ", …" : ""}`} href="/appointments/">
				<div className="hidden gap-1.5 sm:flex" role="group" aria-label="Arată">
					{FILTERS.map((f) => {
						if (f.value !== "all" && !counts[f.value]) return null;
						return (
							<GlassPill key={f.value} active={active === f.value} aria-pressed={active === f.value} onClick={() => setFilter(f.value)}>
								{f.label}
								{f.value !== "all" && <span className="tabular-nums opacity-60">{counts[f.value]}</span>}
							</GlassPill>
						);
					})}
				</div>
			</SectionHeader>
			<div className="no-scrollbar -mx-4 flex snap-x gap-3.5 overflow-x-auto scroll-px-4 px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
				{/* No day labels in the row: they would push the covers off the În atelier grid. Each cover names its day. */}
				{shown.flatMap((group) => group.items).map((a) => (
					<BookingCover key={a.id} appointment={a} vehicle={vehicles[a.vehicleId]} customer={customers[a.customerId]} staff={staff[a.staffId]} bay={bays[a.bayId]} today={today} />
				))}
			</div>
		</section>
	);
}
