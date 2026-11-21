"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronRight, ChevronsUpDown, Database, Palette, PanelLeftClose, PanelLeftOpen, Plus, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCollection, useSettings, useStoreValue, useToday } from "@/lib/store/hooks";
import { selectReminders, selectToConfirm } from "@/lib/store/selectors";
import { OPEN_STATUSES } from "@/domain/work-order";
import { haptics } from "@/lib/haptics";
import { useHydrated, useLocalPreference, useNowMinute } from "@/lib/hooks";
import { AREA } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { atMinute } from "@/features/calendar/utils";
import { LogoMark } from "./logo";
import { PageTransition } from "./page-transition";
import { NAV, PROGRAMARI_PAGES, TABS, isActive } from "./nav";
import { QuickCreate } from "./quick-create";
import { NavGlide } from "./nav-glide";
import { openCommandMenu } from "./command-state";
import { AccountMenu } from "./account-menu";
import { ThemeToggle } from "./theme-toggle";
import { KeyHint } from "@/components/ds/blocks";
import { Glass } from "@/components/ds/glass";
import { RunningJobBar } from "@/features/running/running-job";
import { REST_LOOK_KEY, REST_VALUES } from "@/features/common/rest-look";

/** "Caută": the ⌘K window with "Listă", the results page with "File" (docs/DESIGN.md §4). ⌘K itself always opens the window. */
function useOpenSearch() {
	const router = useRouter();
	const [look] = useLocalPreference(REST_LOOK_KEY, REST_VALUES[0], REST_VALUES);
	return () => (look === "tabs" ? router.push("/search/") : openCommandMenu());
}

const CommandMenu = dynamic(() => import("./command-menu").then((m) => m.CommandMenu), { ssr: false });
const GlobalSheets = dynamic(() => import("./global-sheets").then((m) => m.GlobalSheets), { ssr: false });

function useBadges() {
	const today = useToday();
	const workOrders = useCollection("workOrders");
	const reminders = selectReminders(
		today,
		useCollection("vehicles"),
		useCollection("customers"),
		useCollection("invoices"),
		useCollection("payments"),
		workOrders,
		useCollection("appointments"),
		useCollection("contacts"),
	);
	const minute = useNowMinute();
	const appointments = useCollection("appointments");
	let openOrders = 0;
	for (const id in workOrders) if (OPEN_STATUSES.includes(workOrders[id].status)) openOrders++;
	// The same count as Azi's "De confirmat": what waits for a call or a decision.
	const toConfirm = today && minute != null ? selectToConfirm(appointments, atMinute(today, minute)).total : 0;
	return { openOrders, reminders: reminders.length, toConfirm };
}

// Desktop: the sidebar can be folded into the rail (docs/APPOINTMENTS-AND-NAV.md D4): one choice for every
// page (the calendar too), open by default. The choice is put on <html> by a script in the layout before
// the first paint, so a folded sidebar never flashes open, and again on every navigation.
const SIDEBAR_KEY = "garaj.sidebar";

function readSidebar() {
	try {
		return localStorage.getItem(SIDEBAR_KEY) === "rail" ? "rail" : "full";
	} catch {
		return "full";
	}
}

function applySidebar(mode) {
	if (mode === "rail") document.documentElement.dataset.sidebar = "rail";
	else delete document.documentElement.dataset.sidebar;
}

function setSidebar(mode) {
	try {
		localStorage.setItem(SIDEBAR_KEY, mode);
	} catch {
		// private mode: for this page only
	}
	applySidebar(mode);
}

// A count at the row's end: plain grey, or a red pill for what is urgent (De contactat).
const countPill = (count, urgent) =>
	count > 0 ? (
		<span className={cn("min-w-5 text-center text-xs tabular-nums", urgent ? "rounded-full bg-[#ff3b30] px-1.5 leading-[18px] font-semibold text-white" : "text-muted-foreground")}>{count > 99 ? "99+" : count}</span>
	) : null;

