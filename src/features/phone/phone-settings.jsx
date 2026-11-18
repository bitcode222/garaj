"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Database, Download, ImagePlus, Minus, Plus, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { PageTitle } from "@/components/ds/blocks";
import { IosHeader, IosSegmented } from "@/components/ds/ios";
import { NavGroup } from "@/components/ds/nav-bar";
import { Page } from "@/components/ds/page";
import { Switch } from "@/components/ui/switch";
import { initials, isValidCUI, isValidIBAN } from "@/domain/customer";
import { IOS_AREA, TONE_COLOR, STATE } from "@/lib/colors";
import { BAY_KINDS, STAFF_ROLES } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useCollection } from "@/lib/store/hooks";
import { cn } from "@/lib/utils";

// Setări on the phone, as the iPhone's (ios-native/Garaj/Views/SettingsView.swift; docs/DESIGN.md "Telefon ca iPhone"): one
// grouped form, label on the left and the value typed on the right, saved as you type. Service, Facturare, Tarife, the
// reviews link, Program, Echipă, Posturi de lucru, Aspect (with this device's liquid glass), then Date și backup.
// The web-only parts (the look switch, how details open, the developer tools) stay on the desktop.

const DAYS = [
	[1, "Lu"],
	[2, "Ma"],
	[3, "Mi"],
	[4, "Jo"],
	[5, "Vi"],
	[6, "Sâ"],
	[0, "Du"],
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const value = "min-w-0 flex-1 bg-transparent text-right text-[17px] outline-none placeholder:text-muted-foreground/60";

function Group({ title, footer, children }) {
	return (
		<section className="space-y-1.5" aria-label={title}>
			{title && <IosHeader title={title} className="px-4" />}
			<ul className="overflow-hidden rounded-[20px] bg-card [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-x-0 [&>li+li]:before:top-0 [&>li+li]:before:ml-4 [&>li+li]:before:h-px [&>li+li]:before:bg-border">{children}</ul>
			{footer && <p className="px-4 text-[13px] whitespace-pre-line text-muted-foreground">{footer}</p>}
		</section>
	);
}

/** LabeledContent with a TextField: the label, then the value typed on the right; a warning under it. */
function Field({ label, warning, children }) {
	return (
		<li className="px-4 py-2.5">
			<label className="flex min-h-6 items-center gap-3">
				<span className="shrink-0 text-[17px]">{label}</span>
				{children}
			</label>
			{warning && (
				<p className="mt-1 flex items-center gap-1 text-[12px]" style={{ color: STATE.run }}>
					<TriangleAlert className="size-3.5" aria-hidden /> {warning}
				</p>
			)}
		</li>
	);
}

function TextRow({ label, val, onChange, placeholder, warning, mono, ...props }) {
	return (
		<Field label={label} warning={warning}>
			<input value={val ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? label} className={cn(value, mono && "font-mono")} {...props} />
		</Field>
	);
}

/** A number typed as text ("21" or "9,5"), saved while typing when it parses. */
function NumberRow({ label, val, suffix, decimals = 0, onChange }) {
	const [text, setText] = useState(() => (val == null ? "" : String(val).replace(".", ",")));
	return (
		<Field label={label}>
			<input
				inputMode={decimals ? "decimal" : "numeric"}
				value={text}
				placeholder="0"
				onChange={(e) => {
					setText(e.target.value);
					const n = Number(e.target.value.replace(",", "."));
					if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onChange(decimals ? Math.round(n * 10 ** decimals) / 10 ** decimals : Math.round(n));
				}}
				className={value}
			/>
			{suffix && <span className="text-[17px] text-muted-foreground">{suffix}</span>}
		</Field>
	);
}

/** Money in bani, typed in lei. */
function MoneyRow({ label, val, currency, onChange }) {
	const [text, setText] = useState(() => (val == null ? "" : (val / 100).toFixed(2).replace(".", ",")));
	return (
		<Field label={label}>
			<input
				inputMode="decimal"
				value={text}
				placeholder="0,00"
				onChange={(e) => {
					setText(e.target.value);
					const n = Number(e.target.value.replace(/\s/g, "").replace(",", "."));
					if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100));
				}}
				className={value}
			/>
			<span className="text-[17px] text-muted-foreground">{currency === "RON" ? "lei" : currency}</span>
		</Field>
	);
}

