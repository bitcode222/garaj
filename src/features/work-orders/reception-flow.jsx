"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { Check, ChevronLeft, CircleAlert, X } from "lucide-react";
import { NumberInput } from "@/components/ds/inputs";
import { Button } from "@/components/ui/button";
import { DAMAGE_KINDS, DAMAGE_ZONES, WARNING_LIGHTS, receptionOf } from "@/domain/reception";
import { uid } from "@/domain/ids";
import { lastReading } from "@/domain/vehicle";
import { fmtDate, fmtKm } from "@/lib/format";
import { FUEL_LEVELS } from "@/lib/labels";
import { saveWorkOrderReception } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Receiving the car (owner, 20 Nov 2026: "the whole flow in a separate modal"; board flow R1 "Pas cu pas"): five
// short steps in a window of its own, the dots on top, Înapoi and Mai departe at the bottom; the last one saves.
// The job's sheet only shows what was filled and opens this.

const STEPS = ["Bord", "Martori aprinși", "Caroserie", "Problema", "Confirmare"];
const KIND_COLOR = { scratch: "#ff9f0a", dent: "#ff3b30", crack: "#5e5ce6", missing: "#8e8e93" };

/** The walk-around, as a draft: what the job already has, ready to be changed. */
function draftOf(order, customer) {
	const r = receptionOf(order);
	return {
		mileage: order.mileage ?? null,
		fuelLevel: order.fuelLevel ?? null,
		complaint: order.complaint ?? "",
		lights: r.lights,
		lightsChecked: r.lightsChecked,
		damage: r.damage,
		bodyChecked: r.bodyChecked,
		items: r.items,
		confirmed: Boolean(r.confirmedAt),
		confirmedBy: r.confirmedBy || customer?.name || "",
	};
}

