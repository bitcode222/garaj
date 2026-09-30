"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus, EllipsisVertical, FileSearch, Gauge, Pencil, Shield, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { useConfirm } from "@/components/ds/confirm";
import { ContactActions } from "@/components/ds/contact";
import { EmptyState, KeyValue, KeyValueGrid, Money, Timeline } from "@/components/ds/data";
import { NumberInput } from "@/components/ds/inputs";
import { Page, PageHeader, SplitView } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { computeTotals } from "@/domain/lines";
import { reminderMessage } from "@/domain/reminders";
import { deadline, estimateKm, kmPerDay, lastReading, serviceDue, vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtKm, fmtRelativeTo, fmtWorkOrder } from "@/lib/format";
import { useQueryId } from "@/lib/hooks";
import { DEADLINE_STATUS, FUELS, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { tone } from "@/lib/tones";
import { deleteVehicle, recordMileage } from "@/lib/store/actions";
import { useCollection, useEntity, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectWorkOrdersByVehicle } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

export function VehicleDetail() {
	const id = useQueryId();
	const ready = useIsReady();
	const vehicle = useEntity("vehicles", id);
	if (!ready) return <DetailPageSkeleton />;
	if (!vehicle) {
		return (
			<Page>
				<PageHeader title="Mașină" back={{ href: "/vehicles/", label: "Mașini" }} />
				<EmptyState icon={FileSearch} title="Mașina nu există" description="A fost ștearsă sau linkul este greșit." />
			</Page>
		);
	}
	return <Vehicle vehicle={vehicle} />;
}

/** Odometer history: one 2px line, 8px markers with a surface ring, hover/focus readout, table twin. */
function MileageChart({ log }) {
	const [active, setActive] = useState(null);
	if (log.length < 2) return null;
	const w = 320;
	const h = 84;
	const t0 = new Date(log[0].date).getTime();
	const t1 = new Date(log[log.length - 1].date).getTime();
	const k0 = Math.min(...log.map((r) => r.km));
	const k1 = Math.max(...log.map((r) => r.km));
	const x = (d) => ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (w - 16) + 8;
	const y = (km) => h - 8 - ((km - k0) / (k1 - k0 || 1)) * (h - 16);
	const points = log.map((r) => `${x(r.date).toFixed(1)},${y(r.km).toFixed(1)}`).join(" ");
	const current = active != null ? log[active] : log[log.length - 1];
	return (
		<div className="viz space-y-2">
			<p className="text-xs text-muted-foreground" aria-live="polite">
				<span className="font-semibold text-foreground tabular-nums">{fmtKm(current.km)}</span> · {fmtDate(current.date)}
			</p>
			<svg viewBox={`0 0 ${w} ${h}`} className="h-21 w-full overflow-visible" role="img" aria-label="Evoluția kilometrajului" onPointerLeave={() => setActive(null)}>
				<line x1="0" x2={w} y1={h - 1} y2={h - 1} stroke="var(--viz-grid)" strokeWidth="1" />
				<polyline points={points} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
				{log.map((r, i) => (
					<g key={`${r.date}-${r.km}`}>
						<circle cx={x(r.date)} cy={y(r.km)} r={active === i ? 5 : 4} fill="var(--viz-1)" stroke="var(--card)" strokeWidth="2" />
						<rect
							x={x(r.date) - 12}
							y={0}
							width={24}
							height={h}
							fill="transparent"
							tabIndex={0}
							aria-label={`${fmtDate(r.date)}: ${fmtKm(r.km)}`}
							onPointerEnter={() => setActive(i)}
							onFocus={() => setActive(i)}
							onBlur={() => setActive(null)}
						/>
					</g>
				))}
			</svg>
			<details className="text-xs">
				<summary className="cursor-pointer text-muted-foreground">Toate citirile ({log.length})</summary>
				<table className="mt-2 w-full">
					<tbody>
						{[...log].reverse().map((r) => (
							<tr key={`${r.date}-${r.km}`} className="border-t">
								<td className="py-1">{fmtDate(r.date)}</td>
								<td className="py-1 text-right tabular-nums">{fmtKm(r.km)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</details>
		</div>
	);
}

function DeadlineCard({ icon: Icon, title, info, date, detail, action }) {
	const meta = DEADLINE_STATUS[info.status];
	return (
		<div className={cn("flex flex-col gap-2 rounded-xl border p-4", info.status !== "ok" && info.status !== "unknown" && tone(meta.tone).soft)}>
			<div className="flex items-center justify-between gap-2">
				<span className="flex items-center gap-2 text-sm font-medium">
					<Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
				</span>
				<ToneBadge tone={meta.tone} size="sm">
					{meta.label}
				</ToneBadge>
			</div>
			<p className="text-lg font-semibold tabular-nums">{date ? fmtDate(date) : "Necompletat"}</p>
			<p className="text-xs text-muted-foreground">{detail}</p>
			{action}
		</div>
	);
}

function Vehicle({ vehicle }) {
	const router = useRouter();
	const confirm = useConfirm();
	const today = useToday();
	const settings = useSettings();
	const owner = useEntity("customers", vehicle.customerId);
	const workOrders = useCollection("workOrders");
	const orders = selectWorkOrdersByVehicle(workOrders).get(vehicle.id) ?? [];
	const [km, setKm] = useState(null);
	const last = lastReading(vehicle);
	const itp = today ? deadline(vehicle.itpExpiry, today) : { status: "unknown" };
	const rca = today ? deadline(vehicle.rcaExpiry, today) : { status: "unknown" };
	const service = today ? serviceDue(vehicle, today) : { status: "unknown" };
	const perDay = kmPerDay(vehicle.mileage ?? []);
	const inShop = orders.find((o) => !["delivered", "cancelled"].includes(o.status));

	const remind = (type, due, days) =>
		owner?.phone ? (
			<ContactActions
				phone={owner.phone}
				labels={false}
				message={reminderMessage({ type, due, days, kmLeft: service.kmLeft, urgency: service.status }, { customer: owner, vehicle, settings })}
			/>
		) : null;

	const addKm = () => {
		try {
			const warning = recordMileage(vehicle.id, km);
			if (warning) toast.warning(warning);
			else toast.success("Kilometraj adăugat.");
			setKm(null);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const remove = async () => {
		if (!(await confirm({ title: `Ștergi mașina ${vehicle.plate}?`, confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteVehicle(vehicle.id);
			toast.success("Mașină ștearsă.");
			router.replace("/vehicles/");
		} catch (error) {
			toast.error(error.message);
		}
	};

	const history = orders.map((o) => ({
		id: o.id,
		icon: WORK_ORDER_STATUS[o.status].icon,
		tone: WORK_ORDER_STATUS[o.status].tone,
		title: (
			<Link href={`/work-orders/detail/?id=${o.id}`} className="hover:underline">
				{o.lines.filter((l) => l.kind === "labor").map((l) => l.description).join(", ") || o.complaint || "Lucrare"}
			</Link>
		),
		meta: fmtDate(o.createdAt),
		content: (
			<span className="flex flex-wrap items-center gap-x-2">
				<span className="font-mono text-xs">{fmtWorkOrder(o.number)}</span>
				{o.mileage && <span>{fmtKm(o.mileage)}</span>}
				<Money value={computeTotals(o.lines, { vatPayer: settings.invoicing.vatPayer }).gross} decimals={0} />
			</span>
		),
	}));

	return (
		<Page width="wide">
			<PageHeader
				back={{ href: "/vehicles/", label: "Mașini" }}
				title={
					<span className="flex flex-wrap items-center gap-3">
						<Plate value={vehicle.plate} size="lg" />
						<span>{vehicleName(vehicle) || "Mașină"}</span>
					</span>
				}
				meta={
					<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						{[vehicle.year, vehicle.engine, FUELS[vehicle.fuel], vehicle.color].filter(Boolean).join(" · ")}
						{owner && (
							<>
								<span aria-hidden>·</span>
								<Link href={`/customers/detail/?id=${owner.id}`} className="font-medium text-foreground hover:underline">
									{owner.name}
								</Link>
							</>
						)}
						{inShop && (
							<Link href={`/work-orders/detail/?id=${inShop.id}`}>
								<ToneBadge tone="orange" icon={Wrench}>
									În service · {fmtWorkOrder(inShop.number)}
								</ToneBadge>
							</Link>
						)}
					</div>
				}
				actions={
					<>
						{!inShop && (
							<Button onClick={() => openSheet("checkin", { vehicleId: vehicle.id })}>
								<Wrench /> Primire
							</Button>
						)}
						<Button variant="outline" onClick={() => openSheet("appointment", { vehicleId: vehicle.id })}>
							<CalendarPlus /> <span className="max-sm:hidden">Programează</span>
						</Button>
						<Button variant="outline" size="icon" onClick={() => openSheet("vehicle", { id: vehicle.id })} aria-label="Editează">
							<Pencil />
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon" aria-label="Mai multe">
									<EllipsisVertical />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem variant="destructive" onSelect={remove}>
									<Trash2 /> Șterge mașina
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</>
				}
			/>

			<div className="mb-6 grid gap-3 sm:grid-cols-3">
				<DeadlineCard icon={ShieldCheck} title="ITP" info={itp} date={vehicle.itpExpiry} detail={vehicle.itpExpiry ? fmtRelativeTo(vehicle.itpExpiry, today) : "Adaugă data expirării"} action={itp.status === "soon" || itp.status === "expired" ? remind("itp", vehicle.itpExpiry, itp.days) : null} />
				<DeadlineCard icon={Shield} title="RCA" info={rca} date={vehicle.rcaExpiry} detail={vehicle.rcaExpiry ? fmtRelativeTo(vehicle.rcaExpiry, today) : "Adaugă data expirării"} action={rca.status === "soon" || rca.status === "expired" ? remind("rca", vehicle.rcaExpiry, rca.days) : null} />
				<DeadlineCard
					icon={Wrench}
					title="Revizie"
					info={service}
					date={service.dueDate}
					detail={service.kmLeft != null ? `${service.kmLeft < 0 ? "depășită cu" : "mai sunt"} ${fmtKm(Math.abs(service.kmLeft))} (estimat)` : "Completează ultima revizie"}
					action={service.status === "soon" || service.status === "expired" ? remind("service", service.dueDate, service.days) : null}
				/>
			</div>

			<SplitView
				main={
					<Card>
						<CardHeader title="Istoric service" icon={Wrench} description={`${orders.length} vizite`} />
						<CardContent className="pt-4">
							{history.length ? <Timeline items={history} /> : <EmptyState compact icon={Wrench} title="Nicio lucrare încă" />}
						</CardContent>
					</Card>
				}
				aside={
					<>
						<Card>
							<CardHeader title="Kilometraj" icon={Gauge} />
							<CardContent className="space-y-3 pt-3">
								<div className="flex items-baseline justify-between">
									<p className="text-2xl font-semibold tabular-nums">{fmtKm(last?.km)}</p>
									<p className="text-xs text-muted-foreground">{last ? fmtDate(last.date) : ""}</p>
								</div>
								<MileageChart log={vehicle.mileage ?? []} />
								<p className="text-xs text-muted-foreground">
									{perDay ? `≈ ${Math.round(perDay * 365).toLocaleString("ro-RO")} km / an · estimat azi ${fmtKm(estimateKm(vehicle, today))}` : "Adaugă mai multe citiri pentru estimări."}
								</p>
								<div className="flex gap-2">
									<div className="flex-1">
										<NumberInput decimals={0} suffix="km" value={km} onValueChange={setKm} placeholder="Citire nouă" aria-label="Kilometraj nou" />
									</div>
									<Button variant="outline" onClick={addKm} disabled={!km} className="max-md:h-11">
										Adaugă
									</Button>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader title="Detalii" />
							<CardContent className="pt-3">
								<KeyValueGrid className="grid-cols-1">
									<KeyValue label="Serie șasiu (VIN)" mono>
										{vehicle.vin || "—"}
									</KeyValue>
									<KeyValue label="Interval revizie">
										{(vehicle.serviceIntervalKm || settings.service.intervalKm).toLocaleString("ro-RO")} km / {vehicle.serviceIntervalMonths || settings.service.intervalMonths} luni
									</KeyValue>
									<KeyValue label="Ultima revizie">{vehicle.lastServiceDate ? `${fmtDate(vehicle.lastServiceDate)} · ${fmtKm(vehicle.lastServiceKm)}` : "—"}</KeyValue>
								</KeyValueGrid>
								{vehicle.notes && <p className="mt-4 rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{vehicle.notes}</p>}
							</CardContent>
						</Card>
					</>
				}
			/>
		</Page>
	);
}