function ToggleRow({ label, detail, checked, onChange }) {
	return (
		<li className="flex min-h-11 items-center gap-3 px-4 py-2.5">
			<span className="min-w-0 flex-1">
				<span className="block text-[17px]">{label}</span>
				{detail && <span className="block text-[13px] text-muted-foreground">{detail}</span>}
			</span>
			<Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
		</li>
	);
}

/** The iPhone's Stepper: the value, then a grey "− | +" capsule. */
function StepperRow({ label, shown, val, min = 0, max = 365, onChange }) {
	return (
		<li className="flex min-h-11 items-center gap-3 px-4 py-1.5">
			<span className="flex-1 text-[17px]">{label}</span>
			<span className="text-[17px] text-muted-foreground tabular-nums">{shown}</span>
			<span className="flex h-8 items-center rounded-lg bg-foreground/[0.07]">
				<button type="button" aria-label={`${label}: mai puțin`} disabled={val <= min} onClick={() => onChange(val - 1)} className="flex h-full w-11 items-center justify-center disabled:opacity-30">
					<Minus className="size-4" aria-hidden />
				</button>
				<span className="h-4 w-px bg-border" aria-hidden />
				<button type="button" aria-label={`${label}: mai mult`} disabled={val >= max} onClick={() => onChange(val + 1)} className="flex h-full w-11 items-center justify-center disabled:opacity-30">
					<Plus className="size-4" aria-hidden />
				</button>
			</span>
		</li>
	);
}

function AddRow({ label, onClick }) {
	return (
		<li>
			<button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[17px] text-brand active:bg-foreground/[0.06]">
				<Plus className="size-5" aria-hidden /> {label}
			</button>
		</li>
	);
}

function Inactive() {
	return <span className="text-[12px] text-muted-foreground">inactiv</span>;
}

