import { cn } from "@/lib/utils";

/** A G drawn as the arc of a wheel, on the brand color. */
export function LogoMark({ className }) {
	return (
		<span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground", className)}>
			<svg viewBox="0 0 24 24" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
				<path d="M19.6 8.4A8.6 8.6 0 1 0 20.6 12.6H13" />
			</svg>
		</span>
	);
}
