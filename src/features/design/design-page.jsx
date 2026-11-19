"use client";

import { MoreHorizontal, Pause, Phone, Play, Plus, Rows3, Search, Columns3 } from "lucide-react";
import { CarCover, CarHeader, CoverButton, CoverIconButton, MakeArt, MakeTile } from "@/components/ds/car";
import { KeyHint, KindLabel, PageTitle, SectionHeader, StatCard, StatusDot, useViewSwitch } from "@/components/ds/blocks";
import { Page } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { Button } from "@/components/ui/button";
import { AREA, MAKE_COLORS, STATE, makeCover, makeInk } from "@/lib/colors";

// The live reference of docs/DESIGN.md: every colour, text level and building block, in both themes.

const RULES = [
	["Culoarea vine din mașină", "Lucrarea, mașina și paginile lor iau culoarea mărcii. Restul e gri și alb."],
	["Fiecare zonă are o culoare", "Pe iconiță, pe eticheta tipului și pe placa ei din „Nou”. Niciodată ca fundal de pagină."],
	["Starea e un punct cu cuvinte", "Verde gata, galben așteaptă, roșu întârziat, gri închis. O culoare de zonă nu e o stare."],
	["Un singur buton plin", "Butonul negru e pasul următor (alb pe culoarea mașinii). Restul sunt butoane cu contur sau „…”."],
	["Patru trepte de text", "Titlu 26 → secțiune 15,5 cu „›” → card → rând 13,5. Sumele în cifre aliniate."],
	["Lucrarea pornită e mereu la vedere", "O bară închisă care plutește jos, pe orice pagină."],
];

const AREAS = [
	["Programare", AREA.programare],
	["Deviz", AREA.deviz],
	["Lucrare", AREA.lucrare],
	["Factură", AREA.factura],
	["Clienți", AREA.clienti],
	["Mașini", AREA.masini],
	["Catalog", AREA.catalog],
	["Rapoarte", AREA.rapoarte],
	["De contactat", AREA.contact],
	["Setări", AREA.setari],
];

const STATES = [
	["Gata, plătit, confirmat", STATE.ok],
	["Așteaptă, de încasat", STATE.wait],
	["Întârziat, restant", STATE.late],
	["Închis, ciornă", STATE.off],
	["În lucru acum", STATE.run],
];

function Swatch({ label, color, swatch }) {
	return (
		<span className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-[13px]">
			<span className="size-5 rounded-full" style={{ background: swatch ?? color }} aria-hidden />
			{label}
		</span>
	);
}

function Block({ title, subtitle, children }) {
	return (
		<section className="space-y-3">
			<SectionHeader title={title} subtitle={subtitle} />
			{children}
		</section>
	);
}