/** Setări → Date și backup: what is stored, backup out and in; a page pushed over Setări. */
function DataPage({ open, onClose, data }) {
	const fileRef = useRef(null);
	useEffect(() => {
		if (!open) return undefined;
		const onKey = (event) => event.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);
	if (!open || typeof document === "undefined") return null;
	const action = "flex min-h-11 w-full items-center gap-3 px-4 text-left text-[17px] text-brand active:bg-foreground/[0.06]";
	return createPortal(
		<div role="dialog" aria-modal aria-label="Date și backup" className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background pb-[calc(var(--safe-bottom)+2rem)]">
			<div className="sticky top-0 z-10 flex h-11 items-center gap-2 bg-background/85 px-4 backdrop-blur-xl" style={{ marginTop: "var(--safe-top)" }}>
				<NavGroup>
					<button type="button" onClick={onClose} aria-label="Înapoi" className="flex size-11 items-center justify-center rounded-full active:opacity-60">
						<ChevronLeft className="size-6" aria-hidden />
					</button>
				</NavGroup>
				<span className="pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold">Date și backup</span>
			</div>
			<div className="space-y-6 px-4 pt-3">
				<Counts storage={data.storage} persistence={data.persistence} />
				<Group footer="Backup-ul are același format ca în aplicația de iPhone, deci datele se mută între telefon și calculator.">
					<li>
						<button type="button" onClick={data.doExport} className={action}>
							<Upload className="size-5" aria-hidden /> Exportă backup
						</button>
					</li>
					<li>
						<button type="button" onClick={() => fileRef.current?.click()} className={action}>
							<Download className="size-5" aria-hidden /> Importă backup
						</button>
						<input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={data.doImport} />
					</li>
				</Group>
				<Group footer={data.demo ? "Datele demo dispar; rămâi cu un service gol, gata de lucru." : "Clienții, mașinile, lucrările și facturile de pe acest dispozitiv se șterg. Fă întâi un backup."}>
					<li>
						<button type="button" onClick={data.doFresh} className={cn(action, !data.demo && "text-destructive")}>
							{data.demo ? "Începe cu datele tale" : "Șterge toate datele"}
						</button>
					</li>
					<li>
						<button type="button" onClick={data.doDemo} className={action}>
							<RotateCcw className="size-5" aria-hidden /> Reîncarcă demo
						</button>
					</li>
				</Group>
			</div>
		</div>,
		document.body,
	);
}

const COUNTS = [
	["customers", "Clienți"],
	["vehicles", "Mașini"],
	["appointments", "Programări"],
	["workOrders", "Lucrări"],
	["invoices", "Facturi"],
	["payments", "Plăți"],
];

function Count({ collection, label }) {
	const n = Object.keys(useCollection(collection)).length;
	return (
		<li className="flex min-h-11 items-center px-4">
			<span className="flex-1 text-[17px]">{label}</span>
			<span className="text-[17px] text-muted-foreground tabular-nums">{n.toLocaleString("ro-RO")}</span>
		</li>
	);
}

function Counts({ storage, persistence }) {
	const footer =
		persistence === "memory"
			? "Browserul nu permite stocare locală (mod privat?): tot ce introduci se pierde la închidere."
			: `Stocare locală${storage ? ` · ${(storage.usage / 1024 / 1024).toFixed(1).replace(".", ",")} MB · ${storage.persisted ? "protejată de ștergere automată" : "poate fi curățată de sistem când lipsește spațiu"}` : ""}.`;
	return (
		<Group title="Pe acest telefon" footer={footer}>
			{COUNTS.map(([collection, label]) => (
				<Count key={collection} collection={collection} label={label} />
			))}
		</Group>
	);
}

/** Everything comes from the web page (settings-page.jsx), which keeps the draft and saves it. */
export function PhoneSettings({ draft, update, setShop, setInvoicing, setHours, counterValue, nextNumber, setNextNumber, saveCounter, onLogo, staff, bays, theme, setTheme, glass, setGlass, data }) {
	const logoRef = useRef(null);
	const [dataOpen, setDataOpen] = useState(false);
	const shop = draft.shop;
	const inv = draft.invoicing;
	const series = inv.series;

	return (
		<Page width="narrow" className="space-y-6">
			<PageTitle title="Setări" actions={null} />

			<Group title="Service" footer="Apare pe facturi, devize și mesaje.">
				<li className="flex items-center gap-3.5 px-4 py-3">
					<button type="button" onClick={() => logoRef.current?.click()} aria-label="Alege logo" className="flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground/[0.07]">
						{/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
						{shop.logo ? <img src={shop.logo} alt="" className="size-full object-contain" /> : <ImagePlus className="size-6 text-muted-foreground" aria-hidden />}
					</button>
					<span className="min-w-0">
						<span className="block text-[17px]">Logo</span>
						<span className="block text-[12px] text-muted-foreground">Apare în colțul facturii.</span>
						{shop.logo && (
							<button type="button" onClick={() => setShop({ logo: null })} className="text-[12px] text-destructive">
								Elimină
							</button>
						)}
					</span>
					<input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogo} />
				</li>
				<TextRow label="Nume comercial" val={shop.name} onChange={(name) => setShop({ name })} placeholder="Garajul meu" />
				<TextRow label="Denumire firmă" val={shop.legalName} onChange={(legalName) => setShop({ legalName })} placeholder="Service Exemplu SRL" />
				<TextRow label="CUI" val={shop.cui} onChange={(cui) => setShop({ cui: cui.toUpperCase() })} autoCapitalize="characters" autoCorrect="off" warning={shop.cui && !isValidCUI(shop.cui) ? "Nu trece verificarea cifrei de control." : null} />
				<TextRow label="Nr. Reg. Comerțului" val={shop.regCom} onChange={(regCom) => setShop({ regCom })} autoCapitalize="characters" autoCorrect="off" />
				<TextRow label="Adresă" val={shop.address} onChange={(address) => setShop({ address })} />
				<TextRow label="Localitate" val={shop.city} onChange={(city) => setShop({ city })} />
				<TextRow label="Județ / sector" val={shop.county} onChange={(county) => setShop({ county })} />
				<TextRow label="Telefon" type="tel" val={shop.phone} onChange={(phone) => setShop({ phone })} />
				<TextRow label="Email" type="email" val={shop.email} onChange={(email) => setShop({ email })} autoCapitalize="none" autoCorrect="off" warning={shop.email && !EMAIL.test(shop.email) ? "Adresa nu pare corectă." : null} />
				<TextRow label="IBAN" val={shop.iban} onChange={(iban) => setShop({ iban: iban.toUpperCase() })} autoCapitalize="characters" autoCorrect="off" warning={shop.iban && !isValidIBAN(shop.iban) ? "IBAN-ul nu trece verificarea." : null} />
				<TextRow label="Banca" val={shop.bank} onChange={(bank) => setShop({ bank })} />
			</Group>

			<Group title="Facturare" footer="Numărul merge numai în sus: numerele nu se refolosesc.">
				<TextRow label="Serie facturi" val={series} onChange={(v) => setInvoicing({ series: v.toUpperCase().replace(/\s/g, "").slice(0, 8) })} placeholder="GRJ" mono autoCapitalize="characters" autoCorrect="off" />
				<Field label="Următorul număr">
					<input
						inputMode="numeric"
						value={nextNumber ?? ""}
						placeholder={String(counterValue)}
						onChange={(e) => {
							const n = parseInt(e.target.value, 10);
							setNextNumber(Number.isFinite(n) ? n : null);
						}}
						className={value}
					/>
					{nextNumber != null && nextNumber !== counterValue && (
						<button type="button" onClick={saveCounter} className="text-[17px] font-semibold text-brand">
							Aplică
						</button>
					)}
				</Field>
				<ToggleRow label="Plătitor de TVA" detail="Dezactivat: facturile au mențiunea „Neplătitor de TVA”." checked={inv.vatPayer} onChange={(vatPayer) => setInvoicing({ vatPayer })} />
				{inv.vatPayer && <NumberRow label="Cota TVA standard" val={inv.vatRate} suffix="%" decimals={2} onChange={(vatRate) => setInvoicing({ vatRate })} />}
				<StepperRow label="Termen de plată" shown={inv.dueDays === 1 ? "1 zi" : `${inv.dueDays} zile`} val={inv.dueDays} onChange={(dueDays) => setInvoicing({ dueDays })} />
				<li className="px-4 py-2.5">
					<textarea value={inv.notes ?? ""} onChange={(e) => setInvoicing({ notes: e.target.value })} placeholder="Mențiuni implicite (ex. Garanție manoperă 3 luni.)" aria-label="Mențiuni implicite" rows={2} className="field-sizing-content block min-h-12 w-full resize-none bg-transparent text-[17px] outline-none placeholder:text-muted-foreground/60" />
				</li>
			</Group>

			<Group title="Tarife">
				<MoneyRow label="Manoperă pe oră, fără TVA" val={draft.laborRate} currency={draft.currency ?? "RON"} onChange={(laborRate) => update({ laborRate })} />
				<NumberRow label="Adaos piese" val={draft.partsMarkup} suffix="%" decimals={1} onChange={(partsMarkup) => update({ partsMarkup })} />
			</Group>

			<Group title="Linkul pentru recenzii" footer="Ex. pagina service-ului pe Google. Apare în mesajul trimis clientului la finalul vizitei.">
				<li className="px-4 py-2.5">
					<input type="url" inputMode="url" value={draft.reviews.link ?? ""} onChange={(e) => update({ reviews: { ...draft.reviews, link: e.target.value.trim() } })} placeholder="https://g.page/r/…" aria-label="Linkul pentru recenzii" autoCapitalize="none" autoCorrect="off" className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted-foreground/60" />
				</li>
			</Group>

			<Group title="Program" footer="Calendarul arată aceste ore și zile.">
				<Field label="Deschidere">
					<span className="flex-1" />
					<input type="time" value={draft.hours.open} onChange={(e) => setHours({ open: e.target.value })} className="rounded-md bg-foreground/[0.07] px-2.5 py-1 text-[17px] outline-none" />
				</Field>
				<Field label="Închidere">
					<span className="flex-1" />
					<input type="time" value={draft.hours.close} onChange={(e) => setHours({ close: e.target.value })} className="rounded-md bg-foreground/[0.07] px-2.5 py-1 text-[17px] outline-none" />
				</Field>
				<li className="flex gap-1.5 px-4 py-2.5" role="group" aria-label="Zile lucrătoare">
					{DAYS.map(([day, label]) => {
						const on = draft.hours.days.includes(day);
						return (
							<button key={day} type="button" aria-pressed={on} onClick={() => setHours({ days: DAYS.map(([d]) => d).filter((d) => (d === day ? !on : draft.hours.days.includes(d))) })} className={cn("flex h-9 flex-1 items-center justify-center rounded-lg text-[15px] font-medium", on ? "bg-brand text-white" : "bg-foreground/[0.07] text-muted-foreground")}>
								{label}
							</button>
						);
					})}
				</li>
			</Group>

			<Group title="Echipă" footer="Mecanicii apar ca coloane în calendar, în ordinea de aici.">
				{staff.map((s) => (
					<li key={s.id}>
						<button type="button" onClick={() => openSheet("staff", { id: s.id })} className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left active:bg-foreground/[0.06]">
							<span className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: TONE_COLOR[s.color] ?? STATE.off }}>
								{initials(s.name)}
							</span>
							<span className="min-w-0 flex-1 truncate text-[17px]">{s.name}</span>
							<span className="text-[17px] text-muted-foreground">{STAFF_ROLES[s.role] ?? s.role}</span>
							{s.active === false && <Inactive />}
						</button>
					</li>
				))}
				<AddRow label="Adaugă membru" onClick={() => openSheet("staff")} />
			</Group>

			<Group title="Posturi de lucru">
				{bays.map((b) => (
					<li key={b.id}>
						<button type="button" onClick={() => openSheet("bay", { id: b.id })} className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left active:bg-foreground/[0.06]">
							<span className="min-w-0 flex-1 truncate text-[17px]">{b.name}</span>
							<span className="text-[17px] text-muted-foreground">{BAY_KINDS[b.kind] ?? b.kind}</span>
							{b.active === false && <Inactive />}
						</button>
					</li>
				))}
				<AddRow label="Adaugă post" onClick={() => openSheet("bay")} />
			</Group>

			<Group title="Aspect">
				<li className="px-4 py-2.5">
					<IosSegmented
						value={theme}
						onChange={setTheme}
						label="Temă"
						options={[
							{ value: "system", label: "Automat" },
							{ value: "light", label: "Luminos" },
							{ value: "dark", label: "Întunecat" },
						]}
					/>
				</li>
				<ToggleRow label="Sticlă lichidă" detail="Barele și meniurile, ca sticla. Pe acest dispozitiv." checked={glass === "on"} onChange={(on) => setGlass(on ? "on" : "off")} />
			</Group>

			<Group footer={"Totul stă pe acest dispozitiv, fără cont. Fă un backup săptămânal.\n\nGaraj 0.1"}>
				<li>
					<button type="button" onClick={() => setDataOpen(true)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left active:bg-foreground/[0.06]">
						<span className="flex size-[30px] items-center justify-center rounded-lg text-white" style={{ background: IOS_AREA.setari }}>
							<Database className="size-[18px]" aria-hidden />
						</span>
						<span className="flex-1 text-[17px]">Date și backup</span>
						<ChevronRight className="size-[18px] text-muted-foreground/60" strokeWidth={2.5} aria-hidden />
					</button>
				</li>
			</Group>

			<DataPage open={dataOpen} onClose={() => setDataOpen(false)} data={data} />
		</Page>
	);
}

