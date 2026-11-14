"use client";

import { useRouter } from "next/navigation";
import { detailHref } from "@/lib/detail-mode";
import { closeSheet, openSheet, walkSheet } from "@/lib/sheets";

// Going from one record of a visit to another (docs/VISIT-FLOW.md D4). The visit bar (./visit-bar.jsx) replaced the
// flow strip that lived here (docs/VISIT-BAR.md B2).

const SHEETS = { appointment: "appointment-view", "work-order": "work-order-view", invoice: "invoice-view", review: "review" };

/**
 * Going to another record of the visit. Inside a sheet it walks (the sheet is replaced,
 * sliding from the side of the record it goes to); on a page it opens the record's page, or its sheet for a
 * booking or a review (they have no page). A record that is the page under the sheet is
 * simply uncovered.
 */
export function useWalk(inSheet) {
	const router = useRouter();
	return ({ kind, id, direction, props = { id } }) => {
		const page = kind === "work-order" || kind === "invoice" ? detailHref(kind, id) : null;
		const here = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}`;
		if (inSheet) {
			if (page && page === here) closeSheet();
			else walkSheet(SHEETS[kind], props, direction);
			return;
		}
		if (page) router.push(page);
		else openSheet(SHEETS[kind], props);
	};
}
