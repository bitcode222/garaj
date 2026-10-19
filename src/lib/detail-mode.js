"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { navigateFromSheet, openSheet } from "@/lib/sheets";

// How a record opens from a list. On a phone it is always the real page (it
// pushes in from the right, like any native screen); there is no preview. From md
// up it is a side sheet (default) or the full page, a per-device preference.

export const DETAIL_MODE_KEY = "garaj.detailMode";
export const DETAIL_MODES = ["sheet", "page"];

export function getDetailMode() {
	try {
		const stored = localStorage.getItem(DETAIL_MODE_KEY);
		return DETAIL_MODES.includes(stored) ? stored : "sheet";
	} catch {
		return "sheet";
	}
}

/** True when a record opens as a side sheet here (md and up, with the sheet preference). */
export function opensInSheet() {
	return typeof window !== "undefined" && getDetailMode() === "sheet" && window.matchMedia("(min-width: 768px)").matches;
}

const ROUTES = {
	customer: "/customers/detail/",
	vehicle: "/vehicles/detail/",
	"work-order": "/work-orders/detail/",
	invoice: "/invoices/detail/",
};

export const detailHref = (type, id) => `${ROUTES[type]}?id=${id}`;

/**
 * `open(type, id)` for customer · vehicle · work-order · invoice · appointment.
 * Appointments have no page of their own: they always open their sheet (its flow strip and
 * state section are where a booking is moved on; the form is one tap away, in its top bar).
 */
export function useOpenDetail() {
	const router = useRouter();
	return useCallback(
		(type, id) => {
			const sheet = getDetailMode() === "sheet" && window.matchMedia("(min-width: 768px)").matches;
			if (type === "appointment") openSheet("appointment-view", { id });
			else if (sheet) openSheet(`${type}-view`, { id });
			else navigateFromSheet(router, detailHref(type, id));
		},
		[router],
	);
}
