import {
	BellRing,
	Boxes,
	CalendarDays,
	CarFront,
	ChartColumn,
	House,
	LayoutGrid,
	ReceiptText,
	Search,
	Settings,
	Sun,
	Users,
	Wrench,
} from "lucide-react";

import { BellRinging, CalendarDots, CarProfile, ChartBar, GearSix, Package, Receipt, Sun as SunGlyph, UsersThree, Wrench as WrenchGlyph } from "@phosphor-icons/react";
import { AREA } from "@/lib/colors";

// The side nav (docs/DESIGN.md §2): one short list, its groups set apart only by a gap. `glyph` is its icon (outlined,
// filled when selected); `icon` is what the phone and the search show. Each item's area colour is on the selected icon.
export const NAV = [
	{ href: "/", label: "Azi", icon: Sun, glyph: SunGlyph, group: "Operațiuni", area: AREA.azi },
	{ href: "/work-orders/", label: "Atelier", icon: Wrench, glyph: WrenchGlyph, group: "Operațiuni", badge: "openOrders", area: AREA.lucrare },
	{ href: "/calendar/", label: "Agendă", icon: CalendarDays, glyph: CalendarDots, group: "Operațiuni", badge: "toConfirm", area: AREA.programare, matches: ["/calendar", "/appointments"] },
	{ href: "/invoices/", label: "Facturi", icon: ReceiptText, glyph: Receipt, group: "Bani", area: AREA.factura },
	{ href: "/reports/", label: "Rapoarte", icon: ChartColumn, glyph: ChartBar, group: "Bani", area: AREA.rapoarte },
	{ href: "/customers/", label: "Clienți", icon: Users, glyph: UsersThree, group: "Oameni și mașini", area: AREA.clienti },
	{ href: "/vehicles/", label: "Mașini", icon: CarFront, glyph: CarProfile, group: "Oameni și mașini", area: AREA.masini },
	{ href: "/reminders/", label: "De contactat", icon: BellRing, glyph: BellRinging, group: "Oameni și mașini", badge: "reminders", urgent: true, area: AREA.contact },
	{ href: "/catalog/", label: "Catalog", icon: Boxes, glyph: Package, group: "Atelier", area: AREA.catalog },
	{ href: "/settings/", label: "Setări", icon: Settings, glyph: GearSix, group: "Atelier", area: AREA.setari },
];

/** The phone's tab bar, as the iPhone app's: Azi · Atelier · Agendă · Registru, and Caută (opens the search). */
// The phone's tabs, with the iPhone app's symbols (house, wrench, calendar, grid, magnifier).
export const TABS = [
	{ ...NAV[0], icon: House },
	{ ...NAV[1], icon: Wrench },
	{ ...NAV[2], icon: CalendarDays, badge: undefined },
	{ href: "/more/", label: "Registru", icon: LayoutGrid, badge: "reminders", matches: ["/customers", "/vehicles", "/reminders", "/catalog", "/reports", "/settings", "/design", "/more", "/invoices"] },
	{ search: true, label: "Căutare", icon: Search },
];

/** The two Programări pages, as the phone's tab and the switch at the top of both name them. */
export const PROGRAMARI_PAGES = ["/calendar/", "/appointments/"];

export function isActive(item, pathname) {
	if (item.matches) return item.matches.some((m) => pathname.startsWith(m));
	if (item.href === "/") return pathname === "/";
	return pathname.startsWith(item.href.replace(/\/$/, ""));
}
