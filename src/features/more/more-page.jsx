"use client";

import { Bell, CarFront, ChartColumn, FileText, Package, Settings, Users } from "lucide-react";
import { Page } from "@/components/ds/page";
import { PageTitle } from "@/components/ds/blocks";
import { IosGroup, IosRow } from "@/components/ds/ios";
import { AccountMenu } from "@/components/shell/account-menu";
import { IOS_AREA as AREA } from "@/lib/colors";
import { formatMoney } from "@/lib/format";
import { useCollection, useSettings, useToday } from "@/lib/store/hooks";
import { selectReminders, selectToCollect } from "@/lib/store/selectors";

// Registru, as the iPhone app's (ios-native/Garaj/Views/RegistryView.swift): the collections in three groups, each with
// its area's colour and, where it says something, a value (what is to collect, how many).
const count = (n) => n.toLocaleString("ro-RO");

export function MorePage() {
	const today = useToday();
	const settings = useSettings();
	const invoices = useCollection("invoices");
	const payments = useCollection("payments");
	const customers = useCollection("customers");
	const vehicles = useCollection("vehicles");
	const reminders = selectReminders(today, vehicles, customers, invoices, payments, useCollection("workOrders"), useCollection("appointments"), useCollection("contacts"));
	const due = today ? selectToCollect(invoices, payments, today).due : 0;
	return (
		<Page width="narrow" className="space-y-7">
			{/* The account sits in the nav row: the phone has no top bar, as on the iPhone. */}
			<PageTitle title="Registru" actions={<AccountMenu className="size-11 border-0 bg-transparent" />} />
			<IosGroup title="Bani" subtitle={due > 0 ? "De încasat, pe facturi emise" : undefined}>
				<IosRow href="/invoices/" icon={FileText} color={AREA.facturi} title="Facturi" value={due > 0 ? formatMoney(due, settings.currency, { decimals: 0 }) : undefined} />
				<IosRow href="/reports/" icon={ChartColumn} color={AREA.rapoarte} title="Rapoarte" />
			</IosGroup>
			<IosGroup title="Oameni și mașini">
				<IosRow href="/customers/" icon={Users} color={AREA.clienti} title="Clienți" value={count(Object.keys(customers).length)} />
				<IosRow href="/vehicles/" icon={CarFront} color={AREA.masini} title="Mașini" value={count(Object.keys(vehicles).length)} />
				<IosRow href="/reminders/" icon={Bell} color={AREA.contact} title="De contactat" value={count(reminders.length)} />
			</IosGroup>
			<IosGroup title="Atelier">
				<IosRow href="/catalog/" icon={Package} color={AREA.catalog} title="Catalog" />
				<IosRow href="/settings/" icon={Settings} color={AREA.setari} title="Setări" />
			</IosGroup>
		</Page>
	);
}