export function DesignPage() {
	const [view, viewSwitch] = useViewSwitch("garaj.design.view", [
		{ value: "a", label: "Etape", icon: Rows3 },
		{ value: "b", label: "Tablă", icon: Columns3 },
	]);
	return (
		<Page className="space-y-10">
			<PageTitle title="Limbajul de design" subtitle="Același pe site și pe iPhone · docs/DESIGN.md" />

			<Block title="Reguli">
				<ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
					{RULES.map(([title, text]) => (
						<li key={title} className="rounded-xl border bg-card px-3.5 py-3">
							<p className="text-[13.5px] font-semibold">{title}</p>
							<p className="mt-0.5 text-[13px] text-muted-foreground">{text}</p>
						</li>
					))}
				</ul>
			</Block>

			<Block title="Culori" subtitle="src/lib/colors.js">
				<div className="space-y-3">
					<p className="text-xs font-medium tracking-[0.07em] text-muted-foreground uppercase">Zonele</p>
					<div className="flex flex-wrap gap-2">{AREAS.map(([label, color]) => <Swatch key={label} label={label} color={color} />)}</div>
					<p className="pt-2 text-xs font-medium tracking-[0.07em] text-muted-foreground uppercase">Stările</p>
					<div className="flex flex-wrap gap-2">{STATES.map(([label, color]) => <Swatch key={label} label={label} color={color} />)}</div>
					<p className="pt-2 text-xs font-medium tracking-[0.07em] text-muted-foreground uppercase">Mărcile (coperta)</p>
					<div className="flex flex-wrap gap-2">
						{Object.keys(MAKE_COLORS).slice(0, 12).map((make) => (
							<Swatch key={make} label={make[0].toUpperCase() + make.slice(1)} swatch={makeCover(make)} />
						))}
					</div>
				</div>
			</Block>

			<Block title="Text">
				<div className="space-y-2 rounded-xl border bg-card p-4">
					<p className="text-[1.625rem] leading-tight font-semibold tracking-tight">Titlu de pagină · 26</p>
					<p className="flex items-center gap-1 text-[15.5px] font-semibold tracking-tight">Secțiune · 15,5 ›</p>
					<p className="text-[12.5px] text-muted-foreground">Rândul gri de sub secțiune · 12,5</p>
					<p className="text-[15px] font-semibold">Titlu de card · 15</p>
					<p className="text-[13.5px]">Rând · 13,5</p>
					<p className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">Eticheta de sus · 11</p>
					<p className="text-[22px] font-semibold tracking-tight tabular-nums">1.133,77 lei</p>
				</div>
			</Block>

			<Block title="Butoane și piese mici">
				<div className="flex flex-wrap items-center gap-2">
					<Button>
						<Play /> Pornește
					</Button>
					<Button variant="outline">Trimite</Button>
					<Button variant="outline" size="icon" aria-label="Sună">
						<Phone />
					</Button>
					<Button variant="outline" size="icon" aria-label="Mai multe">
						<MoreHorizontal />
					</Button>
					<Button size="sm">
						<Plus /> Nou
					</Button>
					<span className="inline-flex h-8 items-center gap-2 rounded-[7px] border bg-card px-2.5 text-[13px] text-muted-foreground">
						<Search className="size-3.5" aria-hidden /> Caută <KeyHint>⌘K</KeyHint>
					</span>
					{viewSwitch}
					<span className="text-xs text-muted-foreground">(comutatorul ține minte: {view === "a" ? "Etape" : "Tablă"})</span>
				</div>
				<div className="flex flex-wrap items-center gap-4">
					<StatusDot color={STATE.ok}>Plătită</StatusDot>
					<StatusDot color={STATE.wait}>De confirmat</StatusDot>
					<StatusDot color={STATE.late}>Restantă</StatusDot>
					<StatusDot color={STATE.off}>Ciornă</StatusDot>
					<KindLabel color={AREA.lucrare}>Lucrare</KindLabel>
					<KindLabel color={AREA.factura}>Factură</KindLabel>
					<Plate value="B123GRJ" size="sm" />
					<MakeTile make="Volkswagen" size={34} />
					<MakeTile make="Renault" size={34} />
					<MakeTile make="Lada" size={34} />
				</div>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard label="De încasat azi" value="4.850 lei" note="3 facturi" color={AREA.factura} />
					<StatCard label="Lucrări deschise" value="6" note="2 în lucru acum" color={AREA.lucrare} />
					<StatCard label="Programări azi" value="4" note="1 sosită" color={AREA.programare} />
					<StatCard label="Ore lucrate azi" value="9 h 40" note="Mihai 5 h · Vlad 4 h 40" color={AREA.rapoarte} />
				</div>
			</Block>

			<Block title="Coperți" subtitle="O lucrare în culoarea mașinii ei">
				<div className="no-scrollbar -mx-4 flex gap-3.5 overflow-x-auto px-4 md:mx-0 md:px-0">
					{[
						["Volkswagen", "B123GRJ", "În lucru", "LUC #214", "Volkswagen Golf 7", "Zgomot la frânare, față", "Discuri și plăcuțe uzate", "Pauză", Pause],
						["BMW", "IF07BMW", "Aprobat", "LUC #215", "BMW 320d", "Revizie 120.000 km", "4 operații · 6 piese", "Pornește", Play],
						["Renault", "B88CLI", "Gata de predat", "LUC #209", "Renault Clio 4", "Clima nu răcește", "Încărcat freon, testat", "Predă", Play],
					].map(([make, plate, status, code, car, title, detail, label, Icon]) => (
						<CarCover
							key={make}
							make={make}
							car={car}
							plate={plate}
							status={status}
							code={code}
							title={title}
							detail={detail}
							action={<CoverButton icon={Icon}>{label}</CoverButton>}
							menu={<CoverIconButton icon={MoreHorizontal} label="Mai multe" light={makeInk(make) !== "#ffffff"} />}
						/>
					))}
				</div>
				<div className="flex flex-wrap gap-3">
					<MakeArt make="Skoda" size={104} />
					<MakeArt make="Toyota" size={72} />
				</div>
			</Block>

			<Block title="Capul unei pagini de mașină">
				<div className="overflow-hidden rounded-xl border">
					<div className="px-4 pt-4 md:px-6 md:pt-6 lg:px-8 lg:pt-8">
						<CarHeader
							make="Volkswagen"
							plate="B123GRJ"
							status="În lucru"
							eyebrow="Lucrarea #214 · Volkswagen Golf 7"
							title="Zgomot la frânare, față"
							facts="Andrei Popescu · 0722 418 903 · 148.200 km · Mihai, Elevator 1"
							actions={
								<>
									<CoverButton icon={Pause}>Pauză</CoverButton>
									<CoverIconButton icon={Phone} label="Sună" />
									<CoverIconButton icon={MoreHorizontal} label="Mai multe" />
								</>
							}
						/>
					</div>
				</div>
			</Block>
		</Page>
	);
}
