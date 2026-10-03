"use client";

import { useDeferredValue, useState } from "react";
import { CarFront, ChevronsUpDown, Plus, User } from "lucide-react";
import { toast } from "sonner";
import { Field, SearchInput } from "@/components/ds/inputs";
import { MakeLogo, PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/domain/customer";
import { matchesTokens, queryTokens } from "@/domain/search";
import { normalizePlate, vehicleName } from "@/domain/vehicle";
import { saveCustomer, saveVehicle } from "@/lib/store/actions";
import { useCollection } from "@/lib/store/hooks";
import { selectSearchIndex, selectVehiclesByCustomer } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

function useIndex() {
	return selectSearchIndex(useCollection("customers"), useCollection("vehicles"), useCollection("workOrders"), useCollection("invoices"));
}

function PickerTrigger({ onClick, icon: Icon, placeholder, children, invalid, disabled }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			data-invalid={invalid || undefined}
			className={cn(
				"flex min-h-11 w-full items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-left text-base shadow-xs transition-colors hover:bg-accent/40 disabled:opacity-60 md:min-h-9 md:py-1.5 md:text-sm",
				"data-invalid:border-destructive",
			)}
		>
			{children ?? (
				<>
					<Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
					<span className="flex-1 text-muted-foreground">{placeholder}</span>
				</>
			)}
			<ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
		</button>
	);
}

export function CustomerPicker({ value, onChange, invalid }) {
	const customers = useCollection("customers");
	const index = useIndex();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [creating, setCreating] = useState(null);
	const deferred = useDeferredValue(query);
	const tokens = queryTokens(deferred);
	const current = value ? customers[value] : null;
	const results = index.filter((i) => i.type === "customer" && (!tokens.length || matchesTokens(i.hay, tokens))).slice(0, 50);

	const choose = (id) => {
		onChange(id);
		setOpen(false);
		setQuery("");
		setCreating(null);
	};

	return (
		<>
			<PickerTrigger onClick={() => setOpen(true)} icon={User} placeholder="Alege clientul" invalid={invalid}>
				{current && (
					<span className="min-w-0 flex-1">
						<span className="block truncate font-medium">{current.name}</span>
						{current.phone && <span className="block text-xs text-muted-foreground">{formatPhone(current.phone)}</span>}
					</span>
				)}
			</PickerTrigger>
			<Sheet open={open} onOpenChange={setOpen} title="Alege clientul">
				{creating ? (
					<form
						className="grid gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							try {
								const customer = saveCustomer({ type: creating.company ? "company" : "person", name: creating.name, phone: creating.phone, cui: creating.cui });
								toast.success("Client adăugat");
								choose(customer.id);
							} catch (error) {
								toast.error(error.message);
							}
						}}
					>
						<div className="flex gap-2">
							<Button type="button" size="sm" variant={creating.company ? "outline" : "default"} onClick={() => setCreating({ ...creating, company: false })}>
								Persoană fizică
							</Button>
							<Button type="button" size="sm" variant={creating.company ? "default" : "outline"} onClick={() => setCreating({ ...creating, company: true })}>
								Firmă
							</Button>
						</div>
						<Field label={creating.company ? "Denumire firmă" : "Nume și prenume"} required>
							{(id) => <Input id={id} autoFocus value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />}
						</Field>
						<Field label="Telefon">
							{(id) => <Input id={id} type="tel" inputMode="tel" value={creating.phone} onChange={(e) => setCreating({ ...creating, phone: e.target.value })} />}
						</Field>
						{creating.company && (
							<Field label="CUI">{(id) => <Input id={id} value={creating.cui} onChange={(e) => setCreating({ ...creating, cui: e.target.value })} />}</Field>
						)}
						<div className="mt-2 flex gap-2">
							<Button type="button" variant="outline" className="flex-1 max-md:h-11" onClick={() => setCreating(null)}>
								Înapoi
							</Button>
							<Button type="submit" className="flex-1 max-md:h-11">
								Adaugă clientul
							</Button>
						</div>
					</form>
				) : (
					<>
						<SearchInput value={query} onChange={setQuery} placeholder="Nume, telefon, CUI…" className="mb-3" />
						<Button variant="outline" className="mb-3 w-full justify-start max-md:h-11" onClick={() => setCreating({ name: query, phone: "", cui: "", company: false })}>
							<Plus /> Client nou{query ? `: „${query}”` : ""}
						</Button>
						<ul className="divide-y rounded-xl border">
							{results.map((item) => (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => choose(item.id)}
										className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/60", item.id === value && "bg-accent")}
									>
										<User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">{item.title}</span>
											{item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
										</span>
									</button>
								</li>
							))}
							{!results.length && <li className="px-3 py-4 text-sm text-muted-foreground">Niciun client găsit.</li>}
						</ul>
					</>
				)}
			</Sheet>
		</>
	);
}

