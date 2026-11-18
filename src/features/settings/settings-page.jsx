"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Building2, CalendarClock, ChevronRight, Database, Download, FlaskConical, ImagePlus, Monitor, PanelRight, FileText, Moon, Palette, Percent, Plus, ReceiptText, RotateCcw, Star, Sun, Upload, Users, Warehouse } from "lucide-react";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { useConfirm } from "@/components/ds/confirm";
import { Banner, Initials } from "@/components/ds/data";
import { Field, MoneyInput, NumberInput, Segmented } from "@/components/ds/inputs";
import { ListRow } from "@/components/ds/list";
import { Page } from "@/components/ds/page";
import { PageTitle, useViewSwitch } from "@/components/ds/blocks";
import { AREA } from "@/lib/colors";
import { REST_LOOKS, REST_LOOK_KEY } from "@/features/common/rest-look";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { GLASS_KEY, GLASS_VALUES } from "@/components/ds/glass";
import { Textarea } from "@/components/ui/textarea";
import { isValidCUI, isValidIBAN } from "@/domain/customer";
import { todayISO } from "@/domain/dates";
import { DETAIL_MODES, DETAIL_MODE_KEY } from "@/lib/detail-mode";
import { useDraft, useHydrated, useLocalPreference, useMediaQuery } from "@/lib/hooks";
import { PHONE } from "@/components/ds/nav-bar";
import { PhoneSettings } from "@/features/phone/phone-settings";
import { BAY_KINDS, STAFF_ROLES } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { addStressInvoices, exportBackup, importBackup, resetToDemo, setNextInvoiceNumber, startFresh, updateSettings } from "@/lib/store/actions";
import { useCollection, useIsReady, useSettings, useStoreValue } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";

const DAYS = [
	[1, "Lu"],
	[2, "Ma"],
	[3, "Mi"],
	[4, "Jo"],
	[5, "Vi"],
	[6, "Sâ"],
	[0, "Du"],
];

/** Downscales an image to a ≤256 px PNG data URL (kept in the settings record). */
function readLogo(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Imaginea nu a putut fi citită."));
		reader.onload = () => {
			const img = new Image();
			img.onerror = () => reject(new Error("Format de imagine nesuportat."));
			img.onload = () => {
				const scale = Math.min(1, 256 / Math.max(img.width, img.height));
				const canvas = document.createElement("canvas");
				canvas.width = Math.round(img.width * scale);
				canvas.height = Math.round(img.height * scale);
				canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
				resolve(canvas.toDataURL("image/png"));
			};
			img.src = reader.result;
		};
		reader.readAsDataURL(file);
	});
}

async function saveFile(text, filename) {
	const file = new File([text], filename, { type: "application/json" });
	if (navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title: filename });
			return "shared";
		} catch (error) {
			if (error?.name === "AbortError") return "cancelled";
		}
	}
	const url = URL.createObjectURL(file);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
	return "downloaded";
}

// The sections, with their icon and colour (docs/DESIGN.md §4: settings as the iPhone's grouped list, or tabs on the left).
const SECTIONS = [
	{ id: "service", title: "Service", icon: Building2, color: AREA.lucrare },
	{ id: "facturare", title: "Facturare", icon: ReceiptText, color: AREA.factura },
	{ id: "tarife", title: "Tarife", icon: Percent, color: AREA.catalog },
	{ id: "recenzii", title: "Recenzii", icon: Star, color: "#e26a8d" },
	{ id: "program", title: "Program", icon: CalendarClock, color: AREA.programare },
	{ id: "echipa", title: "Echipă", icon: Users, color: AREA.clienti },
	{ id: "posturi", title: "Posturi de lucru", icon: Warehouse, color: AREA.masini },
	{ id: "aspect", title: "Aspect", icon: Palette, color: AREA.setari },
	{ id: "deschidere", title: "Deschiderea detaliilor", icon: PanelRight, color: AREA.setari, wide: true },
	{ id: "date", title: "Date", icon: Database, color: AREA.setari },
];

function Tile({ icon: Icon, color, size = 28 }) {
	return (
		<span aria-hidden className="flex shrink-0 items-center justify-center rounded-[7px] text-white" style={{ width: size, height: size, background: color }}>
			<Icon className="size-4" />
		</span>
	);
}

