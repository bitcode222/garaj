"use client";

import Link from "next/link";
import { useState } from "react";
import { BellRing, Check, ChevronDown, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { ContactActions } from "@/components/ds/contact";
import { EmptyState } from "@/components/ds/data";
import { FilterChips } from "@/components/ds/inputs";
import { Page, PageHeader } from "@/components/ds/page";
import { MakeLogo, PlateTag } from "@/components/ds/make-logo";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { ToneBadge } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatPhone } from "@/domain/customer";
import { formatMoney } from "@/domain/money";
import { reminderMessage } from "@/domain/reminders";
import { vehicleName } from "@/domain/vehicle";
import { fmtDate, fmtTime, plural } from "@/lib/format";
import { REMINDER_TYPES } from "@/lib/labels";
import { logContact } from "@/lib/store/actions";
import { useCollection, useIsReady, useSettings, useToday } from "@/lib/store/hooks";
import { selectReminders } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

// Marketing-style reminders need consent (GDPR); money and pickup notices are service messages.
const NEEDS_CONSENT = new Set(["itp", "rca", "service"]);

function detail(r, invoice, settings) {
	switch (r.type) {
		case "itp":
		case "rca":
			return r.days < 0 ? `a expirat pe ${fmtDate(r.due)} (acum ${-r.days} zile)` : `expiră pe ${fmtDate(r.due)} (în ${r.days} ${r.days === 1 ? "zi" : "zile"})`;
		case "service":
			return r.kmLeft != null && r.kmLeft < 1500 ? `aprox. ${Math.max(0, r.kmLeft).toLocaleString("ro-RO")} km rămași` : `scadentă pe ${fmtDate(r.due)}`;
		case "unpaid":
			return `${formatMoney(r.amount, settings.currency)} · scadentă acum ${-r.days} zile`;
		case "pickup":
			return `gata de ${-r.days} ${-r.days === 1 ? "zi" : "zile"}, încă neridicată`;
		case "tomorrow":
			return `mâine la ${fmtTime(r.start)}`;
		default:
			return "";
	}
}

export function RemindersPage() {
	const ready = useIsReady();
	const today = useToday();
	const settings = useSettings();
	const vehicles = useCollection("vehicles");
	const customers = useCollection("customers");
	const invoices = useCollection("invoices");
	const reminders = selectReminders(
		today,
		vehicles,
		customers,
		invoices,
		useCollection("payments"),
		useCollection("workOrders"),
		useCollection("appointments"),
		useCollection("contacts"),
	);
	const [type, setType] = useState("all");
	const [open, setOpen] = useState(null);

	if (!ready || !today) return <ListPageSkeleton />;

	const counts = { all: reminders.length };
	for (const r of reminders) counts[r.type] = (counts[r.type] ?? 0) + 1;
	const visible = type === "all" ? reminders : reminders.filter((r) => r.type === type);

	const handled = (r, channel, days = 7) => {
		logContact(r.key, { channel, days });
		if (channel === "done") toast.success("Marcat ca rezolvat.");
		if (channel === "snooze") toast.success(`Amânat ${days === 1 ? "o zi" : `${days} zile`}.`);
	};

	return (
		<Page>
			<PageHeader
				title="De contactat"
				description="Clienții de sunat azi: termene ITP și RCA, revizii, restanțe, mașini neridicate."
			/>
			<FilterChips
				className="mb-4"
				value={type}
				onChange={setType}
				options={[
					{ value: "all", label: "Toate", count: counts.all },
					...Object.entries(REMINDER_TYPES)
						.filter(([key]) => counts[key])
						.map(([value, meta]) => ({ value, label: meta.label, tone: meta.tone, count: counts[value] })),
				]}
			/>
			{visible.length ? (
				<ul className="space-y-3">
					{visible.map((r) => {
						const meta = REMINDER_TYPES[r.type];
						const customer = customers[r.customerId];
						const vehicle = vehicles[r.vehicleId];
						const invoice = r.invoiceId ? invoices[r.invoiceId] : null;
						const message = reminderMessage(r, { customer, vehicle, invoice, settings });
						const blocked = NEEDS_CONSENT.has(r.type) && !customer?.marketingConsent;
						const urgent = r.urgency === "expired" || r.urgency === "overdue";
						return (
							<li key={r.key} className={cn("rounded-xl border bg-card p-4", urgent && "border-l-4 border-l-red-500")}>
								<div className="flex flex-wrap items-start gap-3">
									<ToneBadge tone={urgent ? "red" : meta.tone} icon={meta.icon}>
										{meta.label}
									</ToneBadge>
									<div className="min-w-0 flex-1">
										<Link href={`/customers/detail/?id=${customer?.id}`} className="font-medium hover:underline">
											{customer?.name ?? "Client"}
										</Link>
										<p className="text-sm text-muted-foreground">
											{detail(r, invoice, settings)}
											{customer?.phone ? ` · ${formatPhone(customer.phone)}` : " · fără telefon"}
										</p>
									</div>
									{vehicle && (
										<Link href={`/vehicles/detail/?id=${vehicle.id}`} className="flex items-center gap-2 text-sm">
											<MakeLogo make={vehicle.make} className="size-4" />
											<span className="text-muted-foreground max-sm:hidden">{vehicleName(vehicle)}</span>
											<PlateTag value={vehicle.plate} />
										</Link>
									)}
								</div>

								<button
									type="button"
									onClick={() => setOpen(open === r.key ? null : r.key)}
									className="mt-3 flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
									aria-expanded={open === r.key}
								>
									<ChevronDown className={cn("size-3.5 transition-transform", open === r.key && "rotate-180")} aria-hidden />
									Mesaj pregătit
								</button>
								{open === r.key && <p className="mt-2 rounded-lg bg-muted p-3 text-sm whitespace-pre-line">{message}</p>}
								{blocked && (
									<p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
										Clientul nu și-a dat acordul pentru mesaje de reamintire — doar apel telefonic.
									</p>
								)}

								<div className="mt-3 flex flex-wrap items-center gap-2">
									{customer?.phone && (
										<ContactActions
											phone={customer.phone}
											message={message}
											onContact={(channel) => handled(r, channel)}
											className={cn("max-md:w-full", blocked && "[&>a:not(:first-child)]:pointer-events-none [&>a:not(:first-child)]:opacity-40")}
										/>
									)}
									<div className="flex gap-2 max-md:w-full md:ml-auto">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="sm" className="max-md:h-10 max-md:flex-1">
													<Clock3 /> Amână
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuLabel className="text-xs text-muted-foreground">Amână cu</DropdownMenuLabel>
												{[1, 3, 7, 30].map((days) => (
													<DropdownMenuItem key={days} onSelect={() => handled(r, "snooze", days)}>
														{days === 1 ? "O zi" : `${days} zile`}
													</DropdownMenuItem>
												))}
											</DropdownMenuContent>
										</DropdownMenu>
										<Button variant="ghost" size="sm" className="max-md:h-10 max-md:flex-1" onClick={() => handled(r, "done", 30)}>
											<Check /> Rezolvat
										</Button>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			) : (
				<EmptyState icon={BellRing} title="Nimeni de contactat" description={`Toate termenele sunt sub control. Revino mâine — lista se actualizează singură.`} />
			)}
			<p className="mt-6 text-center text-xs text-muted-foreground">{plural(reminders.length, "reamintire activă", "reamintiri active")} · după contact, reapar peste 7 zile dacă nu s-au rezolvat</p>
		</Page>
	);
}
