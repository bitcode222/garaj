"use client";

import Link from "next/link";
import { LogOut, Monitor, Moon, Settings, Sun, UsersRound } from "lucide-react";
import { useTheme } from "next-themes";
import { Initials } from "@/components/ds/data";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCollection } from "@/lib/store/hooks";
import { useHydrated, useLocalPreference } from "@/lib/hooks";
import { STAFF_ROLES } from "@/lib/labels";
import { cn } from "@/lib/utils";

// The account is the team member working at this device. There is no password: it says who is at the counter, nothing more.
export const ACCOUNT_KEY = "garaj.account";

/** The active team member the device is set to, or null when nobody is chosen (or the chosen one was removed or deactivated). */
export function useAccount() {
	const staff = useCollection("staff");
	const [id, setId] = useLocalPreference(ACCOUNT_KEY, "");
	const member = id && staff[id]?.active ? staff[id] : null;
	return { member, staff, setId };
}

const THEMES = [
	{ value: "system", label: "Automată", icon: Monitor },
	{ value: "light", label: "Luminoasă", icon: Sun },
	{ value: "dark", label: "Întunecată", icon: Moon },
];

/**
 * The account corner: who is at this device, switch account, log out, the theme and settings. Used in the phone's
 * top bar and as the fixed top-right corner on md and up (`className`).
 */
export function AccountMenu({ className }) {
	const { member, staff, setId } = useAccount();
	const { theme, setTheme } = useTheme();
	const mounted = useHydrated();
	const team = Object.values(staff)
		.filter((s) => s.active)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const name = member?.name ?? "Nimeni conectat";
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon-touch" className={cn("rounded-full p-0", className)} aria-label={`Cont: ${name}`} title={name}>
					{member ? <Initials name={member.name} tone={member.color} size="sm" /> : <UsersRound className="size-5" />}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
					<span className="truncate text-sm font-semibold">{name}</span>
					<span className="text-xs font-normal text-muted-foreground">{member ? STAFF_ROLES[member.role] ?? "" : "Alege cine lucrează acum"}</span>
				</DropdownMenuLabel>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<UsersRound /> Schimbă contul
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-60">
						<DropdownMenuRadioGroup value={member?.id ?? ""} onValueChange={setId}>
							{team.map((s) => (
								<DropdownMenuRadioItem key={s.id} value={s.id}>
									{s.name}
									<span className="ml-auto text-xs text-muted-foreground">{STAFF_ROLES[s.role]}</span>
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
						{!team.length && <DropdownMenuItem disabled>Nicio persoană în echipă</DropdownMenuItem>}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuItem disabled={!member} onSelect={() => setId("")}>
					<LogOut /> Deconectează-te
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-xs text-muted-foreground">Temă</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={mounted ? (theme ?? "system") : "system"} onValueChange={setTheme}>
					{THEMES.map(({ value, label, icon: Icon }) => (
						<DropdownMenuRadioItem key={value} value={value}>
							<Icon /> {label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/settings/">
						<Settings /> Setări
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
