import Link from "next/link";
import { cn } from "@/lib/utils";
import { tone as toneOf } from "@/lib/tones";
import { fmtDate } from "@/lib/format";
import { formatMoney } from "@/domain/money";
import { getState } from "@/lib/store/store";

/** Money in bani → "1.234,56 lei". Tabular; negative values in red. */
export function Money({ value, currency, decimals = 2, sign = false, muted = false, className }) {
	const cur = currency ?? getState().settings.currency;
	return (
		<span
			className={cn(
				"tabular-nums whitespace-nowrap",
				value < 0 && "text-red-600 dark:text-red-400",
				muted && !value && "text-muted-foreground",
				className,
			)}
		>
			{formatMoney(value, cur, { decimals, sign })}
		</span>
	);
}

/** The calendar's "today" tile: month strip + day number. */
export function DateTile({ date, size = "md", tone, className }) {
	if (!date) return null;
	return (
		<span
			className={cn(
				"inline-flex shrink-0 flex-col overflow-hidden rounded-lg border bg-card text-center leading-none",
				size === "sm" ? "w-10" : size === "lg" ? "w-14" : "w-12",
				className,
			)}
		>
			<span
				className={cn(
					"py-1 text-2xs font-semibold tracking-wide uppercase",
					tone ? `${toneOf(tone).solid} text-white` : "bg-primary text-primary-foreground",
				)}
			>
				{fmtDate(date, "MMM").replace(".", "")}
			</span>
			<span className={cn("py-1.5 font-bold tabular-nums", size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base")}>
				{fmtDate(date, "d")}
			</span>
		</span>
	);
}

/** KPI tile. */
export function Stat({ label, value, hint, icon: Icon, tone, href, className, children }) {
	const body = (
		<>
			<div className="flex items-start justify-between gap-2">
				<p className="text-xs font-medium text-muted-foreground">{label}</p>
				{Icon && (
					<span
						className={cn(
							"-mt-0.5 -mr-0.5 flex size-7 items-center justify-center rounded-md border",
							tone ? toneOf(tone).chip : "border-transparent bg-muted text-muted-foreground",
						)}
					>
						<Icon className="size-3.5" aria-hidden />
					</span>
				)}
			</div>
			<p className="figure mt-1.5 text-2xl leading-8 font-semibold tracking-tight">{value}</p>
			{hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
			{children}
		</>
	);
	const cls = cn("block min-w-0 rounded-xl border bg-card p-4", href && "transition-colors hover:bg-accent/50", className);
	return href ? (
		<Link href={href} className={cls}>
			{body}
		</Link>
	) : (
		<div className={cls}>{body}</div>
	);
}

export function KeyValue({ label, mono = false, className, children }) {
	return (
		<div className={cn("min-w-0", className)}>
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className={cn("mt-0.5 truncate text-sm font-medium", mono && "font-mono text-[13px]")}>{children ?? "—"}</dd>
		</div>
	);
}

export function KeyValueGrid({ className, children }) {
	return <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3", className)}>{children}</dl>;
}

export function Meter({ value, max, tone = "neutral", className, label }) {
	const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
	return (
		<div
			className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
			role="meter"
			aria-valuenow={value}
			aria-valuemin={0}
			aria-valuemax={max}
			aria-label={label}
		>
			<div className={cn("h-full rounded-full transition-[width] duration-500", toneOf(tone).bar)} style={{ width: `${pct}%` }} />
		</div>
	);
}

export function Initials({ name, tone = "neutral", size = "md", className }) {
	const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
	const text = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
	return (
		<span
			title={name}
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase",
				size === "sm" ? "size-6 text-2xs" : size === "lg" ? "size-11 text-sm" : "size-8 text-xs",
				toneOf(tone).chip,
				className,
			)}
		>
			{text}
		</span>
	);
}

export function EmptyState({ icon: Icon, title, description, action, compact = false, className }) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center",
				compact ? "py-8" : "py-14",
				className,
			)}
		>
			{Icon && (
				<span className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
					<Icon className="size-5 text-muted-foreground" aria-hidden />
				</span>
			)}
			<p className="font-medium">{title}</p>
			{description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}

export function Banner({ tone = "blue", icon: Icon, title, action, className, children }) {
	return (
		<div className={cn("flex flex-wrap items-start gap-3 rounded-xl border p-3.5 md:items-center", toneOf(tone).chip, className)}>
			{Icon && <Icon className="mt-0.5 size-4 shrink-0 md:mt-0" aria-hidden />}
			<div className="min-w-0 flex-1 basis-56 text-sm">
				{title && <p className="font-medium">{title}</p>}
				{children && <div className="opacity-90">{children}</div>}
			</div>
			{action}
		</div>
	);
}

export function Kbd({ className, children }) {
	return (
		<kbd className={cn("rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground", className)}>
			{children}
		</kbd>
	);
}

/** Vertical activity list with tone dots. items: { id, icon, tone, title, meta, content } */
export function Timeline({ items, className }) {
	return (
		<ol className={cn("relative space-y-4", className)}>
			{items.map((item, i) => {
				const Icon = item.icon;
				return (
					<li key={item.id} className="relative flex gap-3">
						{i < items.length - 1 && <span className="absolute top-7 bottom-[-12px] left-[13px] w-px bg-border" aria-hidden />}
						<span
							className={cn(
								"relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
								toneOf(item.tone ?? "neutral").chip,
							)}
						>
							{Icon && <Icon className="size-3.5" aria-hidden />}
						</span>
						<div className="min-w-0 flex-1 pt-0.5">
							<div className="flex flex-wrap items-baseline justify-between gap-x-3">
								<p className="text-sm font-medium">{item.title}</p>
								{item.meta && <p className="text-xs text-muted-foreground">{item.meta}</p>}
							</div>
							{item.content && <div className="mt-1 text-sm text-muted-foreground">{item.content}</div>}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
