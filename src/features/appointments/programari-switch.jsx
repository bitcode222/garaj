"use client";

import Link from "next/link";
import { CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGES = [
	{ href: "/calendar/", label: "Calendar", icon: CalendarDays },
	{ href: "/appointments/", label: "Toate", icon: List },
];

/**
 * The two Programări pages one tap apart (docs/APPOINTMENTS-AND-NAV.md D5): at the top of both,
 * on every screen (a phone has no sidebar). Looks like the Segmented control; it is links.
 */
export function ProgramariSwitch({ current, className }) {
	return (
		<nav aria-label="Paginile Programări" className={cn("inline-flex h-11 items-center gap-0.5 rounded-[8px] bg-muted p-0.5 md:h-[30px]", className)}>
			{PAGES.map((page) => {
				const here = page.href === current;
				return (
					<Link
						key={page.href}
						href={page.href}
						aria-current={here ? "page" : undefined}
						className={cn(
							"inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200",
							here ? "bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.1)]" : "text-muted-foreground hover:text-foreground",
						)}
					>
						<page.icon className="size-3.5" aria-hidden />
						<span data-label>{page.label}</span>
					</Link>
				);
			})}
		</nav>
	);
}
