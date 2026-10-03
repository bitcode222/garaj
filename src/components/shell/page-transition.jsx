"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// False until the first page has been shown, so opening the app does not fade
// in; every later route change does.
let shown = false;

/**
 * Soft cross-fade between pages. Opacity only, on purpose: a transform here would
 * become the containing block of the pages' fixed bars (StickyBar) for the length
 * of the animation and make them jump.
 */
export function PageTransition({ children }) {
	const pathname = usePathname();
	useEffect(() => {
		shown = true;
	}, []);
	return (
		<div key={pathname} className={shown ? "page-enter" : undefined}>
			{children}
		</div>
	);
}
