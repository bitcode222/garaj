"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Palette, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ds/data";
import { useCollection, useSettings, useStoreValue, useToday } from "@/lib/store/hooks";
import { selectReminders } from "@/lib/store/selectors";
import { OPEN_STATUSES } from "@/domain/work-order";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";
import { PageTransition } from "./page-transition";
import { NAV, TABS, isActive } from "./nav";
import { QuickCreate } from "./quick-create";
import { openCommandMenu } from "./command-state";
import { ThemeToggle } from "./theme-toggle";
import { tone } from "@/lib/tones";

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
	let openOrders = 0;
	for (const id in workOrders) if (OPEN_STATUSES.includes(workOrders[id].status)) openOrders++;
	return { openOrders, reminders: reminders.length };
}

function Sidebar({ pathname, badges, shopName, demo }) {
	const groups = [...new Set(NAV.map((item) => item.group))];
	return (
		<aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card lg:flex">
			<div className="flex h-16 items-center gap-2.5 px-4">
				<LogoMark />
				<div className="min-w-0 leading-tight">
					<p className="truncate text-sm font-semibold">{shopName}</p>
					<p className="text-2xs text-muted-foreground">Garaj · service auto</p>
				</div>
			</div>
			<div className="space-y-2 px-3">
				<button
					type="button"
					onClick={openCommandMenu}
					className="flex h-9 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<Search className="size-4" aria-hidden />
					<span className="flex-1 truncate text-left">Caută…</span>
					<Kbd>⌘K</Kbd>
				</button>
				<QuickCreate>
					<Button variant="brand" className="w-full justify-start">
						<Plus aria-hidden />
						Nou
					</Button>
				</QuickCreate>
			</div>
			<nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4" aria-label="Navigare principală">
				{groups.map((group, index) => (
					<div key={group} className={cn(index > 0 && "mt-4 border-t pt-4")}>
						{/* The first group has no heading; later ones are set off by a divider and a quiet title. */}
						{index > 0 && <p className="px-3 pb-2 text-sm font-semibold text-muted-foreground">{group}</p>}
						<ul className="space-y-0.5">
							{NAV.filter((item) => item.group === group).map((item) => {
								const active = isActive(item, pathname);
								const count = item.badge ? badges[item.badge] : 0;
								return (
									<li key={item.href}>
										<Link
											href={item.href}
											aria-current={active ? "page" : undefined}
											className={cn(
												"flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors",
												active ? tone("blue").nav : "text-foreground hover:bg-accent",
											)}
										>
											<item.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
											<span className="flex-1 truncate">{item.label}</span>
											{count > 0 && (
												<span className={cn("min-w-6 rounded-md border px-1.5 text-center text-2xs leading-5 font-semibold tabular-nums", tone("purple").chip)}>
													{count > 99 ? "99+" : count}
												</span>
											)}
										</Link>
										{active && item.children && (
											<ul className="my-1 ml-[21px] space-y-0.5 border-l-2">
												{item.children.map((child) => (
													<li key={child.href}>
														<Link href={child.href} className="flex h-10 items-center rounded-r-lg pl-[21px] text-[15px] text-foreground transition-colors hover:bg-accent">
															{child.label}
														</Link>
													</li>
												))}
											</ul>
										)}
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</nav>
			<div className="flex items-center gap-1 border-t px-3 py-3">
				{demo && (
					<Link href="/settings/#date" className={cn("mr-auto rounded-md border px-2 py-1 text-2xs font-medium", tone("yellow").chip)}>
						Date demo
					</Link>
				)}
				<Button asChild variant="ghost" size="icon-sm" className={cn(!demo && "mr-auto")} aria-label="Design system">
					<Link href="/design/">
						<Palette />
					</Link>
				</Button>
				<ThemeToggle />
			</div>
		</aside>
	);
}

function Rail({ pathname, badges }) {
	return (
		<aside className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center border-r bg-card pt-3 pb-3 md:flex lg:hidden">
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

function TabBar({ pathname, badges }) {
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
								href={item.href}
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
	return (
		<>
			<Sidebar pathname={pathname} badges={badges} shopName={settings.shop.name} demo={demo} />
			<Rail pathname={pathname} badges={badges} />
			<TopBar shopName={settings.shop.name} />
			<main
				id="main"
				className="min-h-dvh pt-[calc(3.5rem+var(--safe-top))] pb-[calc(var(--tabbar-h)+var(--safe-bottom))] md:pt-0 md:pb-0 md:pl-16 lg:pl-60"
			>
				<PageTransition>{children}</PageTransition>
			</main>
			<TabBar pathname={pathname} badges={badges} />
			<CommandMenu />
			<GlobalSheets />
		</>
	);
}
