"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, CarFront, Pencil, Plus, ReceiptText, Wrench } from "lucide-react";
import { ContactActions } from "@/components/ds/contact";
import { DetailSheet } from "@/components/ds/detail-sheet";
import { Initials, KeyValue, KeyValueGrid, Money, Stat } from "@/components/ds/data";
import { Plate } from "@/components/ds/plate";
import { StatusBadge, ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { formatIBAN, formatPhone, isValidCUI, joinAddress } from "@/domain/customer";
import { computeTotals } from "@/domain/lines";
import { vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtWorkOrder, plural } from "@/lib/format";
import { CUSTOMER_TYPES, WORK_ORDER_STATUS } from "@/lib/labels";
import { navigateFromSheet, openSheet } from "@/lib/sheets";
import { useCollection, useEntity, useSettings, useToday } from "@/lib/store/hooks";
import { selectInvoiceStates, selectInvoicesByCustomer, selectVehiclesByCustomer, selectWorkOrdersByCustomer } from "@/lib/store/selectors";

/** Customer overlay: contact first, then money, cars and the latest jobs. The full page has everything else. */
export default function CustomerView({ open, onOpenChange, id }) {
	const router = useRouter();
	const today = useToday();
	const settings = useSettings();
	const customer = useEntity("customers", id);
	const vehicles = useCollection("vehicles");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");

	const cars = customer ? (selectVehiclesByCustomer(vehicles).get(customer.id) ?? []) : [];
	const orders = customer ? (selectWorkOrdersByCustomer(workOrders).get(customer.id) ?? []) : [];
	const docs = customer ? (selectInvoicesByCustomer(invoices).get(customer.id) ?? []) : [];
	const states = customer && today && open ? selectInvoiceStates(invoices, payments, today) : new Map();
	const balance = docs.reduce((sum, i) => sum + (states.get(i.id)?.balance ?? 0), 0);
	const company = customer?.type === "company";
	const goto = (href) => navigateFromSheet(router, href);

	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={customer}
			missing="Clientul a fost șters."
			title={customer?.name ?? "Client"}
			description={customer ? `${CUSTOMER_TYPES[customer.type] ?? CUSTOMER_TYPES.person} · client din ${fmtDate(customer.createdAt, "MMMM yyyy")}` : undefined}
			fullPage={customer && `/customers/detail/?id=${customer.id}`}
			footer={
				customer && (
					<>
						<Button variant="outline" className="max-md:h-11" onClick={() => openSheet("customer", { id: customer.id })}>
							<Pencil /> Editează
						</Button>
						<Button className="max-md:h-11" onClick={() => openSheet("appointment", { customerId: customer.id, vehicleId: cars[0]?.id })}>
							<CalendarPlus /> Programează
						</Button>
					</>
				)
			}
		>
			{customer && (
				<div className="space-y-5">
					<div className="flex items-center gap-3">
						<Initials name={customer.name} tone={company ? "purple" : "blue"} size="lg" />
						<div className="min-w-0">
							<p className="truncate font-semibold">{customer.name}</p>
							<p className="text-sm text-muted-foreground">{formatPhone(customer.phone) || "Fără telefon"}</p>
						</div>
						{!customer.marketingConsent && (
							<ToneBadge tone="neutral" size="sm" className="ml-auto">
								fără acord reamintiri
							</ToneBadge>
						)}
					</div>
					<ContactActions phone={customer.phone} message={`Bună ziua! ${settings.shop.name} vă contactează.`} />

					<div className="grid grid-cols-2 gap-3">
						<Stat label="Sold de plată" value={<Money value={balance} decimals={0} />} icon={ReceiptText} tone={balance > 0 ? "red" : "green"} />
						<Stat label="Vizite" value={orders.length} hint={orders[0] ? `ultima ${fmtDate(orders[0].createdAt)}` : "nicio vizită"} icon={Wrench} />
					</div>

					<KeyValueGrid className="sm:grid-cols-2">
						<KeyValue label="Email">{customer.email}</KeyValue>
						<KeyValue label="Adresă" className="[&_dd]:whitespace-normal">
							{joinAddress(customer)}
						</KeyValue>
						{company && (
							<>
								<KeyValue label="CUI" mono>
									{customer.cui} {customer.cui && !isValidCUI(customer.cui) && <span className="text-xs text-amber-600">(verifică)</span>}
								</KeyValue>
								<KeyValue label="Reg. Com.">{customer.regCom}</KeyValue>
								<KeyValue label="Persoană de contact">{customer.contactName}</KeyValue>
								{customer.iban && <KeyValue label="IBAN" mono>{formatIBAN(customer.iban)}</KeyValue>}
							</>
						)}
					</KeyValueGrid>
					{customer.notes && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{customer.notes}</p>}

					<section className="space-y-2">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold">Mașini ({cars.length})</h3>
							<Button size="sm" variant="ghost" className="max-md:h-11" onClick={() => openSheet("vehicle", { customerId: customer.id })}>
								<Plus /> Adaugă
							</Button>
						</div>
						{cars.length ? (
							<ul className="grid gap-2 sm:grid-cols-2">
								{cars.map((car) => (
									<li key={car.id}>
										<button type="button" onClick={() => openSheet("vehicle-view", { id: car.id })} className="flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50">
											<Plate value={car.plate} size="sm" />
											<span className="min-w-0 flex-1 truncate text-sm">{vehicleName(car)}</span>
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="flex items-center gap-2 text-sm text-muted-foreground">
								<CarFront className="size-4" aria-hidden /> Nicio mașină.
							</p>
						)}
					</section>

					<section className="space-y-2">
						<h3 className="text-sm font-semibold">Ultimele lucrări</h3>
						{orders.length ? (
							<ul className="divide-y rounded-xl border">
								{orders.slice(0, 5).map((o) => (
									<li key={o.id}>
										<button type="button" onClick={() => goto(`/work-orders/detail/?id=${o.id}`)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/50">
											<span className="w-12 shrink-0 font-mono text-xs font-medium">{fmtWorkOrder(o.number)}</span>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm">{o.complaint || o.lines[0]?.description || "Lucrare"}</span>
												<span className="block truncate text-xs text-muted-foreground">{fmtDate(o.createdAt)}</span>
											</span>
											<StatusBadge map={WORK_ORDER_STATUS} value={o.status} size="sm" />
											<Money value={computeTotals(o.lines, { vatPayer: settings.invoicing.vatPayer }).gross} decimals={0} className="w-20 text-right text-sm max-sm:hidden" />
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">Nicio lucrare încă. {plural(docs.length, "factură", "facturi")}.</p>
						)}
					</section>
				</div>
			)}
		</DetailSheet>
	);
}
