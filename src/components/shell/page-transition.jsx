"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Module state, because it must survive the keyed remount below.
let shown = false; // false until the first page is on screen, so launching the app does not animate
let previousDepth = 0;
let wentBack = false; // the browser/system Back moved us, which fades instead of pushing

if (typeof window !== "undefined") {
	window.addEventListener("popstate", () => {
		wentBack = true;
	});
}

// "/work-orders/" is 1, "/work-orders/detail/" is 2: deeper means a push.
const depthOf = (pathname) => pathname.split("/").filter(Boolean).length;

function Page({ depth, children }) {
	// Decided once per page instance, so a later re-render never restarts the animation.
	const [className] = useState(() => (!shown ? undefined : wentBack || depth <= previousDepth ? "page-enter" : "page-push"));
	return <div className={className}>{children}</div>;
}

/**
 * Route changes. Going deeper (list → detail) the new page pushes in from the
 * right; tabs, going up and Back cross-fade. Both avoid `transform`, which would
 * become the containing block of the pages' fixed bars (StickyBar) and make them
 * jump while it runs.
 */
export function PageTransition({ children }) {
	const pathname = usePathname();
	const depth = depthOf(pathname);
	useEffect(() => {
		shown = true;
		wentBack = false;
		previousDepth = depth;
	});
	return (
		<Page key={pathname} depth={depth}>
			{children}
		</Page>
	);
}
