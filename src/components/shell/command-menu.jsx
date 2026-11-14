"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CommandDialog, CommandInput, CommandList } from "@/components/ui/command";
import { createInvoiceDraft } from "@/lib/store/actions";
import { openSheet } from "@/lib/sheets";
import { setCommandMenuOpen, useCommandMenu } from "./command-state";
import { SearchResults, useSearch } from "./command-results";

/** The search dialog: plates, VINs, names, phones and document numbers, plus quick actions. */
export function CommandMenu() {
	const { open, session, seed } = useCommandMenu();
	const router = useRouter();
	const [query, setQuery] = useState("");
	// A new opening starts from what it was opened with (the home page's field passes what was typed there).
	// Mounted already open (its code loaded after the key was pressed), that opening is new to it too.
	const [opened, setOpened] = useState(() => (open ? null : session));
	if (opened !== session) {
		setOpened(session);
		setQuery(seed);
	}
	const search = useSearch(query);

	const close = () => {
		setCommandMenuOpen(false);
		setQuery("");
	};
	const go = (href) => {
		close();
		router.push(href);
	};
	const create = (type) => {
		close();
		if (type === "invoice") {
			const draft = createInvoiceDraft();
			router.push(`/invoices/detail/?id=${draft.id}`);
		} else {
			openSheet(type);
		}
	};

	return (
		<CommandDialog
			open={open}
			onOpenChange={(value) => (value ? setCommandMenuOpen(true) : close())}
			title="Caută"
			description="Caută după număr de înmatriculare, VIN, nume, telefon sau număr de document."
			className="top-[calc(1rem+var(--safe-top))] translate-y-0 sm:top-[12vh] sm:max-w-xl"
			shouldFilter={false}
		>
			<CommandInput value={query} onValueChange={setQuery} placeholder="Nr. înmatriculare, client, telefon, factură…" />
			<CommandList className="max-h-[min(60vh,440px)]">
				<SearchResults search={search} onGo={go} onCreate={create} />
			</CommandList>
		</CommandDialog>
	);
}
