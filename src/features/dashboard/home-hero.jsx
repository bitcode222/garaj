"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CalendarPlus, FilePlus2, Search, Wrench } from "lucide-react";
import { Kbd } from "@/components/ds/data";
import { ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { parseISODate } from "@/domain/dates";
import { fmtDate } from "@/lib/format";
import { openSheet } from "@/lib/sheets";
import { createInvoiceDraft } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { openCommandMenu } from "@/components/shell/command-state";
import { toMinutes } from "@/features/calendar/utils";

const greeting = (minute) => (minute < 11 * 60 ? "Bună dimineața" : minute < 18 * 60 ? "Bună ziua" : "Bună seara");

/** Whether the shop is open now, in a few words: "deschis până la 18:00", "se deschide la 08:00", "închis azi". */
function hoursText(settings, today, minute) {
	const { open, close, days } = settings.hours;
	if (!days.includes(parseISODate(today).getDay())) return { text: "închis azi", open: false };
	if (minute < toMinutes(open)) return { text: `se deschide la ${open}`, open: false };
	if (minute >= toMinutes(close)) return { text: `închis de la ${close}`, open: false };
	return { text: `deschis până la ${close}`, open: true };
}

/** A key that types a character, not a shortcut. */
const typesText = (event) => event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;

/**
 * The top of Azi (docs/HOME-PAGE.md D1, D2), as Cloudflare's home: a pill with the day, a
 * centred question, one big search, and the three things started most. The search is the
 * app's own (⌘K): pressing the field opens it, typing in it opens it with what was typed,
 * and "/" opens it from anywhere on the page that is not a field.
 */
export function HomeHero({ settings, today, minute }) {
	const router = useRouter();
	const hours = hoursText(settings, today, minute);

	useEffect(() => {
		const onKey = (event) => {
			if (event.key !== "/" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			if (target.closest?.("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
			event.preventDefault();
			openCommandMenu();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const newInvoice = () => {
		try {
			const draft = createInvoiceDraft();
			router.push(`/invoices/detail/?id=${draft.id}`);
		} catch (error) {
			toast.error(error.message);
		}
	};

	return (
		<header className="flex flex-col items-center gap-5 pt-2 text-center md:gap-6 md:pt-8">
			<p className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-full border bg-card px-4 py-1.5 text-sm shadow-xs">
				<span className="font-medium">{greeting(minute)}</span>
				<span className="text-muted-foreground" aria-hidden>
					·
				</span>
				<span className="first-letter:uppercase">{fmtDate(today, "EEEE, d MMMM")}</span>
				<span className="text-muted-foreground" aria-hidden>
					·
				</span>
				<span className="inline-flex items-center gap-1.5 text-muted-foreground">
					<ToneDot tone={hours.open ? "green" : "neutral"} />
					{hours.text}
				</span>
			</p>
			<h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight md:text-4xl">Ce e pe agendă azi?</h1>
			{/* The field: a soft halo around a white field, as Cloudflare's. It is a button: the search itself opens over the page. */}
			<div className="w-full max-w-3xl rounded-2xl border bg-muted/40 p-1.5">
				<button
					type="button"
					data-home-search
					onClick={() => openCommandMenu()}
					onKeyDown={(event) => {
						// "/" is the shortcut itself (handled for the whole page), not text.
						if (!typesText(event) || event.key === "/") return;
						event.preventDefault();
						openCommandMenu(event.key);
					}}
					aria-label="Caută o mașină, un client, o lucrare sau o factură"
					aria-keyshortcuts="Meta+K /"
					className="flex h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left text-base text-muted-foreground shadow-sm transition-[box-shadow,border-color] hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
				>
					<Search className="size-5 shrink-0" aria-hidden />
					<span className="min-w-0 flex-1 truncate">Caută o mașină, un client, o factură…</span>
					<span className="hidden shrink-0 items-center gap-1 pointer-fine:flex" aria-hidden>
						<Kbd className="px-2 py-1 text-xs">⌘</Kbd>
						<Kbd className="px-2 py-1 text-xs">K</Kbd>
					</span>
				</button>
			</div>
			<div className="flex w-full flex-wrap justify-center gap-2">
				<Button variant="outline" className="rounded-full max-md:h-11 max-sm:flex-1" onClick={() => openSheet("appointment")}>
					<CalendarPlus /> Programare
				</Button>
				<Button variant="outline" className="rounded-full max-md:h-11 max-sm:flex-1" onClick={() => openSheet("checkin")}>
					<Wrench /> Primire mașină
				</Button>
				<Button variant="outline" className="rounded-full max-md:h-11 max-sm:flex-1" onClick={newInvoice}>
					<FilePlus2 /> Factură
				</Button>
			</div>
		</header>
	);
}
