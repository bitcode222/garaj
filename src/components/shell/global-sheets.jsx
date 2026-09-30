"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { closeSheet, useSheet } from "@/lib/sheets";

// Forms are code-split: none of this is in the first-load bundle.
const loaders = {
	customer: () => import("@/features/customers/customer-sheet"),
	vehicle: () => import("@/features/vehicles/vehicle-sheet"),
	appointment: () => import("@/features/calendar/appointment-sheet"),
	checkin: () => import("@/features/work-orders/checkin-sheet"),
	payment: () => import("@/features/invoices/payment-sheet"),
	part: () => import("@/features/catalog/part-sheet"),
	service: () => import("@/features/catalog/service-sheet"),
	staff: () => import("@/features/settings/team-sheets").then((m) => ({ default: m.StaffSheet })),
	bay: () => import("@/features/settings/team-sheets").then((m) => ({ default: m.BaySheet })),
};

const SHEETS = Object.fromEntries(Object.entries(loaders).map(([type, load]) => [type, dynamic(load, { ssr: false })]));

export function GlobalSheets() {
	const sheet = useSheet();

	// Warm the most used forms once the app is idle, so the first open is instant.
	useEffect(() => {
		const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
		const handle = idle(() => {
			loaders.checkin();
			loaders.appointment();
			loaders.customer();
		});
		return () => window.cancelIdleCallback?.(handle);
	}, []);

	if (!sheet) return null;
	const Component = SHEETS[sheet.type];
	if (!Component) return null;
	return <Component key={sheet.key} {...sheet.props} open={sheet.open} onOpenChange={(open) => !open && closeSheet()} />;
}
