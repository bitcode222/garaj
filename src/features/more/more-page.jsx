"use client";

import Link from "next/link";
import { ChevronRight, History, Palette } from "lucide-react";
import { Page } from "@/components/ds/page";
import { PageTitle } from "@/components/ds/blocks";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { AccountMenu } from "@/components/shell/account-menu";
import { NAV } from "@/components/shell/nav";
import { useRecentRecords } from "@/components/shell/recents";
import { AREA } from "@/lib/colors";
import { useStoreValue } from "@/lib/store/hooks";

// The phone's Registru (the iPhone app's): what is not a tab, in the sidebar's groups, each with its area's colour.
const GROUPS = [...new Set(NAV.map((item) => item.group))].slice(1);

function Row({ href, label, icon: Icon, color }) {
	return (
		<li>
			<Link href={href} className="flex min-h-12 items-center gap-3 px-4 text-[15px] active:bg-accent">
				<span className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] text-white" style={{ background: color }}>
					<Icon className="size-4" aria-hidden />
				</span>
				<span className="flex-1">{label}</span>
				<ChevronRight className="size-4 text-muted-foreground" aria-hidden />
			</Link>
		</li>
	);
}

export function MorePage() {
	const demo = useStoreValue("demo");
	const recents = useRecentRecords();
	return (
		<Page width="narrow" className="space-y-6">
			{/* On a phone the account sits in the nav row (the top bar is gone, as on the iPhone). */}
			<PageTitle title="Registru" actions={<AccountMenu className="size-11 border-0 bg-transparent" />} />
			{recents.length > 0 && (
				<section aria-label="Recente" className="space-y-1.5">
					<h2 className="flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-[0.07em] text-muted-foreground uppercase">
						<History className="size-3.5" aria-hidden /> Recente
					</h2>
					<ul className="divide-y overflow-hidden rounded-xl border bg-card">
						{recents.map((record) => (
							<li key={record.key}>
								<button type="button" onClick={record.open} className="flex min-h-12 w-full flex-col justify-center px-4 py-2 text-left active:bg-accent">
									<span className="w-full truncate text-[15px] font-medium">{record.title}</span>
									<span className="w-full truncate text-xs text-muted-foreground">{record.subtitle}</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			)}
			{GROUPS.map((group) => (
				<section key={group} aria-label={group} className="space-y-1.5">
					<h2 className="px-1 text-[11px] font-medium tracking-[0.07em] text-muted-foreground uppercase">{group}</h2>
					<ul className="divide-y overflow-hidden rounded-xl border bg-card">
						{NAV.filter((item) => item.group === group).map((item) => (
							<Row key={item.href} href={item.href} label={item.label} icon={item.icon} color={item.area} />
						))}
						{group === GROUPS.at(-1) && <Row href="/design/" label="Limbajul de design" icon={Palette} color={AREA.setari} />}
					</ul>
				</section>
			))}
			<div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
				<span className="text-sm font-medium">Temă</span>
				<ThemeToggle />
			</div>
			{demo && <p className="text-center text-xs text-muted-foreground">Mod demo · Setări → Date pentru a începe cu datele tale</p>}
		</Page>
	);
}
