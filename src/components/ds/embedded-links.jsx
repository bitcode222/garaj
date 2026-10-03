"use client";

import { useRouter } from "next/navigation";
import { openSheet, navigateFromSheet } from "@/lib/sheets";

// Detail route → the sheet that shows the same record.
const SHEET_FOR_ROUTE = {
	"/customers/detail/": "customer-view",
	"/vehicles/detail/": "vehicle-view",
	"/work-orders/detail/": "work-order-view",
	"/invoices/detail/": "invoice-view",
};

/**
 * Wraps a full page rendered inside a sheet. Links to another record open that
 * record's sheet on top (Back returns here); any other link leaves the sheet
 * and opens the page. Modified clicks (new tab) are left alone.
 */
export function EmbeddedLinks({ children }) {
	const router = useRouter();
	return (
		<div
			onClickCapture={(event) => {
				const link = event.target.closest?.("a[href^='/']");
				if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
				event.preventDefault();
				event.stopPropagation();
				const url = new URL(link.getAttribute("href"), window.location.origin);
				const sheet = SHEET_FOR_ROUTE[url.pathname];
				const id = url.searchParams.get("id");
				if (sheet && id) openSheet(sheet, { id });
				else navigateFromSheet(router, url.pathname + url.search);
			}}
		>
			{children}
		</div>
	);
}
