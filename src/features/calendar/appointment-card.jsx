"use client";

import { CarFront } from "lucide-react";
import { Initials } from "@/components/ds/data";
import { Plate } from "@/components/ds/plate";
import { StatusBadge, ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { vehicleName } from "@/domain/vehicle";
import { fmtTime } from "@/lib/format";
import { APPOINTMENT_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** The calendar's tinted event badge at list scale: time rail, plate, title, customer, status, mechanic. */
export function AppointmentCard({ appointment: a, vehicle, customer, mechanic, toneName, badge = "colored", checkIn = true, dimPast = false }) {
	const meta = APPOINTMENT_STATUS[a.status];
	const t = toneName ?? meta.tone;
	const faded = a.status === "cancelled" || a.status === "no_show";
	const past = dimPast && a.end < new Date().toISOString() && ["scheduled", "confirmed"].includes(a.status);
	const canCheckIn = checkIn && ["scheduled", "confirmed"].includes(a.status) && a.vehicleId;
	return (
		<div
			className={cn(
				"flex items-stretch gap-3 rounded-lg border p-2.5 transition-colors",
				badge === "dot" ? "bg-card hover:bg-accent/50" : tone(t).block,
				(faded || past) && "opacity-60",
			)}
		>
			<div className="flex w-12 shrink-0 flex-col items-center justify-center border-r border-current/15 pr-2.5 text-center">
				<span className="text-sm font-semibold tabular-nums">{fmtTime(a.start)}</span>
				<span className="text-2xs tabular-nums opacity-70">{fmtTime(a.end)}</span>
			</div>
			<button type="button" onClick={() => openSheet("appointment", { id: a.id })} className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 text-left">
				<span className="flex w-full items-center gap-2">
					{badge === "dot" && <ToneDot tone={t} />}
					{vehicle && <Plate value={vehicle.plate} size="sm" />}
					<span className={cn("truncate text-sm font-semibold", faded && "line-through")}>{a.title || "Programare"}</span>
				</span>
				<span className="w-full truncate text-xs opacity-80">
					{customer?.name}
					{vehicle ? ` · ${vehicleName(vehicle)}` : ""}
				</span>
			</button>
			<div className="flex shrink-0 flex-col items-end justify-between gap-1">
				<StatusBadge map={APPOINTMENT_STATUS} value={a.status} size="sm" icon={false} className={badge === "dot" ? undefined : "bg-card/70"} />
				{mechanic && <Initials name={mechanic.name} tone={mechanic.color} size="sm" />}
			</div>
			{canCheckIn && (
				<Button size="sm" variant="outline" className="self-center bg-card max-sm:hidden" onClick={() => openSheet("checkin", { appointmentId: a.id })}>
					<CarFront /> Sosit
				</Button>
			)}
		</div>
	);
}
