"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { toast } from "@/lib/toast";
import { ConfirmProvider } from "@/components/ds/confirm";
import { Toaster } from "@/components/ui/sonner";
import { useKeyboardInset } from "@/lib/keyboard";
import { ensureAppointmentNumbers } from "@/lib/store/actions";
import { initStore } from "@/lib/store/store";
import { useStoreValue } from "@/lib/store/hooks";

function StoreBoot() {
	const saveError = useStoreValue("saveError");
	useKeyboardInset();

	useEffect(() => {
		// Data saved before bookings had numbers gets them once, as soon as it is loaded.
		initStore()
			.then(ensureAppointmentNumbers)
			.catch((error) => console.warn("[garaj] numbering bookings failed", error));
	}, []);

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
