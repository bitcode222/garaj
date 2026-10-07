import {
	BellRing,
	Boxes,
	CalendarDays,
	CarFront,
	ChartColumn,
	LayoutGrid,
	ReceiptText,
	Settings,
	Sun,
	Users,
	Wrench,
} from "lucide-react";

export const NAV = [
	{ href: "/", label: "Azi", icon: Sun, group: "Operațiuni" },
	{ href: "/calendar/", label: "Programări", icon: CalendarDays, group: "Operațiuni" },
	{ href: "/work-orders/", label: "Lucrări", icon: Wrench, group: "Operațiuni", badge: "openOrders" },
	{ href: "/invoices/", label: "Facturi", icon: ReceiptText, group: "Operațiuni" },
	{ href: "/customers/", label: "Clienți", icon: Users, group: "Relații" },
	{ href: "/vehicles/", label: "Mașini", icon: CarFront, group: "Relații" },
	{ href: "/reminders/", label: "De contactat", icon: BellRing, group: "Relații", badge: "reminders" },
	{ href: "/catalog/", label: "Catalog", icon: Boxes, group: "Administrare" },
	{ href: "/reports/", label: "Rapoarte", icon: ChartColumn, group: "Administrare" },
	{
		href: "/settings/",
		label: "Setări",
		icon: Settings,
		group: "Administrare",
		// Sub-items: shown under the item while its page is open, jump to a section.
		children: [
			{ href: "/settings/#service", label: "Service" },
			{ href: "/settings/#facturare", label: "Facturare" },
			{ href: "/settings/#echipa", label: "Echipă" },
			{ href: "/settings/#aspect", label: "Aspect" },
			{ href: "/settings/#date", label: "Date" },
		],
	},
];

export const TABS = [
	NAV[0],
	NAV[1],
	NAV[2],
	NAV[3],
	{ href: "/more/", label: "Mai mult", icon: LayoutGrid, badge: "reminders", matches: ["/customers", "/vehicles", "/reminders", "/catalog", "/reports", "/settings", "/design", "/more"] },
];

export function isActive(item, pathname) {
	if (item.matches) return item.matches.some((m) => pathname.startsWith(m));
	if (item.href === "/") return pathname === "/";
	return pathname.startsWith(item.href.replace(/\/$/, ""));
}
