"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/hooks";

const NEXT = { system: "light", light: "dark", dark: "system" };
const ICON = { system: Monitor, light: Sun, dark: Moon };
const LABEL = { system: "Temă: automată", light: "Temă: luminoasă", dark: "Temă: întunecată" };

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const mounted = useHydrated();
	// The stored theme is only known in the browser; render the neutral icon until then.
	const current = mounted ? (theme ?? "system") : "system";
	const Icon = ICON[current] ?? Monitor;
	return (
		<Button variant="ghost" size="icon-sm" onClick={() => setTheme(NEXT[current] ?? "system")} aria-label={LABEL[current]} title={LABEL[current]}>
			<Icon />
		</Button>
	);
}
