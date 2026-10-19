"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { useTheme } from "next-themes";
import { ChevronRight, ChevronsUpDown, Database, History, Palette, PanelLeftClose, PanelLeftOpen, Plus, Search, Store } from "lucide-react";
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
import { Kbd } from "@/components/ds/data";
import { useCollection, useSettings, useStoreValue, useToday } from "@/lib/store/hooks";
import { selectReminders, selectToConfirm } from "@/lib/store/selectors";
import { OPEN_STATUSES } from "@/domain/work-order";
import { haptics } from "@/lib/haptics";
import { useHydrated, useLocalPreference, useNowMinute } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { atMinute } from "@/features/calendar/utils";
import { LogoMark } from "./logo";
import { PageTransition } from "./page-transition";
import { NAV, PROGRAMARI_PAGES, TABS, isActive } from "./nav";
import { QuickCreate } from "./quick-create";
import { useRecentRecords } from "./recents";
import { openCommandMenu } from "./command-state";
import { ThemeToggle } from "./theme-toggle";

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

const OPEN_KEY = "garaj.sidebar.open"; // which groups were opened or closed by hand: { [key]: boolean }
function parseOpen(text) {
	try {
		const value = JSON.parse(text);
		return value && typeof value === "object" ? value : {};
	} catch {
		return {};
	}
}

const countPill = (count) =>
	count > 0 ? <span className="min-w-5 rounded-full bg-muted px-1.5 text-center text-2xs leading-5 font-medium text-muted-foreground tabular-nums">{count > 99 ? "99+" : count}</span> : null;