/** Vehicle picker; the owner's cars come first. Creating a car can also create its owner. */
export function VehiclePicker({ value, onChange, customerId, invalid }) {
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const byCustomer = selectVehiclesByCustomer(vehicles);
	const index = useIndex();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [creating, setCreating] = useState(null);
	const deferred = useDeferredValue(query);
	const tokens = queryTokens(deferred);
	const current = value ? vehicles[value] : null;
	const own = customerId ? (byCustomer.get(customerId) ?? []) : [];
	const results = tokens.length
		? index.filter((i) => i.type === "vehicle" && matchesTokens(i.hay, tokens)).slice(0, 50).map((i) => vehicles[i.id])
		: own.length
			? own
			: Object.values(vehicles).slice(0, 30);

	const choose = (vehicle) => {
		onChange(vehicle.id, vehicle);
		setOpen(false);
		setQuery("");
		setCreating(null);
	};

	return (
		<>
			<PickerTrigger onClick={() => setOpen(true)} icon={CarFront} placeholder="Alege mașina (nr. înmatriculare)" invalid={invalid}>
				{current && (
					<span className="flex min-w-0 flex-1 items-center gap-2.5">
						<VehicleLabel vehicle={current} className="min-w-0" />
						<PlateTag value={current.plate} className="ml-auto" />
					</span>
				)}
			</PickerTrigger>
			<Sheet open={open} onOpenChange={setOpen} title="Alege mașina">
				{creating ? (
					<form
						className="grid gap-3"
						onSubmit={(e) => {
							e.preventDefault();
							try {
								let ownerId = creating.customerId;
								if (!ownerId) {
									if (!creating.ownerName.trim()) throw new Error("Completează numele proprietarului.");
									ownerId = saveCustomer({ name: creating.ownerName, phone: creating.ownerPhone }).id;
								}
								const vehicle = saveVehicle({ plate: creating.plate, make: creating.make, model: creating.model, customerId: ownerId });
								toast.success("Mașină adăugată");
								choose(vehicle);
							} catch (error) {
								toast.error(error.message);
							}
						}}
					>
						<Field label="Număr de înmatriculare" required>
							{(id) => (
								<Input
									id={id}
									autoFocus
									autoCapitalize="characters"
									value={creating.plate}
									onChange={(e) => setCreating({ ...creating, plate: e.target.value.toUpperCase() })}
									className="font-mono uppercase"
								/>
							)}
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label="Marcă">{(id) => <Input id={id} value={creating.make} onChange={(e) => setCreating({ ...creating, make: e.target.value })} />}</Field>
							<Field label="Model">{(id) => <Input id={id} value={creating.model} onChange={(e) => setCreating({ ...creating, model: e.target.value })} />}</Field>
						</div>
						{creating.customerId ? (
							<p className="rounded-lg bg-muted px-3 py-2 text-sm">
								Proprietar: <span className="font-medium">{customers[creating.customerId]?.name}</span>
							</p>
						) : (
							<div className="grid grid-cols-2 gap-3">
								<Field label="Proprietar" required>
									{(id) => <Input id={id} value={creating.ownerName} onChange={(e) => setCreating({ ...creating, ownerName: e.target.value })} />}
								</Field>
								<Field label="Telefon">
									{(id) => <Input id={id} type="tel" inputMode="tel" value={creating.ownerPhone} onChange={(e) => setCreating({ ...creating, ownerPhone: e.target.value })} />}
								</Field>
							</div>
						)}
						<div className="mt-2 flex gap-2">
							<Button type="button" variant="outline" className="flex-1 max-md:h-11" onClick={() => setCreating(null)}>
								Înapoi
							</Button>
							<Button type="submit" className="flex-1 max-md:h-11">
								Adaugă mașina
							</Button>
						</div>
					</form>
				) : (
					<>
						<SearchInput value={query} onChange={setQuery} placeholder="Nr. înmatriculare, VIN, marcă, client…" className="mb-3" autoCapitalize="characters" />
						<Button
							variant="outline"
							className="mb-3 w-full justify-start max-md:h-11"
							onClick={() =>
								setCreating({
									plate: normalizePlate(query) ? query.toUpperCase() : "",
									make: "",
									model: "",
									customerId: customerId ?? null,
									ownerName: "",
									ownerPhone: "",
								})
							}
						>
							<Plus /> Mașină nouă{query ? `: ${query.toUpperCase()}` : ""}
						</Button>
						{!tokens.length && own.length > 0 && <p className="mb-1.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase">Mașinile clientului</p>}
						<ul className="divide-y rounded-xl border">
							{results.map((vehicle) => (
								<li key={vehicle.id}>
									<button
										type="button"
										onClick={() => choose(vehicle)}
										className={cn("flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/60", vehicle.id === value && "bg-accent")}
									>
										<MakeLogo make={vehicle.make} className="size-6" />
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-medium">{vehicleName(vehicle) || "Mașină"}</span>
											<span className="block truncate text-xs text-muted-foreground">{customers[vehicle.customerId]?.name}</span>
										</span>
										<PlateTag value={vehicle.plate} />
									</button>
								</li>
							))}
							{!results.length && <li className="px-3 py-4 text-sm text-muted-foreground">Nicio mașină găsită.</li>}
						</ul>
					</>
				)}
			</Sheet>
		</>
	);
}
