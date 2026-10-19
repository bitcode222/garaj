"use client";

import Link from "next/link";
import { ChevronRight, History, Palette } from "lucide-react";
import { Page, PageHeader } from "@/components/ds/page";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NAV } from "@/components/shell/nav";
import { useRecentRecords } from "@/components/shell/recents";
import { useStoreValue } from "@/lib/store/hooks";

const MORE = NAV.filter((item) => !["/", "/calendar/", "/work-orders/", "/invoices/"].includes(item.href));

/** Phone-only hub for the sections that don't fit in the tab bar. */
export function MorePage() {
	const demo = useStoreValue("demo");
	const recents = useRecentRecords();
	return (
		<Page width="narrow">
			<PageHeader title="Mai mult" />
			{recents.length > 0 && (
				<section aria-label="Recente" className="mb-6">
					<h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
						<History className="size-4" aria-hidden /> Recente
					</h2>
					<ul className="divide-y overflow-hidden rounded-xl border bg-card">
						{recents.map((record) => (
							<li key={record.key}>
								<button type="button" onClick={record.open} className="flex min-h-14 w-full flex-col justify-center px-4 py-2 text-left active:bg-accent">
									<span className="w-full truncate text-[15px] font-medium">{record.title}</span>
									<span className="w-full truncate text-xs text-muted-foreground">{record.subtitle}</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			)}
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