/** The shop row: the shop, and a menu for what belongs to it (its settings, the demo data, the theme, the design system). */
function ShopMenu({ shopName, demo }) {
	const { theme, setTheme } = useTheme();
	const mounted = useHydrated();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" className="flex h-9 w-full items-center gap-2 rounded-[8px] px-1.5 text-left transition-colors hover:bg-foreground/[0.04]" aria-label={`${shopName}: meniul service-ului`}>
					<LogoMark />
					<span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{shopName}</span>
					<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-60">
				<DropdownMenuItem asChild>
					<Link href="/settings/#service">
						<Store /> Setările service-ului
					</Link>
				</DropdownMenuItem>
				{demo && (
					<DropdownMenuItem asChild>
						<Link href="/settings/#date">
							<Database /> Date demo
						</Link>
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-xs text-muted-foreground">Temă</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={mounted ? (theme ?? "system") : "system"} onValueChange={setTheme}>
					<DropdownMenuRadioItem value="system">Automată</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="light">Luminoasă</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">Întunecată</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/design/">
						<Palette /> Limbajul de design
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** The route the glass sits on: the one just picked (it moves at once, before the page arrives), else the current one. */
function useGlideTarget(pathname) {
	const [picked, setPicked] = useState(null);
	const waiting = picked?.from === pathname ? picked.href : null;
	useEffect(() => {
		if (!waiting) return;
		// A navigation that never lands doesn't leave the glass on the wrong row.
		const timer = setTimeout(() => setPicked(null), 2500);
		return () => clearTimeout(timer);
	}, [waiting]);
	const pick = (event, href) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button) return;
		setPicked({ href, from: pathname });
	};
	return [waiting ?? NAV.find((item) => isActive(item, pathname))?.href ?? null, pick];
}

/** The selected icon takes its area's colour; Azi's is the ink, so it follows the theme. */
const glyphColor = (item, selected) => (selected && item.area !== AREA.azi ? { color: item.area } : undefined);

/**
 * The desktop side nav: the shop, search, one compact list with its groups set apart by a gap, and one pane of liquid
 * glass that glides to the route you pick.
 */
function Sidebar({ pathname, badges, shopName, demo }) {
	const groups = [...new Set(NAV.map((item) => item.group))];
	const openSearch = useOpenSearch();
	const [target, pick] = useGlideTarget(pathname);
	return (
		<aside data-shell="sidebar" className="fixed inset-y-0 left-0 z-40 hidden w-52 flex-col border-r bg-[color-mix(in_srgb,var(--background)_60%,var(--card))] lg:flex">
			<div className="space-y-1.5 px-2 pt-2 pb-2">
				<ShopMenu shopName={shopName} demo={demo} />
				<button type="button" onClick={openSearch} className="flex h-[30px] w-full min-w-0 items-center gap-2 rounded-[8px] bg-foreground/[0.05] px-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
					<Search className="size-4 shrink-0" aria-hidden />
					<span className="flex-1 truncate text-left">Caută</span>
					<KeyHint>⌘K</KeyHint>
				</button>
			</div>
			<nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Navigare principală">
				<div className="relative space-y-2.5">
					{groups.map((group) => (
						<ul key={group} aria-label={group} className="space-y-px">
							{NAV.filter((item) => item.group === group).map((item) => {
								const selected = target === item.href;
								const count = item.badge ? badges[item.badge] : 0;
								return (
									<li key={item.href}>
										<Link
											href={item.href}
											data-nav-row={item.href}
											aria-current={isActive(item, pathname) ? "page" : undefined}
											onClick={(event) => pick(event, item.href)}
											className={cn("flex h-[30px] items-center gap-2 rounded-[8px] px-2 text-[13px] transition-colors pointer-coarse:h-10", selected ? "font-semibold text-foreground" : "text-foreground/75 hover:bg-foreground/[0.04] hover:text-foreground")}
										>
											<item.glyph weight={selected ? "fill" : "regular"} className={cn("size-[17px] shrink-0", !selected && "text-muted-foreground")} style={glyphColor(item, selected)} aria-hidden />
											<span className="flex-1 truncate">{item.label}</span>
											{countPill(count, item.urgent)}
										</Link>
									</li>
								);
							})}
						</ul>
					))}
					<NavGlide target={target} />
				</div>
			</nav>
			<div className="flex items-center gap-1 px-2 py-1.5">
				<Button variant="ghost" size="icon-sm" className="mr-auto" onClick={() => setSidebar("rail")} aria-label="Restrânge bara laterală" title="Restrânge bara laterală">
					<PanelLeftClose />
				</Button>
				{demo && (
					<Link href="/settings/#date" className="rounded-full border border-dashed px-2 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground">
						Date demo
					</Link>
				)}
				<ThemeToggle />
			</div>
		</aside>
	);
}

function Rail({ pathname, badges }) {
	const [target, pick] = useGlideTarget(pathname);
	return (
		<aside data-shell="rail" className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center border-r bg-background pt-3 pb-3 md:flex lg:hidden">
			<Link href="/" aria-label="Azi" className="mb-3">
				<LogoMark />
			</Link>
			<div className="mb-3 flex flex-col gap-1.5">
				<Button variant="ghost" size="icon" onClick={openCommandMenu} aria-label="Caută">
					<Search />
				</Button>
				<QuickCreate side="right">
					<Button size="icon" aria-label="Nou">
						<Plus />
					</Button>
				</QuickCreate>
			</div>
			<nav className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="Navigare principală">
				<div className="relative flex flex-col items-center gap-1">
					{NAV.map((item) => {
						const selected = target === item.href;
						const count = item.badge ? badges[item.badge] : 0;
						return (
							<Link
								key={item.href}
								href={item.href}
								data-nav-row={item.href}
								title={item.label}
								aria-current={isActive(item, pathname) ? "page" : undefined}
								onClick={(event) => pick(event, item.href)}
								className={cn("relative flex w-14 flex-col items-center gap-0.5 rounded-[8px] py-1.5 text-[10px] leading-3 transition-colors", selected ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
							>
								<item.glyph weight={selected ? "fill" : "regular"} className="size-[18px]" style={glyphColor(item, selected)} aria-hidden />
								<span className="max-w-full truncate px-0.5">{item.label}</span>
								{count > 0 && <span className={cn("absolute top-1 right-2 size-1.5 rounded-full", item.urgent ? "bg-[#ff3b30]" : "bg-muted-foreground")} aria-hidden />}
							</Link>
						);
					})}
					<NavGlide target={target} />
				</div>
			</nav>
			{/* Folded on a desktop: the way back to the full sidebar (a tablet has no room for it). */}
			<Button variant="ghost" size="icon-sm" className="mb-1 hidden lg:inline-flex" onClick={() => setSidebar("full")} aria-label="Extinde bara laterală" title="Extinde bara laterală">
				<PanelLeftOpen />
			</Button>
			<ThemeToggle />
		</aside>
	);
}


const PROGRAMARI_KEY = "garaj.programari";
const PHONE = "(max-width: 767px)"; // the tab bar exists only there

// The tab in view sits in a grey pill, its icon and name orange, as the iPhone's tab bar.
const tabClass = (active) =>
	cn(
		"touch-none-callout relative flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-[color,background-color,transform,opacity] duration-150 active:scale-95 active:opacity-70",
		active ? "bg-foreground/[0.07] text-brand" : "text-foreground",
	);

/** The phone's tab bar, as the iPhone app's: a floating glass capsule, Azi · Atelier · Agendă · Registru · Căutare. */
function TabBar({ pathname, badges }) {
	// Agendă opens where it was left; the first time on the Listă, as the iPhone's.
	const [programari] = useLocalPreference(PROGRAMARI_KEY, "/appointments/", PROGRAMARI_PAGES);
	return (
		<Glass
			as="nav"
			preset="capsule"
			media={PHONE}
			data-print="hide"
			className="fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.625rem)] z-40 h-[62px] rounded-full border bg-card/90 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.3)] backdrop-blur-xl md:hidden"
			aria-label="Navigare principală"
		>
			<ul className="grid h-full grid-cols-5 p-1">
				{TABS.map((item) => {
					// Căutare is a tab with its page, as on the iPhone (⌘K stays the window on a desktop).
					if (item.search) {
						const here = pathname.startsWith("/search");
						return (
							<li key="search">
								<Link href="/search/" aria-current={here ? "page" : undefined} onClick={() => haptics.selection()} className={tabClass(here)}>
									<item.icon className={cn("size-6", here ? "stroke-[2.25]" : "stroke-[1.9]")} aria-hidden />
									{item.label}
								</Link>
							</li>
						);
					}
					const active = isActive(item, pathname);
					const count = item.badge ? badges[item.badge] : 0;
					return (
						<li key={item.href}>
							<Link
								href={item.href === "/calendar/" ? programari : item.href}
								aria-current={active ? "page" : undefined}
								onClick={(event) => {
									haptics.selection();
									// Like a native tab bar: tapping the current tab goes back to the top.
									if (active && pathname.replace(/\/$/, "") === item.href.replace(/\/$/, "")) {
										event.preventDefault();
										window.scrollTo({ top: 0, behavior: "smooth" });
									}
								}}
								className={tabClass(active)}
							>
								<span className="relative">
									<item.icon className={cn("size-6", active ? "stroke-[2.25]" : "stroke-[1.9]")} aria-hidden />
									{count > 0 && (
										<span className="absolute -top-1 -right-2.5 min-w-4 rounded-full bg-[#ff3b30] px-1 text-center text-[9px] leading-4 font-semibold text-white tabular-nums">
											{count > 99 ? "99+" : count}
										</span>
									)}
								</span>
								{item.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</Glass>
	);
}

/** Desktop and tablet: a thin bar over the page, with where you are, the black "Nou" and the account. It scrolls with the page. */
function Toolbar({ pathname }) {
	const item = NAV.find((entry) => isActive(entry, pathname));
	const group = item && item.group !== NAV[0].group ? item.group : null;
	return (
		<div data-print="hide" className="hidden h-12 items-center gap-2 border-b bg-card px-4 md:flex lg:px-6">
			<p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] text-muted-foreground">
				{group && (
					<>
						<span>{group}</span>
						<ChevronRight className="size-3.5" aria-hidden />
					</>
				)}
				<span className="font-medium text-foreground">{item?.label ?? "Garaj"}</span>
			</p>
			<QuickCreate>
				<Button size="sm" aria-label="Nou">
					<Plus /> Nou
				</Button>
			</QuickCreate>
			<AccountMenu className="size-8 border bg-card hover:bg-accent" />
		</div>
	);
}

export function AppShell({ children }) {
	const pathname = usePathname() ?? "/";
	const settings = useSettings();
	const demo = useStoreValue("demo");
	const badges = useBadges();
	const [, setProgramari] = useLocalPreference(PROGRAMARI_KEY, PROGRAMARI_PAGES[0], PROGRAMARI_PAGES);
	useEffect(() => {
		const page = PROGRAMARI_PAGES.find((href) => pathname.startsWith(href.replace(/\/$/, "")));
		if (page) setProgramari(page);
	}, [pathname, setProgramari]);
	// On every navigation, the one choice, before the paint.
	useLayoutEffect(() => {
		applySidebar(readSidebar());
	}, [pathname]);
	// ⌘K (Ctrl+K elsewhere) opens the search from anywhere, as the sidebar's field says.
	useEffect(() => {
		const onKey = (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				openCommandMenu();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return (
		<>
			<Sidebar pathname={pathname} badges={badges} shopName={settings.shop.name} demo={demo} />
			<Rail pathname={pathname} badges={badges} />
			<main
				id="main"
				className="min-h-dvh pt-[var(--safe-top)] pb-[calc(var(--tabbar-h)+var(--safe-bottom))] md:pt-0 md:pb-0 md:pl-16 lg:pl-52"
			>
				<Toolbar pathname={pathname} />
				<PageTransition>{children}</PageTransition>
				<RunningJobBar />
			</main>
			<TabBar pathname={pathname} badges={badges} />
			<CommandMenu />
			<GlobalSheets />
		</>
	);
}