function Section({ id, icon, title, description, className, children }) {
	const color = SECTIONS.find((section) => section.id === id)?.color ?? AREA.setari;
	return (
		<section id={id} aria-label={title} className={cn("scroll-mt-24 space-y-2.5", className)}>
			<div className="flex items-center gap-2.5 px-1">
				<Tile icon={icon} color={color} />
				<div className="min-w-0">
					<h2 className="text-[15.5px] font-semibold tracking-tight">{title}</h2>
					{description && <p className="text-[12.5px] text-muted-foreground">{description}</p>}
				</div>
			</div>
			<div className="rounded-xl border bg-card p-4 md:p-5">{children}</div>
		</section>
	);
}

/** "Listă": the sections as the iPhone's grouped list, each row jumping to its section. */
function SectionIndex() {
	return (
		<nav aria-label="Secțiuni" className="overflow-hidden rounded-xl border bg-card">
			<ul className="divide-y">
				{SECTIONS.map((section) => (
					<li key={section.id} className={cn(section.wide && "max-md:hidden")}>
						<a href={`#${section.id}`} className="flex min-h-11 items-center gap-3 px-3.5 text-[14px] hover:bg-accent/40">
							<Tile icon={section.icon} color={section.color} />
							<span className="flex-1">{section.title}</span>
							<ChevronRight className="size-4 text-muted-foreground" aria-hidden />
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}

/** "File": the sections as tabs on the left, staying in view. */
function SectionTabs() {
	const [here, setHere] = useState(SECTIONS[0].id);
	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				const seen = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (seen) setHere(seen.target.id);
			},
			{ rootMargin: "-20% 0px -70% 0px" },
		);
		for (const section of SECTIONS) {
			const element = document.getElementById(section.id);
			if (element) observer.observe(element);
		}
		return () => observer.disconnect();
	}, []);
	return (
		<nav aria-label="Secțiuni" className="flex gap-1 overflow-x-auto md:sticky md:top-6 md:flex-col md:self-start">
			{SECTIONS.map((section) => (
				<a
					key={section.id}
					href={`#${section.id}`}
					aria-current={here === section.id ? "true" : undefined}
					className={cn(
						"flex h-8 shrink-0 items-center gap-2.5 rounded-[7px] px-2 text-[13.5px] pointer-coarse:h-10",
						section.wide && "max-md:hidden",
						here === section.id ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
					)}
				>
					<Tile icon={section.icon} color={section.color} size={22} />
					{section.title}
				</a>
			))}
		</nav>
	);
}

export function SettingsPage() {
	const ready = useIsReady();
	const settings = useSettings();
	if (!ready) return <ListPageSkeleton />;
	return <Settings key="settings" settings={settings} />;
}

