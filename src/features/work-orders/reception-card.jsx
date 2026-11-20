"use client";

import { Car, ChevronRight, Play } from "lucide-react";
import { WARNING_LIGHTS, receptionOf } from "@/domain/reception";
import { fmtDate, fmtKm } from "@/lib/format";
import { FUEL_LEVELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { CarDiagram } from "./reception-flow";

/**
 * The reception on the job's sheet (owner, 20 Nov 2026): only what was filled, in one tappable group that opens the
 * walk-around (ReceptionFlow). Before it is done, a single "Începe recepția".
 */
export function ReceptionCard({ order, summary, locked, onOpen }) {
	const r = receptionOf(order);
	const facts = [
		order.mileage != null && fmtKm(order.mileage),
		order.fuelLevel != null && `combustibil ${FUEL_LEVELS[order.fuelLevel]}`,
		r.lights.length ? `martori: ${r.lights.map((k) => WARNING_LIGHTS.find((l) => l.key === k)?.label.toLowerCase()).join(", ")}` : r.lightsChecked && "fără martori",
		r.damage.length ? `${r.damage.length} ${r.damage.length === 1 ? "semn" : "semne"} pe caroserie` : r.bodyChecked && "fără semne pe caroserie",
		r.items && `lăsate: ${r.items}`,
	].filter(Boolean);

	if (!summary.done && !facts.length)
		return (
			<button type="button" disabled={locked} onClick={onOpen} className="flex w-full items-center gap-3 rounded-[14px] bg-card px-4 py-3.5 text-left hover:bg-foreground/[0.04] disabled:opacity-60">
				<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
					<Play className="size-4 fill-current" aria-hidden />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block text-[16px] font-semibold">Începe recepția</span>
					<span className="block text-[13px] text-muted-foreground">Kilometraj, combustibil, martori, caroserie, ce a lăsat clientul</span>
				</span>
				<ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
			</button>
		);

	return (
		<button type="button" disabled={locked} onClick={onOpen} className="flex w-full items-start gap-3 rounded-[14px] bg-card px-4 py-3.5 text-left hover:bg-foreground/[0.04] disabled:cursor-default">
			<span className="min-w-0 flex-1 space-y-1.5">
				<span className="flex items-center gap-2 text-[16px] font-semibold">
					<Car className="size-[18px] text-muted-foreground" aria-hidden />
					{summary.done ? `Primită ${fmtDate(r.doneAt, "d MMM, HH:mm")}` : "Recepție începută"}
				</span>
				<span className="block text-[14px] leading-snug text-muted-foreground">{facts.join(" · ") || "—"}</span>
				<span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium", r.confirmedAt ? "bg-[color-mix(in_srgb,#34c759_16%,transparent)] text-[#248a3d] dark:text-[#30d158]" : "bg-[color-mix(in_srgb,#ff9f0a_16%,transparent)] text-[#c76a00] dark:text-[#ffb340]")}>
					{r.confirmedAt ? `Confirmat de ${r.confirmedBy || "client"}` : "Neconfirmat de client"}
				</span>
			</span>
			{r.damage.length > 0 && <CarDiagram damage={r.damage} width={48} />}
			{!locked && <span className="self-center text-[14px] font-medium text-brand">Editează</span>}
		</button>
	);
}
