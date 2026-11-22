"use client";

import Link from "next/link";
import { addMonthsISO, monthKey } from "@/domain/dates";
import { AREA, STATE } from "@/lib/colors";
import { fmtDate, formatMoney, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Change, METHOD_SHADE, lastWeekday } from "./money-row";

// Azi's header (owner's pick "Azi în teanc", 22 Nov 2026, https://claude.ai/artifact/QovhifVU8XqTQiuvXPppKn): the page
// title is the first card, in solid ink, and the day's numbers tuck in behind it, each a little higher or lower.

const STEPS = ["translate-y-[-3px] rotate-[0.7deg]", "translate-y-[7px] rotate-[-0.5deg]", "translate-y-[-4px] rotate-[0.8deg]", "translate-y-[5px] rotate-[-0.7deg]"];
const LAYERS = ["z-[9]", "z-[8]", "z-[7]", "z-[6]"];
const CARD = "relative flex h-[156px] min-w-[196px] flex-1 basis-0 flex-col gap-0.5 rounded-2xl border bg-card py-3 pr-4 text-left shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_22px_rgb(0_0_0/0.07)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.3),0_10px_26px_rgb(0_0_0/0.32)]";
const TUCKED = "-ml-3.5 pl-[calc(1rem+0.875rem)]";
const LIVELY = "transition-[translate,rotate,border-color] duration-300 ease-out hover:z-30 hover:-translate-y-1 hover:rotate-0 hover:border-muted-foreground/40 focus-visible:z-30 focus-visible:-translate-y-1 focus-visible:rotate-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none";

function Stat({ place, label, value, detail, href, onClick, children }) {
	const className = cn(CARD, TUCKED, LIVELY, STEPS[place], LAYERS[place]);
	const body = (
		<>
			<span className="truncate text-[13px] font-semibold text-muted-foreground">{label}</span>
			<span className="azi-figure truncate text-[25px] leading-tight font-extrabold tabular-nums">{value}</span>
			<span className="block truncate text-xs text-muted-foreground">{detail}</span>
			<span className="mt-auto block">{children}</span>
		</>
	);
	if (href) {
		return (
			<Link href={href} className={className}>
				{body}
			</Link>
		);
	}
	return (
		<button type="button" onClick={onClick} className={className}>
			{body}
		</button>
	);
}

function Bar({ parts }) {
	const total = parts.reduce((sum, part) => sum + part.value, 0);
	return (
		<span className="flex h-[7px] gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
			{total > 0 && parts.filter((part) => part.value > 0).map((part) => <span key={part.key} className="block min-w-[3px]" style={{ flex: `${part.value} 1 0`, background: part.color }} />)}
		</span>
	);
}

/** The month so far over the whole month's width, so the empty part is the days still to come. */
function MonthLine({ month }) {
	const W = 300;
	const H = 30;
	const top = Math.max(month.value, month.previousTotal, 1);
	const x = (i) => (i / Math.max(1, month.days - 1)) * W;
	const y = (v) => H - 2 - (v / top) * (H - 4);
	const line = month.points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
	const end = x(month.points.length - 1).toFixed(1);
	return (
		<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[30px] w-full" aria-hidden>
			<path d={`${line}L${end},${H}L0,${H}Z`} fill={AREA.rapoarte} opacity="0.14" />
			<path d={line} fill="none" stroke={AREA.rapoarte} strokeWidth="2" vectorEffect="non-scaling-stroke" />
		</svg>
	);
}

export function AziHeader({ today, shopName, toAccept, takings, still, month, currency, jobs, onShowShop, onShowReady }) {
	const money = (amount) => formatMoney(amount, currency, { decimals: 0 });
	const weekday = lastWeekday(today);
	const previousMonth = fmtDate(addMonthsISO(`${monthKey(today)}-01`, -1), "MMMM");
	const working = jobs.filter((job) => job.status === "in_progress").length;
	const ready = jobs.filter((job) => job.status === "ready").length;
	const waiting = jobs.length - working - ready;
	const stillParts = [still.cars.count > 0 && plural(still.cars.count, "mașină gata", "mașini gata"), still.invoices.count > 0 && plural(still.invoices.count, "factură scadentă", "facturi scadente")].filter(Boolean);
	const stillTarget = still.cars.count > 0 ? { onClick: onShowReady } : { href: "/invoices/" };

	return (
		<header className="no-scrollbar -mx-4 -my-5 flex overflow-x-auto px-4 py-7">
			<div className="relative z-10 flex h-[156px] min-w-[204px] flex-1 basis-0 rotate-[-0.6deg] flex-col rounded-2xl bg-foreground px-4 py-3.5 text-background shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_22px_rgb(0_0_0/0.07)]">
				<h1 className="text-[28px] leading-tight">Azi</h1>
				<p className="truncate text-[13px] opacity-70 first-letter:uppercase">{fmtDate(today, "EEEE, d MMMM")}</p>
				<p className="truncate text-[13px] opacity-70">{shopName}</p>
				<Link href="/appointments/" className="mt-auto truncate rounded-sm text-[13px] font-bold hover:opacity-75 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
					{toAccept ? `${plural(toAccept, "programare", "programări")} de acceptat` : "Nicio programare de acceptat"}
				</Link>
			</div>
			<Stat
				place={0}
				label="Încasat azi"
				value={money(takings.total)}
				href="/reports/"
				detail={takings.total > 0 ? <Change change={takings.change} against={weekday} /> : takings.previous > 0 ? `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}: ${money(takings.previous)}` : "Nicio plată încă azi"}
			>
				<Bar parts={takings.methods.map((m) => ({ key: m.method, value: m.amount, color: METHOD_SHADE[m.method] }))} />
			</Stat>
			<Stat place={1} label="Mai poate intra azi" value={money(still.total)} detail={stillParts.join(" · ") || "Nimic de încasat azi"} {...stillTarget}>
				<Bar
					parts={[
						{ key: "cars", value: still.cars.amount, color: STATE.ok },
						{ key: "invoices", value: still.invoices.amount, color: STATE.wait },
					]}
				/>
			</Stat>
			<Stat place={2} label={`${fmtDate(today, "MMMM").replace(/^./, (letter) => letter.toUpperCase())} până azi`} value={money(month.value)} href="/reports/" detail={<Change change={month.change} against={previousMonth} />}>
				<MonthLine month={month} />
			</Stat>
			<Stat place={3} label="În atelier" value={plural(jobs.length, "mașină", "mașini")} detail={`${working} în lucru · ${waiting} așteaptă · ${ready} gata`} onClick={onShowShop}>
				<Bar
					parts={[
						{ key: "work", value: working, color: STATE.run },
						{ key: "wait", value: waiting, color: STATE.wait },
						{ key: "ready", value: ready, color: STATE.ok },
					]}
				/>
			</Stat>
		</header>
	);
}