function Settings({ settings }) {
	const confirm = useConfirm();
	const [look, lookSwitch] = useViewSwitch(REST_LOOK_KEY, REST_LOOKS);
	const { theme, setTheme } = useTheme();
	const [detailMode, setDetailMode] = useLocalPreference(DETAIL_MODE_KEY, "sheet", DETAIL_MODES);
	const [glass, setGlass] = useLocalPreference(GLASS_KEY, "on", GLASS_VALUES);
	const persistence = useStoreValue("persistence");
	const demo = useStoreValue("demo");
	const counters = useStoreValue("counters");
	const staff = Object.values(useCollection("staff")).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const bays = Object.values(useCollection("bays")).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const [draft, update] = useDraft(settings, (next) => updateSettings(next), 500);
	const [nextNumber, setNextNumber] = useState(null);
	const [storage, setStorage] = useState(null);
	const [busy, setBusy] = useState(false);
	const fileRef = useRef(null);
	const logoRef = useRef(null);
	const mounted = useHydrated();
	const phone = useMediaQuery(PHONE);

	useEffect(() => {
		navigator.storage?.estimate?.().then(async (estimate) => {
			const persisted = (await navigator.storage.persisted?.()) ?? false;
			setStorage({ usage: estimate.usage ?? 0, persisted });
		});
	}, []);

	const shop = draft.shop;
	const setShop = (patch) => update((d) => ({ ...d, shop: { ...d.shop, ...patch } }));
	const setInvoicing = (patch) => update((d) => ({ ...d, invoicing: { ...d.invoicing, ...patch } }));
	const setHours = (patch) => update((d) => ({ ...d, hours: { ...d.hours, ...patch } }));
	const series = draft.invoicing.series;
	const counterValue = counters.invoices?.[series] ?? draft.invoicing.startNumber ?? 1;

	const saveCounter = async () => {
		try {
			await setNextInvoiceNumber(series, nextNumber);
			toast.success(`Următoarea factură: ${series} ${String(nextNumber).padStart(4, "0")}`);
			setNextNumber(null);
		} catch (error) {
			toast.error(error.message);
		}
	};

	const onLogo = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		try {
			setShop({ logo: await readLogo(file) });
			toast.success("Logo actualizat.");
		} catch (error) {
			toast.error(error.message);
		}
	};

	const doExport = async () => {
		const result = await saveFile(exportBackup(), `garaj-backup-${todayISO()}.json`);
		if (result !== "cancelled") toast.success("Backup creat. Păstrează fișierul într-un loc sigur.");
	};

	const doImport = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		const ok = await confirm({
			title: "Restaurezi backup-ul?",
			description: "Toate datele de pe acest dispozitiv vor fi înlocuite cu cele din fișier.",
			confirmLabel: "Restaurează",
			destructive: true,
		});
		if (!ok) return;
		try {
			await importBackup(await file.text());
			toast.success("Datele au fost restaurate.");
		} catch (error) {
			toast.error(error.message);
		}
	};

	const doFresh = async () => {
		const ok = await confirm({
			title: demo ? "Începi cu datele tale?" : "Ștergi toate datele?",
			description: demo
				? "Datele demo dispar. Rămâi cu un service gol, gata de lucru. Numerotarea facturilor pornește de la 1."
				: "Clienții, mașinile, lucrările și facturile de pe acest dispozitiv vor fi șterse. Profilul service-ului rămâne. Fă întâi un backup.",
			confirmLabel: demo ? "Începe" : "Șterge tot",
			destructive: true,
		});
		if (!ok) return;
		await startFresh();
		toast.success("Gata. Începe prin a completa profilul service-ului.");
	};

	const doDemo = async () => {
		if (!(await confirm({ title: "Reîncarci datele demo?", description: "Toate datele actuale sunt înlocuite de service-ul demo.", confirmLabel: "Reîncarcă", destructive: true }))) return;
		await resetToDemo();
		toast.success("Date demo reîncărcate.");
	};

	const doStress = async () => {
		setBusy(true);
		const t0 = performance.now();
		try {
			const n = await addStressInvoices(5000);
			toast.success(`${n} facturi de test adăugate în ${Math.round(performance.now() - t0)} ms.`, { description: "Seria TST. Deschide Facturi și derulează." });
		} catch (error) {
			toast.error(error.message);
		} finally {
			setBusy(false);
		}
	};

	if (phone) {
		const data = { demo, persistence, storage, doExport, doImport, doFresh, doDemo };
		return <PhoneSettings {...{ draft, update, setShop, setInvoicing, setHours, counterValue, nextNumber, setNextNumber, saveCounter, onLogo, staff, bays, setTheme, glass, setGlass, data }} theme={mounted ? (theme ?? "system") : "system"} />;
	}

	return (
		<Page width={look === "tabs" ? "default" : "narrow"}>
			<PageTitle title="Setări" subtitle="Se salvează automat, pe acest dispozitiv." className="mb-6">
				{lookSwitch}
			</PageTitle>
			<div className={cn(look === "tabs" && "grid gap-8 md:grid-cols-[210px_minmax(0,1fr)]")}>
			{look === "tabs" ? <SectionTabs /> : <SectionIndex />}
			<div className={cn("space-y-8", look !== "tabs" && "mt-8")}>
				<Section id="service" icon={Building2} title="Service" description="Apare pe facturi, devize și mesaje">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex items-center gap-3 sm:col-span-2">
							<button type="button" onClick={() => logoRef.current?.click()} className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted hover:bg-accent" aria-label="Încarcă logo">
								{/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
								{shop.logo ? <img src={shop.logo} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5 text-muted-foreground" />}
							</button>
							<div className="text-sm">
								<p className="font-medium">Logo</p>
								<p className="text-xs text-muted-foreground">PNG sau JPG, apare în colțul facturii.</p>
								{shop.logo && (
									<button type="button" className="text-xs text-destructive" onClick={() => setShop({ logo: null })}>
										Elimină
									</button>
								)}
							</div>
							<input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogo} />
						</div>
						<Field label="Nume comercial">{(id) => <Input id={id} value={shop.name} onChange={(e) => setShop({ name: e.target.value })} />}</Field>
						<Field label="Denumire firmă">{(id) => <Input id={id} value={shop.legalName} onChange={(e) => setShop({ legalName: e.target.value })} placeholder="Service Exemplu SRL" />}</Field>
						<Field label="CUI" hint={shop.cui && !isValidCUI(shop.cui) ? "Nu trece verificarea cifrei de control." : undefined}>
							{(id) => <Input id={id} value={shop.cui} onChange={(e) => setShop({ cui: e.target.value.toUpperCase() })} />}
						</Field>
						<Field label="Nr. Reg. Comerțului">{(id) => <Input id={id} value={shop.regCom} onChange={(e) => setShop({ regCom: e.target.value })} />}</Field>
						<Field label="Adresă" className="sm:col-span-2">{(id) => <Input id={id} value={shop.address} onChange={(e) => setShop({ address: e.target.value })} />}</Field>
						<Field label="Localitate">{(id) => <Input id={id} value={shop.city} onChange={(e) => setShop({ city: e.target.value })} />}</Field>
						<Field label="Județ / sector">{(id) => <Input id={id} value={shop.county} onChange={(e) => setShop({ county: e.target.value })} />}</Field>
						<Field label="Telefon">{(id) => <Input id={id} type="tel" value={shop.phone} onChange={(e) => setShop({ phone: e.target.value })} />}</Field>
						<Field label="Email">{(id) => <Input id={id} type="email" value={shop.email} onChange={(e) => setShop({ email: e.target.value })} />}</Field>
						<Field label="IBAN" hint={shop.iban && !isValidIBAN(shop.iban) ? "IBAN-ul nu trece verificarea." : undefined}>
							{(id) => <Input id={id} value={shop.iban} onChange={(e) => setShop({ iban: e.target.value.toUpperCase() })} className="font-mono" />}
						</Field>
						<Field label="Banca">{(id) => <Input id={id} value={shop.bank} onChange={(e) => setShop({ bank: e.target.value })} />}</Field>
					</div>
				</Section>

				<Section id="facturare" icon={ReceiptText} title="Facturare">
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Serie facturi">{(id) => <Input id={id} value={series} onChange={(e) => setInvoicing({ series: e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 8) })} className="font-mono" />}</Field>
						<Field label="Următorul număr" hint="Numai în sus: numerele nu se refolosesc.">
							{(id) => (
								<div className="flex gap-2">
									<NumberInput id={id} decimals={0} value={nextNumber ?? counterValue} onValueChange={setNextNumber} />
									{nextNumber != null && nextNumber !== counterValue && (
										<Button variant="outline" onClick={saveCounter}>
											Aplică
										</Button>
									)}
								</div>
							)}
						</Field>
						<label className="flex items-center justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
							<span>
								<span className="block text-sm font-medium">Plătitor de TVA</span>
								<span className="block text-xs text-muted-foreground">Dezactivat: facturile au mențiunea „Neplătitor de TVA”</span>
							</span>
							<Switch checked={draft.invoicing.vatPayer} onCheckedChange={(vatPayer) => setInvoicing({ vatPayer })} />
						</label>
						{draft.invoicing.vatPayer && (
							<Field label="Cota TVA standard">{(id) => <NumberInput id={id} decimals={2} suffix="%" value={draft.invoicing.vatRate} onValueChange={(vatRate) => setInvoicing({ vatRate: vatRate ?? 0 })} />}</Field>
						)}
						<Field label="Termen de plată">{(id) => <NumberInput id={id} decimals={0} suffix="zile" value={draft.invoicing.dueDays} onValueChange={(dueDays) => setInvoicing({ dueDays: dueDays ?? 0 })} />}</Field>
						<Field label="Mențiuni implicite" className="sm:col-span-2">
							{(id) => <Textarea id={id} value={draft.invoicing.notes} onChange={(e) => setInvoicing({ notes: e.target.value })} placeholder="ex. Garanție manoperă 3 luni." />}
						</Field>
					</div>
				</Section>

				<Section id="tarife" icon={Percent} title="Tarife">
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Tarif manoperă (fără TVA)" hint="pe oră">{(id) => <MoneyInput id={id} value={draft.laborRate} onValueChange={(laborRate) => update({ laborRate })} />}</Field>
						<Field label="Adaos piese" hint="Pentru prețul sugerat la piese noi">{(id) => <NumberInput id={id} decimals={1} suffix="%" value={draft.partsMarkup} onValueChange={(partsMarkup) => update({ partsMarkup: partsMarkup ?? 0 })} />}</Field>
					</div>
				</Section>

				<Section id="recenzii" icon={Star} title="Recenzii" description="La finalul unei vizite poți cere părerea clientului">
					<Field label="Linkul pentru recenzii" hint="Ex. pagina service-ului pe Google. Apare în mesajul trimis clientului.">
						{(id) => <Input id={id} type="url" inputMode="url" value={draft.reviews.link} onChange={(e) => update({ reviews: { ...draft.reviews, link: e.target.value.trim() } })} placeholder="https://g.page/r/…" />}
					</Field>
				</Section>

				<Section id="program" icon={CalendarClock} title="Program" description="Calendarul arată aceste ore">
					<div className="grid gap-4">
						<div className="grid grid-cols-2 gap-4">
							<Field label="Deschidere">{(id) => <Input id={id} type="time" value={draft.hours.open} onChange={(e) => setHours({ open: e.target.value })} />}</Field>
							<Field label="Închidere">{(id) => <Input id={id} type="time" value={draft.hours.close} onChange={(e) => setHours({ close: e.target.value })} />}</Field>
						</div>
						<div className="flex flex-wrap gap-2" role="group" aria-label="Zile lucrătoare">
							{DAYS.map(([day, label]) => {
								const on = draft.hours.days.includes(day);
								return (
									<button
										key={day}
										type="button"
										aria-pressed={on}
										onClick={() => setHours({ days: on ? draft.hours.days.filter((d) => d !== day) : [...draft.hours.days, day] })}
										className={cn("h-10 w-12 rounded-lg border text-sm font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}
									>
										{label}
									</button>
								);
							})}
						</div>
					</div>
				</Section>

				<Section id="echipa" icon={Users} title="Echipă" description="Mecanicii apar ca coloane în calendar">
					<ul className="-mx-4 divide-y border-y md:-mx-5">
						{staff.map((s) => (
							<li key={s.id}>
								<ListRow onClick={() => openSheet("staff", { id: s.id })}>
									<Initials name={s.name} tone={s.color} />
									<span className="flex-1 text-sm font-medium">{s.name}</span>
									<span className="text-xs text-muted-foreground">{STAFF_ROLES[s.role]}</span>
									{s.active === false && <ToneBadge size="sm">inactiv</ToneBadge>}
								</ListRow>
							</li>
						))}
					</ul>
					<Button variant="outline" className="mt-3" onClick={() => openSheet("staff")}>
						<Plus /> Adaugă membru
					</Button>
				</Section>

				<Section id="posturi" icon={Warehouse} title="Posturi de lucru">
					<ul className="-mx-4 divide-y border-y md:-mx-5">
						{bays.map((b) => (
							<li key={b.id}>
								<ListRow onClick={() => openSheet("bay", { id: b.id })}>
									<span className="flex-1 text-sm font-medium">{b.name}</span>
									<span className="text-xs text-muted-foreground">{BAY_KINDS[b.kind]}</span>
									{b.active === false && <ToneBadge size="sm">inactiv</ToneBadge>}
								</ListRow>
							</li>
						))}
					</ul>
					<Button variant="outline" className="mt-3" onClick={() => openSheet("bay")}>
						<Plus /> Adaugă post
					</Button>
				</Section>

				<Section id="aspect" icon={Palette} title="Aspect">
					<Segmented
						value={mounted ? (theme ?? "system") : "system"}
						onValueChange={setTheme}
						options={[
							{ value: "system", label: "Automat", icon: Monitor },
							{ value: "light", label: "Luminos", icon: Sun },
							{ value: "dark", label: "Întunecat", icon: Moon },
						]}
						className="max-sm:w-full max-sm:[&>button]:flex-1"
					/>
					{/* The safe way back (docs/LIQUID-GLASS.md): off, every bar, menu and the search are plain again. */}
					<label className="mt-4 flex items-center justify-between gap-4">
						<span className="min-w-0">
							<span className="block text-sm font-medium">Sticlă lichidă</span>
							<span className="block text-sm text-muted-foreground">Barele, meniurile, căutarea și lucrarea pornită, ca sticla. Oprită: suprafețe simple. Pe acest dispozitiv.</span>
						</span>
						<Switch checked={glass === "on"} onCheckedChange={(on) => setGlass(on ? "on" : "off")} aria-label="Sticlă lichidă" />
					</label>
					<p className="mt-3 text-sm text-muted-foreground">
						Toate culorile și componentele sunt în{" "}
						<Link href="/design/" className="font-medium text-foreground underline underline-offset-2">
							design system
						</Link>
						.
					</p>
				</Section>

				<Section id="deschidere" icon={PanelRight} title="Deschiderea detaliilor" description="Cum se deschide o programare, un client, o mașină, o lucrare sau o factură din liste, pe ecrane late. Pe telefon se deschide mereu pagina completă." className="max-md:hidden">
					<Segmented
						value={detailMode}
						onValueChange={setDetailMode}
						options={[
							{ value: "sheet", label: "Panou lateral", icon: PanelRight },
							{ value: "page", label: "Pagină completă", icon: FileText },
						]}
						className="max-sm:w-full max-sm:[&>button]:flex-1"
					/>
					<p className="mt-3 text-sm text-muted-foreground">Din panou poți oricând deschide pagina completă (butonul din colțul de sus).</p>
				</Section>

				<Section id="date" icon={Database} title="Date" description="Totul stă pe acest dispozitiv — fără cont, fără internet.">
					<div className="space-y-4">
						{persistence === "memory" ? (
							<Banner tone="red" title="Datele nu se salvează">
								Browserul nu permite stocare locală (mod privat?). Tot ce introduci se pierde la închidere.
							</Banner>
						) : (
							<p className="text-sm text-muted-foreground">
								Stocare locală{storage ? ` · ${(storage.usage / 1024 / 1024).toFixed(1)} MB folosiți · ${storage.persisted ? "protejată de ștergere automată" : "poate fi curățată de sistem când lipsește spațiu"}` : ""}. Fă un backup săptămânal.
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							<Button onClick={doExport}>
								<Download /> Exportă backup
							</Button>
							<Button variant="outline" onClick={() => fileRef.current?.click()}>
								<Upload /> Restaurează
							</Button>
							<input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} />
						</div>
						<div className="flex flex-wrap gap-2 border-t pt-4">
							<Button variant="outline" onClick={doFresh}>
								{demo ? "Începe cu datele tale" : "Șterge toate datele"}
							</Button>
							<Button variant="ghost" onClick={doDemo}>
								<RotateCcw /> Reîncarcă demo
							</Button>
						</div>
						<details className="rounded-lg border p-3 text-sm">
							<summary className="flex cursor-pointer items-center gap-2 font-medium">
								<FlaskConical className="size-4" /> Pentru dezvoltare
							</summary>
							<p className="mt-2 text-muted-foreground">Testează performanța cu volum mare: adaugă 5.000 de facturi în seria TST.</p>
							<Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={doStress}>
								Adaugă 5.000 facturi de test
							</Button>
						</details>
					</div>
				</Section>
				<p className="pb-4 text-center text-xs text-muted-foreground">Garaj 0.1 · prototip MVP</p>
			</div>
			</div>
		</Page>
	);
}
