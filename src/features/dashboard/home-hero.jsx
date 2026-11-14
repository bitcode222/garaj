"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { CalendarPlus, FilePlus2, Plus, Search, Wrench } from "lucide-react";
import { Kbd } from "@/components/ds/data";
import { ToneDot } from "@/components/ds/tone";
import { Button } from "@/components/ui/button";
import { CommandList } from "@/components/ui/command";
import { parseISODate } from "@/domain/dates";
import { fmtDate } from "@/lib/format";
import { openSheet } from "@/lib/sheets";
import { createInvoiceDraft } from "@/lib/store/actions";
import { toast } from "@/lib/toast";
import { useAccount } from "@/components/shell/account-menu";
import { SearchResults, useSearch } from "@/components/shell/command-results";
import { toMinutes } from "@/features/calendar/utils";

// The three starts under the search: taller and roomier, with a plus in front of each one's icon.
const ACTION = "h-11 rounded-full px-5 text-base md:h-12 max-sm:flex-1 [&_svg]:size-5";

const greeting = (minute) => (minute < 11 * 60 ? "Bună dimineața" : minute < 18 * 60 ? "Bună ziua" : "Bună seara");

/** Whether the shop is open now, in a few words: "deschis până la 18:00", "se deschide la 08:00", "închis azi". */
function hoursText(settings, today, minute) {
	const { open, close, days } = settings.hours;
	if (!days.includes(parseISODate(today).getDay())) return { text: "închis azi", open: false };
	if (minute < toMinutes(open)) return { text: `se deschide la ${open}`, open: false };
	if (minute >= toMinutes(close)) return { text: `închis de la ${close}`, open: false };
	return { text: `deschis până la ${close}`, open: true };
}

/**
 * The top of Azi (docs/HOME-PAGE.md D1, D2), as Cloudflare's home: a pill with the day, a
   * centred question, one big search, and the three things started most. The search is the
 * field itself: typing in it shows the matches in a panel right under it (the same rows as
 * the search dialog), "/" puts the cursor in it from anywhere on the page that is not a field, and Esc or
 * a click away closes the panel.
 */
export function HomeHero({ settings, today, minute }) {
	const router = useRouter();
	const { member } = useAccount();
	const hours = hoursText(settings, today, minute);
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const input = useRef(null);
	const search = useSearch(query);

	useEffect(() => {
		const onKey = (event) => {
			if (event.key !== "/" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			if (target.closest?.("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
			event.preventDefault();
			input.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const close = () => {
		setOpen(false);
		setQuery("");
		input.current?.blur();
	};
	const go = (href) => {
		close();
		router.push(href);
	};
	const create = (type) => {
		close();
		if (type === "invoice") {
			try {
				const draft = createInvoiceDraft();
				router.push(`/invoices/detail/?id=${draft.id}`);
			} catch (error) {
				toast.error(error.message);
			}
		} else {
			openSheet(type);
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
			{/* Named once an account is chosen (the account menu); until then the question stands. */}
			<h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight md:text-4xl">
				{member ? `${greeting(minute)}, ${member.name.split(" ")[0]}` : "Ce e pe agendă azi?"}
			</h1>
			{/* The field and its suggestions are one unit: the panel hangs under the field, the same width. */}
			<CommandPrimitive
				shouldFilter={false}
				onKeyDown={(event) => {
					if (event.key === "Escape") close();
				}}
				onBlur={(event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
				}}
				className="relative w-full max-w-3xl overflow-visible rounded-none bg-transparent text-left"
			>
				<div>
					<div
						onClick={() => input.current?.focus()}
						className="flex h-14 w-full cursor-text items-center gap-3 rounded-xl border bg-card px-4 text-muted-foreground shadow-sm transition-[box-shadow,border-color] hover:border-foreground/25 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 focus-within:text-foreground"
					>
						<Search className="size-5 shrink-0" aria-hidden />
						<CommandPrimitive.Input
							ref={input}
							data-home-search
							value={query}
							onValueChange={(value) => {
								setQuery(value);
								setOpen(true);
							}}
							onFocus={() => setOpen(true)}
							placeholder="Caută o mașină, un client, o factură…"
							aria-label="Caută o mașină, un client, o lucrare sau o factură"
							aria-keyshortcuts="/"
							enterKeyHint="search"
							className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
						/>
						{!open && (
							<span className="hidden shrink-0 items-center gap-1 pointer-fine:flex" aria-hidden>
								<Kbd className="px-2 py-1 text-xs">/</Kbd>
							</span>
						)}
					</div>
				</div>
				{open && (
					// Mousedown is kept from moving the focus, so a click on a row lands before the field lets go of it.
					<div onMouseDown={(event) => event.preventDefault()} className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
						<CommandList className="max-h-[min(60vh,440px)] p-1">
							<SearchResults search={search} onGo={go} onCreate={create} />
						</CommandList>
					</div>
				)}
			</CommandPrimitive>
			<div className="flex w-full flex-wrap justify-center gap-2">
				<Button variant="outline" className={ACTION} onClick={() => openSheet("appointment")}>
					<Plus />
					<CalendarPlus /> Programare
				</Button>
				<Button variant="outline" className={ACTION} onClick={() => openSheet("checkin")}>
					<Plus />
					<Wrench /> Primire mașină
				</Button>
				<Button variant="outline" className={ACTION} onClick={() => create("invoice")}>
					<Plus />
					<FilePlus2 /> Factură
				</Button>
			</div>
			
		</header>
	);
}
