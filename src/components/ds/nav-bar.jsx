"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { Glass } from "@/components/ds/glass";
import { QuickCreate } from "@/components/shell/quick-create";
import { TABS } from "@/components/shell/nav";
import { cn } from "@/lib/utils";

// The phone's navigation bar, as the iPhone app's (owner, 17 Nov 2026; docs/DESIGN.md "Telefon ca iPhone"): a 44 px row
// at the top with round glass buttons; the page's large title scrolls under it, and once it has gone the row turns to
// glass and shows the title small, centred. Under 768 px only.

export const PHONE = "(max-width: 767px)";

/** A round 44 px button of the nav row (an icon); `asChild` triggers pass their props through. */
export function NavIcon({ label, className, children, ref, ...props }) {
	return (
		<button ref={ref} type="button" aria-label={label} title={label} className={cn("flex size-11 items-center justify-center rounded-full text-foreground outline-none active:opacity-60 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[22px]", className)} {...props}>
			{children}
		</button>
	);
}

/** The glass capsule that holds the row's buttons (one is a circle, two or more a pill). */
export function NavGroup({ className, children }) {
	return (
		<Glass preset="capsule" media={PHONE} className={cn("flex items-center rounded-full border border-transparent bg-card/80 shadow-sm", className)}>
			{children}
		</Glass>
	);
}

/** "+" in the nav row: the Nou menu, as the iPhone's. */
export function NavNew() {
	return (
		<QuickCreate>
			<NavIcon label="Nou">
				<Plus />
			</NavIcon>
		</QuickCreate>
	);
}

/** Where "‹" goes: a page of the Registru tab goes back to it, as on the iPhone. */
function useBack() {
	const pathname = usePathname() ?? "/";
	const registry = TABS.find((tab) => tab.href === "/more/");
	if (pathname.startsWith("/more")) return null;
	return registry?.matches?.some((m) => pathname.startsWith(m)) ? { href: "/more/", label: "Registru" } : null;
}

/**
 * The fixed row. `collapsed`: the large title is out of sight, so the row is glass and shows `title`. `actions`: the
 * buttons on the right (default: "+"); `null` for none.
 */
export function PhoneNavBar({ title, collapsed, actions, leading }) {
	const back = useBack();
	const trailing = actions === undefined ? <NavNew /> : actions;
	return (
		<div data-print="hide" data-nav-bar className="fixed inset-x-0 top-0 z-30 md:hidden">
			<div aria-hidden className={cn("absolute inset-0 border-b bg-background/80 backdrop-blur-xl transition-opacity duration-200", collapsed ? "opacity-100" : "border-transparent opacity-0")} />
			<div className="relative flex h-11 items-center gap-2 px-4" style={{ marginTop: "var(--safe-top)" }}>
				{leading}
				{back && (
					<NavGroup>
						<Link href={back.href} aria-label={`Înapoi la ${back.label}`} className="flex size-11 items-center justify-center rounded-full active:opacity-60">
							<ChevronLeft className="size-6" aria-hidden />
						</Link>
					</NavGroup>
				)}
				<span aria-hidden={!collapsed} className={cn("pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold transition-opacity duration-200", collapsed ? "opacity-100" : "opacity-0")}>
					{title}
				</span>
				<div className="flex-1" />
				{trailing && <NavGroup>{trailing}</NavGroup>}
			</div>
		</div>
	);
}
