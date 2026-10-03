import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const WIDTHS = {
	narrow: "max-w-3xl",
	default: "max-w-6xl",
	wide: "max-w-[1440px]",
};

/** Page gutters and max width. Every route renders inside one Page. */
export function Page({ width = "default", embedded = false, className, children }) {
	// Embedded: rendered inside a sheet, which already provides gutters and scrolling.
	if (embedded) return <div className={cn("space-y-5", className)}>{children}</div>;
	return (
		<div className={cn("mx-auto w-full px-4 pt-4 pb-10 md:px-6 md:pt-6 lg:px-8 lg:pt-8", WIDTHS[width], className)}>
			{children}
		</div>
	);
}

/** Title block: optional back link, title, description, actions, extra meta row. */
export function PageHeader({ title, description, back, actions, meta, embedded = false, className }) {
	// Embedded: the sheet's own header carries the title and back/close controls.
	if (embedded) {
		return (
			<header className={cn("flex flex-col gap-3", className)}>
				{meta}
				{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
			</header>
		);
	}
	return (
		<header className={cn("mb-5 flex flex-col gap-3 md:mb-6", className)}>
			{back && (
				<Link
					href={back.href}
					className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-md py-0.5 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronLeft className="size-4" aria-hidden />
					{back.label}
				</Link>
			)}
			<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
				<div className="min-w-0 space-y-1">
					<h1 className="text-[1.375rem] leading-7 font-semibold tracking-tight md:text-title">{title}</h1>
					{description && <p className="text-sm text-muted-foreground">{description}</p>}
				</div>
				{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
			</div>
			{meta}
		</header>
	);
}

export function Section({ title, description, action, className, children, id }) {
	return (
		<section id={id} className={cn("space-y-3", className)}>
			{(title || action) && (
				<div className="flex items-end justify-between gap-3">
					<div className="min-w-0">
						{title && <h2 className="text-heading">{title}</h2>}
						{description && <p className="text-xs text-muted-foreground">{description}</p>}
					</div>
					{action}
				</div>
			)}
			{children}
		</section>
	);
}

export function Toolbar({ className, children }) {
	return <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/** Detail layout: content + a sticky summary column from xl up. */
export function SplitView({ main, aside, stacked = false, className }) {
	if (stacked) {
		return (
			<div className={cn("space-y-6", className)}>
				{main}
				{aside}
			</div>
		);
	}
	return (
		<div className={cn("grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]", className)}>
			<div className="min-w-0 space-y-6">{main}</div>
			<aside className="min-w-0 space-y-6 xl:sticky xl:top-8 xl:self-start">{aside}</aside>
		</div>
	);
}

export function Overline({ className, children }) {
	return <p className={cn("text-2xs font-medium tracking-wider text-muted-foreground uppercase", className)}>{children}</p>;
}

/** Bottom action bar on phones (above the tab bar); inline from md up. */
export function StickyBar({ inline = false, className, children }) {
	if (inline) return <div className={cn("flex gap-2", className)}>{children}</div>;
	return (
		<div
			data-print="hide"
			className={cn(
				"fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-bottom))] z-30 flex gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none",
				className,
			)}
		>
			{children}
		</div>
	);
}