export function ReceptionFlow({ open, onOpenChange, order, vehicle, customer }) {
	const [step, setStep] = useState(0);
	const [draft, setDraft] = useState(() => draftOf(order, customer));
	const [zone, setZone] = useState(null);
	const [wasOpen, setWasOpen] = useState(open);
	// Each opening starts at the first step from what the job has now.
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setStep(0);
			setZone(null);
			setDraft(draftOf(order, customer));
		}
	}
	const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
	const last = lastReading(vehicle);
	const lowKm = draft.mileage != null && last && draft.mileage < last.km;
	const lastStep = step === STEPS.length - 1;

	const save = () => {
		try {
			saveWorkOrderReception(order.id, draft);
			toast.success("Recepția a fost salvată.");
			onOpenChange(false);
		} catch (error) {
			toast.error(error.message);
		}
	};
	const toggleLight = (key) => set({ lights: draft.lights.includes(key) ? draft.lights.filter((k) => k !== key) : [...draft.lights, key], lightsChecked: true });
	const addMark = (kind) => {
		if (!zone) return;
		set({ damage: [...draft.damage, { id: uid(), zone, kind, note: "" }], bodyChecked: true });
		setZone(null);
	};

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
				<DialogPrimitive.Content
					aria-describedby={undefined}
					className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 md:inset-auto md:top-1/2 md:left-1/2 md:h-[min(46rem,92dvh)] md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:overflow-hidden md:rounded-[24px] md:shadow-2xl"
				>
					<div className="shrink-0 px-4 pt-[calc(0.75rem+var(--safe-top))] md:pt-4">
						<div className="flex items-center gap-2">
							<DialogPrimitive.Close className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground" aria-label="Închide">
								<X className="size-4" />
							</DialogPrimitive.Close>
							<div className="min-w-0 flex-1 text-center">
								<DialogPrimitive.Title className="text-[16px] font-semibold">Recepție</DialogPrimitive.Title>
								<p className="text-xs text-muted-foreground">
									Pasul {step + 1} din {STEPS.length} · {STEPS[step]}
								</p>
							</div>
							<span className="size-9" />
						</div>
						<div className="flex justify-center gap-1.5 py-3" aria-hidden>
							{STEPS.map((s, i) => (
								<button key={s} type="button" tabIndex={-1} onClick={() => setStep(i)} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-brand" : "w-1.5", i < step ? "bg-brand" : i > step && "bg-muted-foreground/25")} />
							))}
						</div>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
						{step === 0 && (
							<div className="space-y-6 pt-2">
								<label className="block text-center">
									<span className="text-sm text-muted-foreground">Kilometraj la bord</span>
									<NumberInput value={draft.mileage} onValueChange={(v) => set({ mileage: v == null ? null : Math.round(v) })} decimals={0} suffix="km" className="mt-2 h-14 text-center text-[28px] font-bold tabular-nums" aria-label="Kilometraj" autoFocus />
									<span className={cn("mt-1.5 block text-xs", lowKm ? "text-destructive" : "text-muted-foreground")}>
										{last ? `${lowKm ? "Mai puțin decât ultima dată: " : "Ultima dată: "}${fmtKm(last.km)}${last.date ? `, ${fmtDate(last.date, "d MMM yyyy")}` : ""}` : "Prima vizită cu kilometraj"}
									</span>
								</label>
								<div>
									<p className="mb-2 text-center text-sm text-muted-foreground">Combustibil</p>
									<div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Combustibil">
										{FUEL_LEVELS.map((label, i) => (
											<button key={label} type="button" role="radio" aria-checked={draft.fuelLevel === i} onClick={() => set({ fuelLevel: i })} className={cn("flex h-16 flex-col items-center justify-end gap-1.5 rounded-xl bg-muted pb-2 text-xs font-medium", draft.fuelLevel === i && "bg-brand text-white")}>
												<span className="flex h-6 items-end gap-0.5" aria-hidden>
													{[0, 1, 2, 3].map((b) => (
														<i key={b} className={cn("w-1.5 rounded-[2px]", b < i || (i === 0 && b === 0) ? "bg-current" : "bg-current opacity-25")} style={{ height: 8 + b * 4 }} />
													))}
												</span>
												{label}
											</button>
										))}
									</div>
								</div>
							</div>
						)}

						{step === 1 && (
							<div className="space-y-3 pt-2">
								<p className="text-center text-sm text-muted-foreground">Pornește motorul și atinge ce rămâne aprins.</p>
								<div className="grid grid-cols-3 gap-2">
									{WARNING_LIGHTS.map((l) => {
										const on = draft.lights.includes(l.key);
										return (
											<button key={l.key} type="button" aria-pressed={on} onClick={() => toggleLight(l.key)} className={cn("flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl bg-muted text-[13px] font-medium", on && "bg-[color-mix(in_srgb,#ff9f0a_20%,var(--muted))] ring-2 ring-[#ff9f0a] ring-inset")}>
												<CircleAlert className={cn("size-5", on ? "text-[#ff9f0a]" : "text-muted-foreground/60")} aria-hidden />
												{l.label}
											</button>
										);
									})}
								</div>
								<button type="button" aria-pressed={draft.lightsChecked && !draft.lights.length} onClick={() => set({ lights: [], lightsChecked: true })} className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-muted text-[15px] font-medium", draft.lightsChecked && !draft.lights.length && "bg-[color-mix(in_srgb,#34c759_18%,var(--muted))] text-[#248a3d] dark:text-[#30d158]")}>
									<Check className="size-4" aria-hidden /> Niciun martor aprins
								</button>
							</div>
						)}

						{step === 2 && (
							<div className="space-y-3 pt-1">
								<p className="text-center text-sm text-muted-foreground">{zone ? `${DAMAGE_ZONES.find((z) => z.key === zone).label}: ce are?` : "Ocolește mașina și atinge unde vezi ceva."}</p>
								<CarDiagram damage={draft.damage} zone={zone} onZone={setZone} />
								{zone ? (
									<div className="grid grid-cols-2 gap-2">
										{DAMAGE_KINDS.map((k) => (
											<button key={k.key} type="button" onClick={() => addMark(k.key)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-muted text-[15px] font-medium">
												<i className="size-2.5 rounded-full" style={{ background: KIND_COLOR[k.key] }} aria-hidden /> {k.label}
											</button>
										))}
										<button type="button" onClick={() => setZone(null)} className="col-span-2 h-10 text-sm text-muted-foreground">
											Renunță
										</button>
									</div>
								) : draft.damage.length ? (
									<ul className="divide-y overflow-hidden rounded-xl bg-muted">
										{draft.damage.map((d, i) => (
											<li key={d.id} className="flex items-center gap-3 px-3 py-2">
												<span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: KIND_COLOR[d.kind] }}>
													{i + 1}
												</span>
												<span className="min-w-0 flex-1 text-[15px]">
													{DAMAGE_ZONES.find((z) => z.key === d.zone)?.label} · <span className="text-muted-foreground">{DAMAGE_KINDS.find((k) => k.key === d.kind)?.label}</span>
												</span>
												<button type="button" onClick={() => set({ damage: draft.damage.filter((x) => x.id !== d.id) })} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" aria-label={`Șterge semnul ${i + 1}`}>
													<X className="size-4" />
												</button>
											</li>
										))}
									</ul>
								) : (
									<button type="button" aria-pressed={draft.bodyChecked} onClick={() => set({ bodyChecked: true })} className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-muted text-[15px] font-medium", draft.bodyChecked && "bg-[color-mix(in_srgb,#34c759_18%,var(--muted))] text-[#248a3d] dark:text-[#30d158]")}>
										<Check className="size-4" aria-hidden /> Fără semne pe caroserie
									</button>
								)}
							</div>
						)}

						{step === 3 && (
							<div className="space-y-5 pt-2">
								<label className="block">
									<span className="mb-1.5 block text-sm font-medium">Ce reclamă clientul</span>
									<textarea value={draft.complaint} onChange={(e) => set({ complaint: e.target.value })} rows={4} placeholder="Cu vorbele lui: ce face mașina, de când, când apare" className="w-full resize-none rounded-xl bg-muted px-3.5 py-3 text-[16px] outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring" />
								</label>
								<label className="block">
									<span className="mb-1.5 block text-sm font-medium">Lăsate în mașină</span>
									<textarea value={draft.items} onChange={(e) => set({ items: e.target.value })} rows={2} placeholder="ex. roată de rezervă, scaun de copil, acte" className="w-full resize-none rounded-xl bg-muted px-3.5 py-3 text-[16px] outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring" />
								</label>
							</div>
						)}

						{step === 4 && (
							<div className="space-y-4 pt-2">
								<ul className="divide-y overflow-hidden rounded-xl bg-muted text-[15px]">
									{[
										["Kilometraj", draft.mileage != null ? fmtKm(draft.mileage) : "—", 0],
										["Combustibil", draft.fuelLevel != null ? FUEL_LEVELS[draft.fuelLevel] : "—", 0],
										["Martori", draft.lights.length ? draft.lights.map((k) => WARNING_LIGHTS.find((l) => l.key === k)?.label).join(", ") : draft.lightsChecked ? "niciunul" : "—", 1],
										["Caroserie", draft.damage.length ? `${draft.damage.length} ${draft.damage.length === 1 ? "semn" : "semne"}` : draft.bodyChecked ? "fără semne" : "—", 2],
										["Problema", draft.complaint.trim() || "—", 3],
										["Lăsate", draft.items.trim() || "—", 3],
									].map(([k, v, s]) => (
										<li key={k}>
											<button type="button" onClick={() => setStep(s)} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left">
												<span className="w-24 shrink-0 text-muted-foreground">{k}</span>
												<span className={cn("min-w-0 flex-1 text-right", v === "—" && "text-muted-foreground")}>{v}</span>
											</button>
										</li>
									))}
								</ul>
								<label className="flex items-start gap-3 rounded-xl bg-muted px-3.5 py-3">
									<input type="checkbox" checked={draft.confirmed} onChange={(e) => set({ confirmed: e.target.checked })} className="mt-0.5 size-5 accent-[var(--brand)]" />
									<span className="text-[15px]">
										Clientul a văzut și e de acord
										<span className="block text-xs text-muted-foreground">Starea mașinii la primire, ce a lăsat în ea și ce reclamă.</span>
									</span>
								</label>
								{draft.confirmed && (
									<label className="block">
										<span className="mb-1.5 block text-sm font-medium">Numele clientului</span>
										<input value={draft.confirmedBy} onChange={(e) => set({ confirmedBy: e.target.value })} className="h-11 w-full rounded-xl bg-muted px-3.5 text-[16px] outline-none focus:ring-2 focus:ring-ring" />
									</label>
								)}
							</div>
						)}
					</div>

					<div className="flex shrink-0 gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] md:pb-4">
						{step > 0 && (
							<Button variant="outline" className="h-11" onClick={() => setStep(step - 1)}>
								<ChevronLeft /> Înapoi
							</Button>
						)}
						<Button className="h-11 flex-1" onClick={() => (lastStep ? save() : setStep(step + 1))}>
							{lastStep ? "Salvează recepția" : "Mai departe"}
						</Button>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

/** The car from above, front at the top: tap a zone to mark it; the marks are numbered dots in their kind's colour. */
export function CarDiagram({ damage = [], zone = null, onZone, width = 200 }) {
	return (
		<svg viewBox="0 0 140 260" width={width} className="mx-auto block" role={onZone ? "group" : "img"} aria-label="Mașina văzută de sus">
			<rect x="22" y="8" width="96" height="244" rx="34" className="fill-muted stroke-muted-foreground/40" strokeWidth="1.5" />
			<path d="M34 80 Q70 60 106 80 L100 112 Q70 102 40 112 Z" className="fill-background stroke-muted-foreground/40" strokeWidth="1.5" />
			<path d="M40 182 Q70 192 100 182 L106 210 Q70 226 34 210 Z" className="fill-background stroke-muted-foreground/40" strokeWidth="1.5" />
			{[[16, 60], [124, 60], [16, 196], [124, 196]].map(([x, y]) => (
				<rect key={`${x}${y}`} x={x - 6} y={y - 16} width="12" height="32" rx="5" className="fill-muted-foreground/50" />
			))}
			{onZone &&
				DAMAGE_ZONES.map((z) => (
					<circle key={z.key} cx={z.x} cy={z.y} r={zone === z.key ? 11 : 9} role="button" tabIndex={0} aria-label={z.label} onClick={() => onZone(z.key)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onZone(z.key)} className={cn("cursor-pointer outline-none", zone === z.key ? "fill-brand" : "fill-foreground/[0.07] stroke-foreground/25 hover:fill-foreground/15 focus-visible:stroke-ring")} strokeWidth="1" strokeDasharray={zone === z.key ? undefined : "2 2"} />
				))}
			{damage.map((d, i) => {
				const z = DAMAGE_ZONES.find((x) => x.key === d.zone);
				if (!z) return null;
				const n = damage.slice(0, i).filter((x) => x.zone === d.zone).length;
				return (
					<g key={d.id} pointerEvents="none">
						<circle cx={z.x + n * 7} cy={z.y - n * 7} r="8" fill={KIND_COLOR[d.kind]} stroke="white" strokeWidth="1.5" />
						<text x={z.x + n * 7} y={z.y - n * 7 + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="white">
							{i + 1}
						</text>
					</g>
				);
			})}
		</svg>
	);
}

export { KIND_COLOR };
