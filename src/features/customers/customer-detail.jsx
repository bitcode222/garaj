"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, CarFront, EllipsisVertical, FileSearch, Pencil, Plus, ReceiptText, Trash2, UserRound, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ds/card";
import { useConfirm } from "@/components/ds/confirm";
import { ContactActions } from "@/components/ds/contact";
import { EmptyState, Initials, KeyValue, KeyValueGrid, Money, Stat } from "@/components/ds/data";
import { ListRow } from "@/components/ds/list";
import { Page, PageHeader, SplitView } from "@/components/ds/page";
import { MakeLogo, PlateTag } from "@/components/ds/make-logo";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { StatusBadge, ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatIBAN, formatPhone, isValidCUI, joinAddress } from "@/domain/customer";
import { formatInvoiceNumber } from "@/domain/invoice";
import { computeTotals } from "@/domain/lines";
import { deadline, vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtWorkOrder, plural } from "@/lib/format";
import { useQueryId } from "@/lib/hooks";
import { CUSTOMER_TYPES, DEADLINE_STATUS, INVOICE_STATE, WORK_ORDER_STATUS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { deleteCustomer } from "@/lib/store/actions";
import { useCollection, useEntity, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectInvoiceStates, selectInvoicesByCustomer, selectVehiclesByCustomer, selectWorkOrdersByCustomer } from "@/lib/store/selectors";

export function CustomerDetail() {
	const id = useQueryId();
	const ready = useIsReady();
	const customer = useEntity("customers", id);
	if (!ready) return <DetailPageSkeleton />;
	if (!customer) {
		return (
			<Page>
				<PageHeader title="Client" back={{ href: "/customers/", label: "Clienți" }} />
				<EmptyState icon={FileSearch} title="Clientul nu există" description="A fost șters sau linkul este greșit." />
			</Page>
		);
	}
	return <Customer customer={customer} />;
}

function Customer({ customer }) {
	const router = useRouter();
	const confirm = useConfirm();
	const today = useToday();
	const settings = useSettings();
	const vehicles = useCollection("vehicles");
	const workOrders = useCollection("workOrders");
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const cars = selectVehiclesByCustomer(vehicles).get(customer.id) ?? [];
	const orders = selectWorkOrdersByCustomer(workOrders).get(customer.id) ?? [];
	const docs = selectInvoicesByCustomer(invoices).get(customer.id) ?? [];
	const states = today ? selectInvoiceStates(invoices, payments, today) : new Map();
	const balance = docs.reduce((sum, i) => sum + (states.get(i.id)?.balance ?? 0), 0);
	const spent = docs.reduce((sum, i) => (i.status !== "draft" ? sum + i.totals.gross : sum), 0);
	const company = customer.type === "company";

	const remove = async () => {
		if (!(await confirm({ title: `Ștergi clientul ${customer.name}?`, description: "Se șterg și mașinile și programările lui.", confirmLabel: "Șterge", destructive: true }))) return;
		try {
			deleteCustomer(customer.id);
			toast.success("Client șters.");
			router.replace("/customers/");
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<Page width="wide">
			<PageHeader
				back={{ href: "/customers/", label: "Clienți" }}
				title={customer.name}
				meta={
					<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<ToneBadge tone={company ? "purple" : "blue"} icon={UserRound}>
							{CUSTOMER_TYPES[customer.type] ?? CUSTOMER_TYPES.person}
						</ToneBadge>
						<span>client din {fmtDate(customer.createdAt, "MMMM yyyy")}</span>
						{!customer.marketingConsent && <ToneBadge tone="neutral" size="sm">fără acord reamintiri</ToneBadge>}
					</div>
				}
				actions={
					<>
						<Button variant="outline" onClick={() => openSheet("appointment", { vehicleId: cars[0]?.id })}>
							<CalendarPlus /> <span className="max-sm:hidden">Programează</span>
						</Button>
						<Button variant="outline" onClick={() => openSheet("customer", { id: customer.id })}>
							<Pencil /> <span className="max-sm:hidden">Editează</span>
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon" aria-label="Mai multe">
									<EllipsisVertical />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem variant="destructive" onSelect={remove}>
									<Trash2 /> Șterge clientul
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</>
				}
			/>

			<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Stat label="Vizite" value={orders.length} hint={orders[0] ? `ultima ${fmtDate(orders[0].createdAt)}` : "nicio vizită"} icon={Wrench} />
				<Stat label="Total facturat" value={<Money value={spent} decimals={0} />} hint={plural(docs.filter((d) => d.status !== "draft").length, "factură", "facturi")} icon={ReceiptText} />
				<Stat label="Sold de plată" value={<Money value={balance} decimals={0} />} icon={ReceiptText} tone={balance > 0 ? "red" : "green"} />
				<Stat label="Mașini" value={cars.length} icon={CarFront} />
			</div>

			<SplitView
				main={
					<>
						<Card>
							<CardHeader
								title="Mașini"
								icon={CarFront}
								action={
									<Button size="sm" variant="outline" onClick={() => openSheet("vehicle", { customerId: customer.id })}>
										<Plus /> Adaugă
									</Button>
								}
							/>
							<CardContent className="pt-3">
								{cars.length ? (
									<ul className="grid gap-3 sm:grid-cols-2">
										{cars.map((car) => {
											const itp = today ? deadline(car.itpExpiry, today) : { status: "unknown" };
											const rca = today ? deadline(car.rcaExpiry, today) : { status: "unknown" };
											return (
												<li key={car.id}>
													<Link href={`/vehicles/detail/?id=${car.id}`} className="block rounded-xl border p-3 transition-colors hover:bg-accent/50">
														<div className="flex items-center justify-between gap-2">
															<span className="flex min-w-0 items-center gap-2">
																<MakeLogo make={car.make} />
																<span className="truncate text-sm font-medium">{vehicleName(car)}</span>
															</span>
															<span className="text-xs text-muted-foreground">{car.year}</span>
														</div>
														<div className="mt-2 flex flex-wrap items-center gap-1.5">
															<PlateTag value={car.plate} />
															<ToneBadge tone={DEADLINE_STATUS[itp.status].tone} size="sm">ITP {car.itpExpiry ? fmtDate(car.itpExpiry, "dd.MM.yy") : "—"}</ToneBadge>
															<ToneBadge tone={DEADLINE_STATUS[rca.status].tone} size="sm">RCA {car.rcaExpiry ? fmtDate(car.rcaExpiry, "dd.MM.yy") : "—"}</ToneBadge>
														</div>
													</Link>
												</li>
											);
										})}
									</ul>
								) : (
									<EmptyState compact icon={CarFront} title="Nicio mașină" action={<Button size="sm" onClick={() => openSheet("vehicle", { customerId: customer.id })}>Adaugă mașină</Button>} />
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Lucrări" icon={Wrench} description={plural(orders.length, "lucrare", "lucrări")} />
							<CardContent className="px-0 pt-3 md:px-0">
								{orders.length ? (
									<ul className="divide-y border-y">
										{orders.slice(0, 12).map((o) => (
											<li key={o.id}>
												<ListRow href={`/work-orders/detail/?id=${o.id}`}>
													<span className="w-14 shrink-0 font-mono text-xs font-medium">{fmtWorkOrder(o.number)}</span>
													<span className="min-w-0 flex-1">
														<span className="block truncate text-sm">{o.complaint || o.lines[0]?.description || "Lucrare"}</span>
														<span className="block text-xs text-muted-foreground">
															{fmtDate(o.createdAt)} · {vehicleName(vehicles[o.vehicleId])}
														</span>
													</span>
													<StatusBadge map={WORK_ORDER_STATUS} value={o.status} size="sm" />
													<Money value={computeTotals(o.lines, { vatPayer: settings.invoicing.vatPayer }).gross} decimals={0} className="w-20 text-right text-sm max-sm:hidden" />
												</ListRow>
											</li>
										))}
									</ul>
								) : (
									<p className="px-4 text-sm text-muted-foreground md:px-5">Nicio lucrare încă.</p>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader title="Facturi" icon={ReceiptText} description={balance > 0 ? "Are sold de plată" : undefined} />
							<CardContent className="px-0 pt-3 md:px-0">
								{docs.length ? (
									<ul className="divide-y border-y">
										{docs.slice(0, 12).map((inv) => (
											<li key={inv.id}>
												<ListRow href={`/invoices/detail/?id=${inv.id}`}>
													<span className="w-24 shrink-0 font-mono text-xs font-medium">{formatInvoiceNumber(inv.series, inv.number)}</span>
													<span className="flex-1 text-sm text-muted-foreground">{fmtDate(inv.issueDate)}</span>
													{states.get(inv.id) && <StatusBadge map={INVOICE_STATE} value={states.get(inv.id).state} size="sm" />}
													<Money value={inv.totals?.gross ?? 0} className="w-24 text-right text-sm" />
												</ListRow>
											</li>
										))}
									</ul>
								) : (
									<p className="px-4 text-sm text-muted-foreground md:px-5">Nicio factură încă.</p>
								)}
							</CardContent>
						</Card>
					</>
				}
				aside={
					<Card>
						<CardContent className="space-y-5">
							<div className="flex items-center gap-3">
								<Initials name={customer.name} tone={company ? "purple" : "blue"} size="lg" />
								<div className="min-w-0">
									<p className="truncate font-semibold">{customer.name}</p>
									<p className="text-sm text-muted-foreground">{formatPhone(customer.phone) || "Fără telefon"}</p>
								</div>
							</div>
							<ContactActions phone={customer.phone} message={`Bună ziua! ${settings.shop.name} vă contactează.`} />
							<KeyValueGrid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-1">
								<KeyValue label="Email">{customer.email || "—"}</KeyValue>
								<KeyValue label="Adresă">{joinAddress(customer) || "—"}</KeyValue>
								{company && (
									<>
										<KeyValue label="CUI" mono>
											{customer.cui || "—"} {customer.cui && !isValidCUI(customer.cui) && <span className="text-xs text-amber-600">(verifică)</span>}
										</KeyValue>
										<KeyValue label="Reg. Com.">{customer.regCom || "—"}</KeyValue>
										<KeyValue label="Persoană de contact">{customer.contactName || "—"}</KeyValue>
										{customer.iban && <KeyValue label="IBAN" mono>{formatIBAN(customer.iban)}</KeyValue>}
									</>
								)}
							</KeyValueGrid>
							{customer.notes && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{customer.notes}</p>}
						</CardContent>
					</Card>
				}
			/>
		</Page>
	);
}
