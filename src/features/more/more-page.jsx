"use client";

import Link from "next/link";
import { ChevronRight, Palette } from "lucide-react";
import { Page, PageHeader } from "@/components/ds/page";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NAV } from "@/components/shell/nav";
import { useStoreValue } from "@/lib/store/hooks";

const MORE = NAV.filter((item) => !["/", "/calendar/", "/work-orders/", "/invoices/"].includes(item.href));

/** Phone-only hub for the sections that don't fit in the tab bar. */
export function MorePage() {
	const demo = useStoreValue("demo");
	return (
		<Page width="narrow">
			<PageHeader title="Mai mult" />
			<ul className="divide-y overflow-hidden rounded-xl border bg-card">
				{[...MORE, { href: "/design/", label: "Design system", icon: Palette }].map((item) => (
					<li key={item.href}>
						<Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 text-[15px] font-medium active:bg-accent">
							<span className="flex size-8 items-center justify-center rounded-lg bg-muted">
								<item.icon className="size-4" aria-hidden />
							</span>
							<span className="flex-1">{item.label}</span>
							<ChevronRight className="size-4 text-muted-foreground" aria-hidden />
						</Link>
					</li>
				))}
			</ul>
			<div className="mt-6 flex items-center justify-between rounded-xl border bg-card px-4 py-3">
				<span className="text-sm font-medium">Temă</span>
				<ThemeToggle />
			</div>
			{demo && <p className="mt-6 text-center text-xs text-muted-foreground">Mod demo · Setări → Date pentru a începe cu datele tale</p>}
		</Page>
	);
}
