"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { SheetDepth } from "@/components/ds/sheet";
import { closeAllSheets, closeSheet, useSheets } from "@/lib/sheets";

// Forms and detail views are code-split: none of this is in the first-load bundle.
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
	"appointment-view": () => import("@/features/calendar/appointment-view"),
	"customer-view": () => import("@/features/customers/customer-view"),
	"vehicle-view": () => import("@/features/vehicles/vehicle-view"),
	"work-order-view": () => import("@/features/work-orders/work-order-view"),
	"invoice-view": () => import("@/features/invoices/invoice-view"),
};

const SHEETS = Object.fromEntries(Object.entries(loaders).map(([type, load]) => [type, dynamic(load, { ssr: false })]));

export function GlobalSheets() {
	const sheets = useSheets();
	const pathname = usePathname();

	// Warm the most used sheets once the app is idle, so the first open is instant.
	useEffect(() => {
		const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
		const handle = idle(() => {
			loaders.checkin();
			loaders.appointment();
			loaders.customer();
			loaders["appointment-view"]();
			loaders["customer-view"]();
			loaders["vehicle-view"]();
		});
		return () => window.cancelIdleCallback?.(handle);
	}, []);

	// A sheet never outlives its page (route changes that did not come from a sheet).
	useEffect(() => closeAllSheets, [pathname]);

	return sheets.map((sheet, index) => {
		// Sheets above an open one reuse its scrim.
		const depth = sheets.slice(0, index).filter((below) => below.open).length;
		const Component = SHEETS[sheet.type];
		if (!Component) return null;
		return (
			<SheetDepth.Provider key={sheet.key} value={depth}>
				<Component {...sheet.props} open={sheet.open} onOpenChange={(open) => !open && closeSheet()} />
			</SheetDepth.Provider>
		);
	});
}
