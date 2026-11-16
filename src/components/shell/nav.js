import {
	BellRing,
	Boxes,
	CalendarDays,
	CarFront,
	ChartColumn,
	LayoutGrid,
	ReceiptText,
	Search,
	Settings,
	Sun,
	Users,
	Wrench,
} from "lucide-react";

import { AREA } from "@/lib/colors";

// The sidebar (docs/DESIGN.md §2): Azi, Atelier, Agendă, then Bani · Oameni și mașini · Atelier. Each item keeps its
// area's colour (src/lib/colors.js), shown only on the current page's icon.
export const NAV = [
	{ href: "/", label: "Azi", icon: Sun, group: "Operațiuni", area: AREA.azi },
	{ href: "/work-orders/", label: "Atelier", icon: Wrench, group: "Operațiuni", badge: "openOrders", area: AREA.lucrare },
	{
		href: "/calendar/",
		label: "Agendă",
		icon: CalendarDays,
		group: "Operațiuni",
		area: AREA.programare,
		matches: ["/calendar", "/appointments"],
		// Two pages (docs/APPOINTMENTS-AND-NAV.md D2): pressing the item opens the first.
		children: [
			{ href: "/calendar/", label: "Calendar" },
			{ href: "/appointments/", label: "Toate programările", badge: "toConfirm" },
		],
	},
	{ href: "/invoices/", label: "Facturi", icon: ReceiptText, group: "Bani", area: AREA.factura },
	{ href: "/reports/", label: "Rapoarte", icon: ChartColumn, group: "Bani", area: AREA.rapoarte },
	{ href: "/customers/", label: "Clienți", icon: Users, group: "Oameni și mașini", area: AREA.clienti },
	{ href: "/vehicles/", label: "Mașini", icon: CarFront, group: "Oameni și mașini", area: AREA.masini },
	{ href: "/reminders/", label: "De contactat", icon: BellRing, group: "Oameni și mașini", badge: "reminders", urgent: true, area: AREA.contact },
	{ href: "/catalog/", label: "Catalog", icon: Boxes, group: "Atelier", area: AREA.catalog },
	{
		href: "/settings/",
		label: "Setări",
		icon: Settings,
		group: "Atelier",
		area: AREA.setari,
		// Sub-items: sections of its one page.
		children: [
			{ href: "/settings/#service", label: "Service" },
			{ href: "/settings/#facturare", label: "Facturare" },
			{ href: "/settings/#echipa", label: "Echipă" },
			{ href: "/settings/#aspect", label: "Aspect" },
			{ href: "/settings/#date", label: "Date" },
		],
	},
];

/** The phone's tab bar, as the iPhone app's: Azi · Atelier · Agendă · Registru, and Caută (opens the search). */
export const TABS = [
	NAV[0],
	NAV[1],
	NAV[2],
	{ href: "/more/", label: "Registru", icon: LayoutGrid, badge: "reminders", matches: ["/customers", "/vehicles", "/reminders", "/catalog", "/reports", "/settings", "/design", "/more", "/invoices"] },
	{ search: true, label: "Caută", icon: Search },
];

/** The two Programări pages, as the phone's tab and the switch at the top of both name them. */
export const PROGRAMARI_PAGES = ["/calendar/", "/appointments/"];

export function isActive(item, pathname) {
	if (item.matches) return item.matches.some((m) => pathname.startsWith(m));
	if (item.href === "/") return pathname === "/";
	return pathname.startsWith(item.href.replace(/\/$/, ""));
}
