"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import { toast } from "@/lib/toast";
import { ConfirmProvider } from "@/components/ds/confirm";
import { Toaster } from "@/components/ui/sonner";
import { useKeyboardInset } from "@/lib/keyboard";
import { initStore } from "@/lib/store/store";
import { useStoreValue } from "@/lib/store/hooks";

const isNative = () => typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());

function StoreBoot() {
	const { resolvedTheme } = useTheme();
	const saveError = useStoreValue("saveError");
	useKeyboardInset();

	useEffect(() => {
		initStore();
		if (isNative()) document.documentElement.dataset.native = "ios";
	}, []);

	// Status bar text must contrast with the app theme, not the system one.
	useEffect(() => {
		if (!resolvedTheme || !isNative()) return;
		import("@capacitor/status-bar")
			.then(({ StatusBar, Style }) => StatusBar.setStyle({ style: resolvedTheme === "dark" ? Style.Dark : Style.Light }))
			.catch(() => {});
	}, [resolvedTheme]);

	useEffect(() => {
		if (saveError) toast.error("Datele nu au putut fi salvate pe acest dispozitiv.", { description: saveError });
	}, [saveError]);

	return null;
}

export function Providers({ children }) {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
			<ConfirmProvider>
				<StoreBoot />
				{children}
				<Toaster
					position="top-center"
					offset={{ top: 16 }}
					mobileOffset={{ top: "calc(var(--safe-top) + 64px)" }}
					toastOptions={{ classNames: { toast: "!rounded-xl" } }}
				/>
			</ConfirmProvider>
		</ThemeProvider>
	);
}
