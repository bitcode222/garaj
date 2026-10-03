"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Building2, CalendarClock, Database, Download, FlaskConical, ImagePlus, Monitor, PanelRight, FileText, Moon, Palette, Percent, Plus, ReceiptText, RotateCcw, Sun, Upload, Users, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { useConfirm } from "@/components/ds/confirm";
import { Banner, Initials } from "@/components/ds/data";
import { Field, MoneyInput, NumberInput, Segmented } from "@/components/ds/inputs";
import { ListRow } from "@/components/ds/list";
import { Page, PageHeader } from "@/components/ds/page";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isValidCUI, isValidIBAN } from "@/domain/customer";
import { todayISO } from "@/domain/dates";
import { DETAIL_MODES, DETAIL_MODE_KEY } from "@/lib/detail-mode";
import { useDraft, useHydrated, useLocalPreference } from "@/lib/hooks";
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

function Section({ id, icon, title, description, children }) {
	return (
		<Card id={id} className="scroll-mt-24">
			<CardHeader title={title} description={description} icon={icon} />
			<CardContent>{children}</CardContent>
		</Card>
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
	const { theme, setTheme } = useTheme();
	const [detailMode, setDetailMode] = useLocalPreference(DETAIL_MODE_KEY, "sheet", DETAIL_MODES);
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

	return (
		<Page width="narrow">
			<PageHeader title="Setări" description="Se salvează automat, pe acest dispozitiv." />
			<div className="space-y-6">
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
					<p className="mt-3 text-sm text-muted-foreground">
						Toate culorile și componentele sunt în{" "}
						<Link href="/design/" className="font-medium text-foreground underline underline-offset-2">
							design system
						</Link>
						.
					</p>
				</Section>

				<Section id="deschidere" icon={PanelRight} title="Deschiderea detaliilor" description="Cum se deschide o programare, un client, o mașină, o lucrare sau o factură din liste. Se păstrează pe acest dispozitiv.">
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
		</Page>
	);
}