/** The shop row: the shop, and a menu for what belongs to it (its settings, the demo data, the theme, the design system). */
function ShopMenu({ shopName, demo }) {
	const { theme, setTheme } = useTheme();
	const mounted = useHydrated();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-accent/60" aria-label={`${shopName}: meniul service-ului`}>
					<LogoMark />
					<span className="min-w-0 flex-1 leading-tight">
						<span className="block truncate text-sm font-semibold">{shopName}</span>
						<span className="block text-2xs text-muted-foreground">Garaj · service auto</span>
					</span>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
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
						<Palette /> Design system
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** Children under a guide line, opening and closing with a short height transition (and out of the tab order while closed). */
function Children({ open, label, children }) {
	return (
		<div className={cn("grid transition-[grid-template-rows] duration-200 ease-(--ease-soft) motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} inert={!open}>
			<ul aria-label={label} className="ml-[1.3125rem] space-y-0.5 overflow-hidden border-l pl-2.5 [&>li:first-child]:mt-0.5 [&>li:last-child]:mb-1">
				{children}
			</ul>
		</div>
	);
}

const rowClass = (pill) => cn("flex h-10 items-center rounded-lg transition-colors", pill ? "bg-accent" : "hover:bg-accent/60");

/** A group of items that opens and closes (its parent's chevron, or the whole row when it is not a page). */
function Chevron({ open }) {
	return <ChevronRight className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-90")} aria-hidden />;
}

function NavItem({ item, pathname, badges, open, onToggle }) {
	const active = isActive(item, pathname);
	const count = item.badge ? badges[item.badge] : 0;
	// A child that is a page of its own carries the pill; the parent keeps only the weight.
	const childActive = item.children?.find((child) => !child.href.includes("#") && pathname.startsWith(child.href.replace(/\/$/, "")));
	return (
		<li>
			<div className={rowClass(active && !childActive)}>
				<Link href={item.href} aria-current={active && !childActive ? "page" : undefined} className={cn("flex h-full min-w-0 flex-1 items-center gap-3 pl-3 text-sm", item.children ? "pr-1" : "pr-3", active && "font-medium")}>
					<item.icon className={cn("size-[18px] shrink-0", active ? "text-foreground" : "text-muted-foreground")} aria-hidden />
					<span className="flex-1 truncate">{item.label}</span>
					{countPill(count)}
				</Link>
				{item.children && (
					<button type="button" onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Ascunde" : "Arată"} paginile din ${item.label}`} className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent">
						<Chevron open={open} />
					</button>
				)}
			</div>
			{item.children && (
				<Children open={open} label={item.label}>
					{item.children.map((child) => {
						const here = child === childActive;
						return (
							<li key={child.href}>
								<Link href={child.href} aria-current={here ? "page" : undefined} className={cn("flex h-9 items-center gap-2 rounded-lg px-3 text-sm transition-colors", here ? "bg-accent font-medium" : "hover:bg-accent/60")}>
									<span className="flex-1 truncate">{child.label}</span>
									{countPill(child.badge ? badges[child.badge] : 0)}
								</Link>
							</li>
						);
					})}
				</Children>
			)}
		</li>
	);
}

/** "Recente" (D3): the records opened last, two lines each, as Cloudflare's. */
function RecentItems({ open, onToggle }) {
	const records = useRecentRecords();
	if (!records.length) return null;
	return (
		<li>
			<button type="button" onClick={onToggle} aria-expanded={open} className={cn(rowClass(false), "w-full gap-3 px-3 text-left text-sm")}>
				<History className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
				<span className="flex-1 truncate">Recente</span>
				<Chevron open={open} />
			</button>
			<Children open={open} label="Recente">
				{records.map((record) => (
					<li key={record.key}>
						<button type="button" onClick={record.open} className="flex w-full flex-col rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-accent/60">
							<span className="w-full truncate text-sm">{record.title}</span>
							<span className="w-full truncate text-xs text-muted-foreground">{record.subtitle}</span>
						</button>
					</li>
				))}
			</Children>
		</li>
	);
}

/**
 * The desktop sidebar (docs/APPOINTMENTS-AND-NAV.md D1–D4), in Cloudflare's manner: the shop and
 * its menu, a quick search with + beside it, roomy items with quiet icons and a neutral pill for
 * the open page, groups that open under a guide line (Recente, Programări, Setări), plain group
 * titles, and the button that folds it into the rail.
 */
function Sidebar({ pathname, badges, shopName, demo }) {
	const groups = [...new Set(NAV.map((item) => item.group))];
	const [openText, setOpenText] = useLocalPreference(OPEN_KEY, "{}");
	const toggled = parseOpen(openText);
	// A group is open when its page is (or, for Recente, by default) unless it was closed by hand.
	const isOpen = (key, fallback) => toggled[key] ?? fallback;
	const toggle = (key, fallback) => setOpenText(JSON.stringify({ ...toggled, [key]: !isOpen(key, fallback) }));
	return (
		<aside data-shell="sidebar" className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-muted lg:flex">
			<div className="border-b px-3 py-2.5">
				<ShopMenu shopName={shopName} demo={demo} />
			</div>
			<div className="flex gap-2 px-3 pt-3 pb-2">
				<button
					type="button"
					onClick={openCommandMenu}
					className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:text-foreground"
				>
					<Search className="size-4 shrink-0" aria-hidden />
					<span className="flex-1 truncate text-left">Caută…</span>
					<Kbd>⌘K</Kbd>
				</button>
				<QuickCreate>
					<Button variant="brand" size="icon" className="size-10 shrink-0 rounded-lg" aria-label="Nou">
						<Plus />
					</Button>
				</QuickCreate>
			</div>
			<nav className="flex-1 overflow-y-auto px-3 pt-1 pb-4" aria-label="Navigare principală">
				{groups.map((group, index) => (
					<div key={group} className={cn(index > 0 && "mt-5")}>
						{/* The first group has no title; later ones a plain, quiet one. */}
						{index > 0 && <p className="px-3 pb-1 text-[13px] text-muted-foreground">{group}</p>}
						<ul className="space-y-0.5">
							{NAV.filter((item) => item.group === group).flatMap((item, i) => {
								const key = item.href;
								const row = <NavItem key={key} item={item} pathname={pathname} badges={badges} open={isOpen(key, isActive(item, pathname))} onToggle={() => toggle(key, isActive(item, pathname))} />;
								// Recente comes right after Azi, as Cloudflare's after "Account home".
								return index === 0 && i === 0 ? [row, <RecentItems key="recents" open={isOpen("recents", true)} onToggle={() => toggle("recents", true)} />] : [row];
							})}
						</ul>
					</div>
				))}
			</nav>
			<div className="flex items-center gap-1 border-t px-3 py-2.5">
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
					<Button variant="brand" size="icon" aria-label="Nou">
						<Plus />
					</Button>
				</QuickCreate>
			</div>
			<nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto" aria-label="Navigare principală">
				{NAV.map((item) => {
					const active = isActive(item, pathname);
					const count = item.badge ? badges[item.badge] : 0;
					return (
						<Link
							key={item.href}
							href={item.href}
							title={item.label}
							aria-current={active ? "page" : undefined}
							className={cn(
								"relative flex w-14 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] leading-3 transition-colors",
								active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
							)}
						>
							<item.icon className="size-[18px]" aria-hidden />
							<span className="max-w-full truncate px-0.5">{item.label}</span>
							{count > 0 && <span className="absolute top-1 right-2 size-1.5 rounded-full bg-brand" aria-hidden />}
						</Link>
					);
				})}
			</nav>
			{/* Folded on a desktop: the way back to the full sidebar (a tablet has no room for it). */}
			<Button variant="ghost" size="icon-sm" className="mb-1 hidden lg:inline-flex" onClick={() => setSidebar("full")} aria-label="Extinde bara laterală" title="Extinde bara laterală">
				<PanelLeftOpen />
			</Button>
			<ThemeToggle />
		</aside>
	);
}

function TopBar({ shopName }) {
	return (
		<header data-print="hide" className="fixed inset-x-0 top-0 z-30 border-b bg-card/90 pt-safe backdrop-blur-xl md:hidden">
			<div className="flex h-14 items-center gap-2 px-4">
				<Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5">
					<LogoMark className="size-7" />
					<span className="truncate text-[15px] font-semibold">{shopName}</span>
				</Link>
				<Button variant="ghost" size="icon-touch" onClick={openCommandMenu} aria-label="Caută">
					<Search className="size-5" />
				</Button>
				<QuickCreate>
					<Button variant="brand" size="icon" className="size-9 rounded-full" aria-label="Nou">
						<Plus className="size-5" />
					</Button>
				</QuickCreate>
			</div>
		</header>
	);
}

const PROGRAMARI_KEY = "garaj.programari";

function TabBar({ pathname, badges }) {
	const [programari] = useLocalPreference(PROGRAMARI_KEY, PROGRAMARI_PAGES[0], PROGRAMARI_PAGES);
	return (
		<nav
			data-print="hide"
			className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-safe backdrop-blur-xl md:hidden"
			aria-label="Navigare principală"
		>
			<ul className="grid h-14 grid-cols-5">
				{TABS.map((item) => {
					const active = isActive(item, pathname);
					const count = item.badge ? badges[item.badge] : 0;
					return (
						<li key={item.href}>
							<Link
								href={item === NAV[1] ? programari : item.href}
								aria-current={active ? "page" : undefined}
								onClick={(event) => {
									haptics.selection();
									// Like a native tab bar: tapping the current tab goes back to the top.
									if (active && pathname.replace(/\/$/, "") === item.href.replace(/\/$/, "")) {
										event.preventDefault();
										window.scrollTo({ top: 0, behavior: "smooth" });
									}
								}}
								className={cn(
									"touch-none-callout relative flex h-full flex-col items-center justify-center gap-1 text-[10px] font-medium transition-[color,transform,opacity] duration-100 active:scale-90 active:opacity-60",
									active ? "text-foreground" : "text-muted-foreground",
								)}
							>
								<span className="relative">
									<item.icon className={cn("size-[22px]", active && "stroke-[2.25]")} aria-hidden />
									{count > 0 && (
										<span className="absolute -top-1 -right-2.5 min-w-4 rounded-full bg-brand px-1 text-center text-[9px] leading-4 font-semibold text-brand-foreground tabular-nums">
											{count > 99 ? "99+" : count}
										</span>
									)}
								</span>
								{item.label}
								{active && <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-brand" aria-hidden />}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
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
	return (
		<>
			<Sidebar pathname={pathname} badges={badges} shopName={settings.shop.name} demo={demo} />
			<Rail pathname={pathname} badges={badges} />
			<TopBar shopName={settings.shop.name} />
			<main
				id="main"
				className="min-h-dvh pt-[calc(3.5rem+var(--safe-top))] pb-[calc(var(--tabbar-h)+var(--safe-bottom))] md:pt-0 md:pb-0 md:pl-16 lg:pl-64"
			>
				<PageTransition>{children}</PageTransition>
			</main>
			<TabBar pathname={pathname} badges={badges} />
			<CommandMenu />
			<GlobalSheets />
		</>
	);
}
