import { cn } from "@/lib/utils";

/** Garage door under a roof, on the brand color. */
export function LogoMark({ className }) {
	return (
		<span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground", className)}>
			<svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
				<path d="M3 10.5 12 4l9 6.5" />
				<path d="M6.5 13h11M6.5 16.5h11M6.5 20h11" />
			</svg>
		</span>
	);
}
