"use client";

import { useState } from "react";
import { Bell, CalendarPlus, CarFront, Clock, Flag, Hourglass, PackageSearch, CircleCheck, Eye, Gauge, Hand, Plus, ReceiptText, Rows3, Search, Sparkles, Trash2, Wrench, Columns3, Grid3X3, CalendarRange, Grid2X2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { CardAction, CardButton, LargeCardsProvider, SectionCard } from "@/components/ds/card-section";
import { useConfirm } from "@/components/ds/confirm";
import { ContactActions } from "@/components/ds/contact";
import { Banner, DateTile, EmptyState, Initials, KeyValue, KeyValueGrid, Kbd, Meter, Money, Stat, Timeline } from "@/components/ds/data";
import { Field, FilterChips, MoneyInput, NumberInput, SearchInput, Segmented } from "@/components/ds/inputs";
import { ListRow } from "@/components/ds/list";
import { Page, PageHeader, Section } from "@/components/ds/page";
import { Plate } from "@/components/ds/plate";
import { Sheet } from "@/components/ds/sheet";
import { KindMark, StateDot, StateTag, StatusBadge, ToneBadge, ToneDot, ToneIcon, kindCard, kindText } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { computeTotals } from "@/domain/lines";
import { APPOINTMENT_STATUS, INVOICE_STATE, RECORD_KIND, WORK_ORDER_STATUS } from "@/lib/labels";
import { stateLook } from "@/lib/record-state";
import { cn } from "@/lib/utils";
import { TONE_NAMES, tone } from "@/lib/tones";
import { InvoiceDocument } from "@/features/invoices/invoice-document";
import { VisitCard } from "@/features/dashboard/visit-card";
import { VisitBar } from "@/components/ds/visit-bar";

const PRINCIPLES = [
	["Hârtie și cerneală", "Din factură: suprafețe neutre, ierarhie prin tipografie, sume aliniate. Totalul e cel mai vizibil lucru din pagină."],
	["Culoare cu sens", "Culoarea spune ce e (Programare, Deviz, Lucrare, Factură: cardul, titlul) și cum stă (un punct cu iconiță: roșu, galben, verde, gri). Aceleași peste tot."],
	["Se înțelege dintr-o privire", "Fiecare ecran răspunde la o întrebare în două secunde: cifra, starea, apoi detaliile."],
	["Degetul mare întâi", "Ținte de 44 px, foi de jos pe telefon, selectoare native pentru dată și oră."],
	["Rapid din start", "Doar animații CSS, schelete cu geometria finală, fără spinnere pentru date locale."],
];

const SURFACES = [
	["background", "bg-background", "Pânza aplicației"],
	["card", "bg-card", "Foi, carduri, hârtia"],
	["muted", "bg-muted", "Fundaluri discrete"],
	["border", "bg-border", "Linii fine"],
	["foreground", "bg-foreground", "Text principal"],
	["muted-foreground", "bg-muted-foreground", "Text secundar"],
	["subtle-foreground", "bg-subtle-foreground", "Meta, niciodată esențial"],
	["primary", "bg-primary", "Acțiunea principală"],
	["brand", "bg-brand", "Logo, navigare activă, „acum”"],
	["destructive", "bg-destructive", "Doar în confirmări"],
];

const TONE_MEANING = {
	neutral: "Stare: ciornă, finalizat, predat, anulat",
	blue: "Tip: Factură",
	teal: "Tip: Programare",
	purple: "Tip: Deviz",
	orange: "Tip: Lucrare (și starea ei „În lucru”)",
	yellow: "Stare: de confirmat, de aprobat, de plată, așteaptă piese",
	green: "Stare: confirmat, aprobat, gata, plătit",
	red: "Stare: întârziat, nu a sosit, restant, neprezentat",
	pink: "Tip: Recenzie",
};

/** Examples of states as their dots draw them (docs/RECORD-COLORS.md). */
// The visit bar in two moments of a visit: a booking confirmed, nothing made after it; a job under way, not invoiced.
const BAR_EXAMPLES = [
	[
		"O programare confirmată, fără lucrare",
		[
			{ key: "appointment", exists: true, current: true, arcs: ["done", "now", "ahead", "ahead"] },
			{ key: "estimate", exists: false, arcs: ["ahead", "ahead"] },
			{ key: "job", exists: false, arcs: ["ahead", "ahead", "ahead"] },
			{ key: "invoice", exists: false, faint: true, arcs: ["ahead", "ahead", "ahead"] },
			{ key: "review", exists: false, faint: true, arcs: ["ahead", "ahead", "ahead"] },
		],
	],
	[
		"O lucrare în lucru, încă nefacturată (devizul sărit)",
		[
			{ key: "appointment", exists: true, arcs: ["done", "done", "now", "ahead"] },
			{ key: "estimate", exists: true, arcs: ["skipped", "skipped"] },
			{ key: "job", exists: true, current: true, arcs: ["now", "ahead", "ahead"] },
			{ key: "invoice", exists: false, arcs: ["ahead", "ahead", "ahead"] },
			{ key: "review", exists: false, arcs: ["ahead", "ahead", "ahead"] },
		],
	],
];

// A job card's extra lines, as card-extras.js words them (the owner's picks, 7 Nov 2026).
const SAMPLE_EXTRAS = [
	{ key: "waits", icon: Hourglass, text: "Andrei lucrează la ea", tone: "wait" },
	{ key: "since", icon: Clock, text: "În lucru de 5 h" },
	{ key: "promise", icon: Flag, text: "Promisă azi la 17:00 · mai sunt 2 h", tone: "warning" },
];

// The car every card example on this page shows (the demo's own).
const SAMPLE_CAR = {
	vehicle: { make: "Opel" },
	name: "Opel Astra",
	plate: "B 667 LTV",
	subject: "Verificare pre-ITP",
	customer: "Media Vision SRL",
	mechanic: { name: "Andrei Popa", color: "blue" },
	anchor: "azi 13:30–14:30",
	timing: { text: "în 2 h 10 min", mark: null },
	gross: null,
};

const STATE_EXAMPLES = [
	["appointment", { key: "to_confirm", signal: "warning", text: "De confirmat" }],
	["appointment", { key: "late", signal: "danger", text: "Întârzie 25 min" }],
	["estimate", { key: "awaiting_approval", signal: "warning", text: "De aprobat" }],
	["estimate", { key: "approved", signal: "success", text: "Aprobat" }],
	["job", { key: "in_progress", signal: "active", text: "În lucru" }],
	["job", { key: "parts_late", signal: "danger", text: "Piese de 4 zile" }],
	["invoice", { key: "overdue", signal: "danger", text: "Restantă de 1 zi" }],
	["invoice", { key: "paid", signal: "success", text: "Plătită" }],
];

const TYPE = [
	["text-display", "Display 32/36", "12.480 lei", "text-display"],
	["text-title", "Title 24/32", "Factura GRJ 0842", "text-title"],
	["text-heading", "Heading 16/24", "Programul de azi", "text-heading"],
	["text-sm", "Body 14/20", "Mașina a fost primită la 08:30.", "text-sm"],
	["text-xs", "Caption 12/16", "acum 3 zile · Andrei Popescu", "text-xs text-muted-foreground"],
	["overline", "Overline 11/16", "Operațiuni", "text-2xs font-medium tracking-wider text-muted-foreground uppercase"],
	["font-mono", "Mono 13/20", "UU1DJF00567890123", "font-mono text-[13px]"],
];

const SAMPLE_LINES = [
	{ id: "1", kind: "labor", description: "Revizie completă (ulei și filtre)", qty: 1.5, unit: "h", unitPrice: 18000, vatRate: 21, discountPct: 0 },
	{ id: "2", kind: "part", description: "Ulei motor 5W-30 Castrol", qty: 4.5, unit: "l", unitPrice: 5700, vatRate: 21, discountPct: 0 },
	{ id: "3", kind: "part", description: "Filtru ulei Mann-Filter", qty: 1, unit: "buc", unitPrice: 3800, vatRate: 21, discountPct: 0 },
];

const SAMPLE_SNAPSHOT = {
	seller: { name: "Garaj Auto Pro SRL", brand: "Garaj Auto Pro", cui: "RO12345674", regCom: "J40/1234/2019", address: "Str. Mecanicilor 12, București", phone: "0722 555 010", email: "", iban: "RO49AAAA1B31007593840000", bank: "Banca Exemplu", vatPayer: true },
	buyer: { type: "person", name: "Andrei Popescu", address: "Bd. Unirii 12, București", phone: "0722 123 456" },
	vehicle: { plate: "B123ABC", make: "Dacia", model: "Logan", vin: "UU1DJF00567890123", mileage: 123456 },
};

function Swatch({ className, name, hint }) {
	return (
		<div className="flex items-center gap-3">
			<span className={`size-10 shrink-0 rounded-lg border ${className}`} />
			<div className="min-w-0">
				<p className="font-mono text-xs">{name}</p>
				<p className="truncate text-xs text-muted-foreground">{hint}</p>
			</div>
		</div>
	);
}

export function DesignPage() {
	const confirm = useConfirm();
	const [sheet, setSheet] = useState(false);
	const [view, setView] = useState("day");
	const [chip, setChip] = useState("all");
	const [money, setMoney] = useState(123456);
	const [qty, setQty] = useState(1.5);
	const [query, setQuery] = useState("");
	const totals = computeTotals(SAMPLE_LINES);

	return (
		<Page width="wide">
			<PageHeader
				title="Design system"
				description="Limbajul vizual Garaj — distilat din factură (hârtie și cerneală) și din calendarul de programări (culoare cu sens). Sursa: docs/DESIGN-SYSTEM.md."
			/>

			<div className="space-y-12">
				<Section title="Principii">
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
						{PRINCIPLES.map(([title, body], i) => (
							<Card key={title}>
								<CardContent>
									<p className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">0{i + 1}</p>
									<p className="mt-1 font-semibold">{title}</p>
									<p className="mt-1 text-sm text-muted-foreground">{body}</p>
								</CardContent>
							</Card>
						))}
					</div>
				</Section>

				<Section title="Culori: suprafețe și text" description="Neutre. Culoarea e rezervată pentru sens și un singur accent de brand.">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
						{SURFACES.map(([name, cls, hint]) => (
							<Swatch key={name} className={cls} name={name} hint={hint} />
						))}
					</div>
				</Section>

				<Section title="Tip și stare" description="Fiecare tip de înregistrare are culoarea lui (cardul, titlul paginii și al foii, calendarul); starea e un punct cu o iconiță, în roșu, galben, verde sau gri.">
					<div className="grid gap-4 lg:grid-cols-4">
						{Object.keys(RECORD_KIND)
							.filter((kind) => STATE_EXAMPLES.some(([k]) => k === kind))
							.map((kind) => (
							<div key={kind} className="space-y-3">
								<div className="flex items-center gap-2.5">
									<KindMark kind={kind} size="sm" />
									<span className={cn("font-semibold", kindText(kind))}>{RECORD_KIND[kind].plural}</span>
								</div>
								<div className={cn("space-y-2 rounded-lg border p-3", kindCard(kind))}>
									{STATE_EXAMPLES.filter(([k]) => k === kind).map(([, signal]) => (
										<div key={signal.key} className="flex items-center justify-between gap-2">
											<StateTag state={stateLook(kind, signal)} size="sm" />
											<StateDot state={stateLook(kind, signal)} size="sm" ring tip />
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</Section>

				<Section title="Carduri" description="Trei mărimi, alese de proprietar (7 nov. 2026): foarte mici în calendar (conturate în culoarea lor), mici în liste (240 px) și normale pe Azi (320 px). Cardurile sunt albe; culoarea tipului e pe primul rând.">
					<div className="grid gap-6 lg:grid-cols-[14rem_16rem_1fr]">
						<div className="space-y-2">
							<p className="text-sm font-medium">Foarte mici · calendar</p>
							<div className="relative h-40 rounded-lg border bg-background p-2">
								<div className={cn("absolute inset-x-2 top-2 flex h-[68px] flex-col overflow-hidden rounded-md border px-1.5 py-[3px] text-2xs leading-[15px]", tone("teal").line)}>
									<span className={cn("font-semibold tabular-nums", tone("teal").text)}>10:00–11:30</span>
									<span className="truncate text-xs font-semibold">{SAMPLE_CAR.name}</span>
									<span className="truncate">{SAMPLE_CAR.customer}</span>
									<span className="font-mono tracking-wide">{SAMPLE_CAR.plate}</span>
								</div>
								<div className={cn("absolute inset-x-2 top-[84px] flex h-[22px] items-center gap-1 overflow-hidden rounded-md border border-dashed px-1.5 text-2xs", tone("teal").line)}>
									<span className={cn("font-semibold tabular-nums", tone("teal").text)}>11:45</span>
									<span className="truncate font-semibold">Renault Clio</span>
								</div>
								<div className="absolute inset-x-2 bottom-2 flex h-[18px] items-center gap-1 rounded px-1 text-2xs">
									<span className={cn("size-1.5 rounded-full", tone("teal").solid)} />
									<span className={cn("font-semibold tabular-nums", tone("teal").text)}>09:30</span>
									<span className="truncate font-semibold">Dacia Logan</span>
								</div>
							</div>
							<p className="text-xs text-muted-foreground">Albe, conturate în culoarea lor, ora colorată; o programare neconfirmată are conturul punctat. În Lună doar un punct.</p>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Mici · 240 px</p>
							<ul className="flex">
								<SectionCard>
									<CardButton look={kindCard("estimate")} aria-label="Deviz, exemplu">
										<VisitCard facts={{ ...SAMPLE_CAR, kind: "estimate", number: "#1883", timing: { text: "deviz de azi", mark: null }, anchor: "primit azi 08:30", gross: 91500, state: stateLook("estimate", STATE_EXAMPLES[2][1]) }} />
									</CardButton>
								</SectionCard>
							</ul>
						</div>
						<div className="space-y-2">
							<p className="text-sm font-medium">Normale · Azi (cu înregistrările de dinainte în spate)</p>
							<LargeCardsProvider value>
								<ul className="flex flex-wrap gap-4">
									<SectionCard
										reserve={2}
										behind={[{ key: "appointment", skipped: false }, { key: "estimate", skipped: false }]}
										actions={
											<>
												<CardAction primary icon={CircleCheck} label="Gata" onClick={() => toast("Exemplu")} />
												<CardAction icon={PackageSearch} label="Așteaptă piese" onClick={() => toast("Exemplu")} />
											</>
										}
									>
										<CardButton look={kindCard("job")} aria-label="Lucrare, exemplu">
											<VisitCard
												facts={{ ...SAMPLE_CAR, kind: "job", number: "#1883", timing: { text: "de 1 zi în service", mark: null }, anchor: "primit ieri 09:30", gross: 91500, state: stateLook("job", STATE_EXAMPLES[4][1]) }}
												extras={SAMPLE_EXTRAS}
												actions
											/>
										</CardButton>
									</SectionCard>
								</ul>
							</LargeCardsProvider>
						</div>
					</div>
				</Section>

				<Section title="Bara vizitei" description="Capul foii fiecărei înregistrări a unei vizite: fiecare în culoarea lui, un inel pentru cât a avansat și o linie sub el (punctată cât nu există). Apăsarea duce la înregistrare sau o face.">
					<div className="max-w-2xl space-y-6 rounded-xl border bg-card p-5">
						{BAR_EXAMPLES.map(([caption, sections]) => (
							<div key={caption} className="space-y-2">
								<p className="text-xs text-muted-foreground">{caption}</p>
								<VisitBar sections={sections.map((s) => ({ ...s, ...RECORD_KIND[s.key], label: RECORD_KIND[s.key].label, title: RECORD_KIND[s.key].label }))} onTap={() => toast("Exemplu")} />
							</div>
						))}
					</div>
				</Section>

				<Section title="Tonuri" description="Culorile tipurilor și ale stărilor, aceleași în chip, card, calendar, cronologie.">
					<div className="overflow-hidden rounded-xl border bg-card">
						{TONE_NAMES.map((t) => (
							<div key={t} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0">
								<span className="w-20 font-mono text-xs">{t}</span>
								<ToneDot tone={t} />
								<ToneBadge tone={t}>Chip</ToneBadge>
								<span className={`rounded-md border px-2 py-1 text-xs font-semibold ${tone(t).line}`}>Bloc calendar</span>
								<ToneIcon tone={t} icon={Wrench} size="sm" />
								<span className={`h-1.5 w-16 rounded-full ${tone(t).bar}`} />
								<span className="text-sm text-muted-foreground">{TONE_MEANING[t]}</span>
							</div>
						))}
					</div>
					<div className="grid gap-4 lg:grid-cols-3">
						{[
							["Lucrări", WORK_ORDER_STATUS],
							["Facturi", INVOICE_STATE],
							["Programări", APPOINTMENT_STATUS],
						].map(([title, map]) => (
							<Card key={title}>
								<CardHeader title={title} />
								<CardContent className="flex flex-wrap gap-2">
									{Object.keys(map).map((key) => (
										<StatusBadge key={key} map={map} value={key} />
									))}
								</CardContent>
							</Card>
						))}
					</div>
				</Section>

				<Section title="Tipografie" description="Geist Sans și Geist Mono. Cifre tabelare în coloane; proporționale la cifrele mari.">
					<div className="divide-y rounded-xl border bg-card">
						{TYPE.map(([token, spec, sample, cls]) => (
							<div key={token} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3">
								<span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{spec}</span>
								<span className={cls}>{sample}</span>
							</div>
						))}
					</div>
				</Section>

				<Section title="Rază, elevație, spațiere" description="Grilă de 4 px. Carduri plate cu margine; umbre doar pentru straturi care plutesc.">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<div className="rounded-xl border bg-card p-4 text-sm">e0 · card cu margine</div>
						<div className="rounded-md border bg-card p-4 text-sm shadow-xs">e1 · control</div>
						<div className="paper rounded-xl p-4 text-sm shadow-paper ring-1 ring-black/10">e2 · hârtie (document)</div>
						<div className="rounded-2xl border bg-popover p-4 text-sm shadow-lg">e3 · meniu, foaie</div>
					</div>
					<div className="flex flex-wrap items-end gap-4">
						{[
							["sm", "rounded-sm"],
							["md", "rounded-md"],
							["lg", "rounded-lg"],
							["xl", "rounded-xl"],
							["2xl", "rounded-2xl"],
						].map(([name, cls]) => (
							<div key={name} className="text-center">
								<div className={`size-14 border bg-muted ${cls}`} />
								<p className="mt-1 font-mono text-xs text-muted-foreground">{name}</p>
							</div>
						))}
					</div>
				</Section>

				<Section title="Butoane">
					<Card>
						<CardContent className="space-y-4">
							<div className="flex flex-wrap gap-2">
								<Button>Principal</Button>
								<Button variant="brand">
									<Plus /> Nou
								</Button>
								<Button variant="outline">Secundar</Button>
								<Button variant="ghost">Discret</Button>
								<Button variant="destructive">
									<Trash2 /> Șterge
								</Button>
								<Button variant="link">Link</Button>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button size="sm">Mic 32</Button>
								<Button>Implicit 36</Button>
								<Button size="lg">Mare 40</Button>
								<Button size="touch">Tactil 44</Button>
								<Button size="icon" variant="outline" aria-label="Caută">
									<Search />
								</Button>
								<Button size="icon-touch" variant="outline" aria-label="Notificări">
									<Bell />
								</Button>
							</div>
							<p className="text-sm text-muted-foreground">Un singur buton principal (negru) pe ecran. Portocaliul de brand doar pentru „Nou”.</p>
						</CardContent>
					</Card>
				</Section>

				<Section title="Câmpuri">
					<Card>
						<CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<Field label="Text" hint="16 px pe telefon — fără zoom pe iOS">
								{(id) => <Input id={id} placeholder="Andrei Popescu" />}
							</Field>
							<Field label="Sumă">{(id) => <MoneyInput id={id} value={money} onValueChange={setMoney} />}</Field>
							<Field label="Cantitate">{(id) => <NumberInput id={id} value={qty} onValueChange={setQty} suffix="h" />}</Field>
							<Field label="Căutare">
								<SearchInput value={query} onChange={setQuery} placeholder="Nr. înmatriculare…" />
							</Field>
							<Field label="Selectare">
								{(id) => (
									<Select defaultValue="card">
										<SelectTrigger id={id} className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="cash">Numerar</SelectItem>
											<SelectItem value="card">Card</SelectItem>
											<SelectItem value="transfer">Transfer bancar</SelectItem>
										</SelectContent>
									</Select>
								)}
							</Field>
							<Field label="Dată (nativ)">{(id) => <Input id={id} type="date" defaultValue="2026-09-30" />}</Field>
							<Field label="Eroare" error="Suma depășește restul de plată (320,00 lei).">
								{(id) => <Input id={id} aria-invalid defaultValue="500" />}
							</Field>
							<Field label="Text lung">{(id) => <Textarea id={id} placeholder="Ce reclamă clientul" />}</Field>
							<label className="flex items-center justify-between gap-4 rounded-lg border p-3">
								<span className="text-sm font-medium">Comutator</span>
								<Switch defaultChecked />
							</label>
						</CardContent>
					</Card>
				</Section>

				<Section title="Navigare în pagină" description="Segmented vine din tab-urile calendarului: opțiunile inactive arată doar iconița.">
					<Card>
						<CardContent className="space-y-4">
							<Segmented
								value={view}
								onValueChange={setView}
								collapse
								options={[
									{ value: "agenda", label: "Agendă", icon: CalendarRange },
									{ value: "day", label: "Zi", icon: Rows3 },
									{ value: "week", label: "Săptămână", icon: Columns3 },
									{ value: "month", label: "Lună", icon: Grid3X3 },
									{ value: "year", label: "An", icon: Grid2X2 },
								]}
							/>
							<FilterChips
								value={chip}
								onChange={setChip}
								options={[
									{ value: "all", label: "Toate", count: 837 },
									{ value: "unpaid", label: "De încasat", tone: "blue", count: 21 },
									{ value: "overdue", label: "Restante", tone: "red", count: 4 },
								]}
							/>
						</CardContent>
					</Card>
				</Section>

				<Section title="Piese semnătură" description="Elemente de domeniu recognoscibile instant.">
					<div className="grid gap-4 lg:grid-cols-3">
						<Card>
							<CardHeader title="Număr de înmatriculare" />
							<CardContent className="flex flex-wrap items-end gap-3">
								<Plate value="B123ABC" size="sm" />
								<Plate value="CJ07XYZ" />
								<Plate value="IF45GRJ" size="lg" />
							</CardContent>
						</Card>
						<Card>
							<CardHeader title="Plăcuța de dată" description="Din butonul „Azi” al calendarului" />
							<CardContent className="flex items-end gap-3">
								<DateTile date="2026-09-30" size="sm" />
								<DateTile date="2026-10-14" />
								<DateTile date="2026-12-24" size="lg" tone="red" />
							</CardContent>
						</Card>
						<Card>
							<CardHeader title="Persoane" />
							<CardContent className="flex items-center gap-2">
								<Initials name="Andrei Popescu" tone="blue" size="sm" />
								<Initials name="Mihai Ionescu" tone="green" />
								<Initials name="Ionuț Dumitru" tone="purple" size="lg" />
								<Kbd>⌘K</Kbd>
							</CardContent>
						</Card>
					</div>
				</Section>

				<Section title="Date și cifre">
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						<Stat label="În service acum" value="13" hint="3 mașini gata" icon={CarFront} tone="orange" />
						<Stat label="Încasat azi" value={<Money value={482300} decimals={0} />} icon={ReceiptText} tone="green" />
						<Stat label="Restante" value={<Money value={441200} decimals={0} />} hint="4 facturi" icon={Hand} tone="red" />
						<Stat label="Kilometraj" value="123.456 km" icon={Gauge} />
					</div>
					<div className="grid gap-4 lg:grid-cols-2">
						<Card>
							<CardHeader title="Rânduri de listă" description="60 px pe telefon, 48 px pe desktop" />
							<CardContent className="px-0 md:px-0">
								<ul className="divide-y border-y">
									<li>
										<ListRow onClick={() => toast("Rând apăsat")}>
											<Plate value="B557BBD" size="sm" />
											<span className="flex-1 text-sm font-medium">Kia Ceed · Andreea Stoica</span>
											<StatusBadge map={WORK_ORDER_STATUS} value="in_progress" size="sm" />
										</ListRow>
									</li>
									<li>
										<ListRow onClick={() => toast("Rând apăsat")}>
											<span className="w-24 font-mono text-xs font-medium">GRJ 0835</span>
											<span className="flex-1 text-sm">Radu Florea</span>
											<Money value={210238} className="text-sm font-semibold" />
										</ListRow>
									</li>
								</ul>
							</CardContent>
						</Card>
						<Card>
							<CardHeader title="Detalii și progres" />
							<CardContent className="space-y-4">
								<KeyValueGrid>
									<KeyValue label="Kilometraj">123.456 km</KeyValue>
									<KeyValue label="VIN" mono>
										UU1DJF00567890123
									</KeyValue>
									<KeyValue label="Combustibil">1/2</KeyValue>
								</KeyValueGrid>
								<Meter value={5} max={8} tone="yellow" label="Încărcare" />
							</CardContent>
						</Card>
					</div>
				</Section>

				<Section title="Feedback">
					<div className="grid gap-4 lg:grid-cols-2">
						<div className="space-y-3">
							<Banner tone="yellow" icon={Sparkles} title="Ești în modul demo">
								Un service fictiv cu un an de istoric.
							</Banner>
							<Banner tone="green" icon={CircleCheck} title="Factura a fost emisă" />
							<div className="flex flex-wrap gap-2">
								<Button variant="outline" onClick={() => toast.success("Plata a fost înregistrată.")}>
									Toast
								</Button>
								<Button variant="outline" onClick={() => setSheet(true)}>
									<Eye /> Foaie
								</Button>
								<Button
									variant="outline"
									onClick={async () => {
										const ok = await confirm({ title: "Stornezi factura GRJ 0835?", description: "Se emite o factură de stornare cu valori negative.", confirmLabel: "Stornează", destructive: true });
										toast(ok ? "Confirmat" : "Anulat");
									}}
								>
									Confirmare
								</Button>
							</div>
							<ContactActions phone="0722123456" message="Bună ziua! Mașina este gata." />
						</div>
						<Card>
							<CardHeader title="Cronologie" />
							<CardContent>
								<Timeline
									items={[
										{ id: "1", icon: Wrench, tone: "orange", title: "În lucru", meta: "azi, 10:12" },
										{ id: "2", icon: CircleCheck, tone: "purple", title: "Deviz aprobat pe WhatsApp", meta: "azi, 09:40" },
										{ id: "3", icon: CalendarPlus, tone: "blue", title: "Mașină primită", meta: "azi, 08:31", content: "123.456 km · rezervor 1/2" },
									]}
								/>
							</CardContent>
						</Card>
					</div>
					<EmptyState icon={ReceiptText} title="Nicio factură încă" description="Emite prima factură dintr-o lucrare sau de la zero." action={<Button>Factură nouă</Button>} />
				</Section>

				<Section title="Documentul" description="Hârtia: proporții A4, mereu albă, singurul lucru care se tipărește.">
					<InvoiceDocument invoice={{ series: "GRJ", number: 842, issueDate: "2026-09-30", dueDate: "2026-10-14", lines: SAMPLE_LINES, notes: "Garanție manoperă 3 luni." }} snapshot={SAMPLE_SNAPSHOT} totals={totals} />
				</Section>
			</div>

			<Sheet
				open={sheet}
				onOpenChange={setSheet}
				title="Foaie"
				description="Jos pe telefon, panou lateral pe desktop."
				footer={
					<>
						<Button variant="outline" onClick={() => setSheet(false)} className="max-md:h-11">
							Renunță
						</Button>
						<Button onClick={() => setSheet(false)} className="max-md:h-11">
							Salvează
						</Button>
					</>
				}
			>
				<div className="grid gap-4">
					<Field label="Nume">{(id) => <Input id={id} />}</Field>
					<Field label="Telefon">{(id) => <Input id={id} type="tel" inputMode="tel" />}</Field>
				</div>
			</Sheet>
		</Page>
	);
}
