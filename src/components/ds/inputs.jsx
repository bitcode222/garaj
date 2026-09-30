"use client";

import { Search, X } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseMoney, parseQuantity, toInputAmount } from "@/domain/money";
import { cn } from "@/lib/utils";
import { tone as toneOf } from "@/lib/tones";

/** Label + control + hint or error. Pass a render function to get the id. */
export function Field({ label, hint, error, required, className, children }) {
	const id = useId();
	return (
		<div className={cn("grid content-start gap-1.5", className)}>
			{label && (
				<Label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
					{label}
					{required && <span className="text-destructive">*</span>}
				</Label>
			)}
			{typeof children === "function" ? children(id) : children}
			{error ? (
				<p className="text-xs text-destructive" role="alert">
					{error}
				</p>
			) : hint ? (
				<p className="text-xs text-muted-foreground">{hint}</p>
			) : null}
		</div>
	);
}

/** Money input in lei: accepts "1.234,56", "1234.5"; emits bani on every valid keystroke. */
export function MoneyInput({ value, onValueChange, currency = "RON", className, ...props }) {
	const [draft, setDraft] = useState(null);
	return (
		<div className="relative">
			<Input
				inputMode="decimal"
				autoComplete="off"
				value={draft ?? toInputAmount(value)}
				onFocus={(e) => {
					setDraft(toInputAmount(value));
					e.target.select();
				}}
				onChange={(e) => {
					setDraft(e.target.value);
					const parsed = parseMoney(e.target.value);
					if (parsed != null) onValueChange(parsed);
				}}
				onBlur={() => setDraft(null)}
				className={cn("pr-10 text-right tabular-nums", className)}
				{...props}
			/>
			<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
				{currency === "EUR" ? "€" : "lei"}
			</span>
		</div>
	);
}

/** Decimal input (quantities, hours, km). */
export function NumberInput({ value, onValueChange, decimals = 3, suffix, className, ...props }) {
	const [draft, setDraft] = useState(null);
	const shown = value == null || Number.isNaN(value) ? "" : String(value).replace(".", ",");
	return (
		<div className="relative">
			<Input
				inputMode={decimals ? "decimal" : "numeric"}
				autoComplete="off"
				value={draft ?? shown}
				onFocus={(e) => {
					setDraft(shown);
					e.target.select();
				}}
				onChange={(e) => {
					setDraft(e.target.value);
					if (e.target.value.trim() === "") return onValueChange(null);
					const parsed = parseQuantity(e.target.value, decimals);
					if (parsed != null) onValueChange(parsed);
				}}
				onBlur={() => setDraft(null)}
				className={cn("tabular-nums", suffix && "pr-11", className)}
				{...props}
			/>
			{suffix && (
				<span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
					{suffix}
				</span>
			)}
		</div>
	);
}

export function SearchInput({ value, onChange, placeholder = "Caută…", className, ...props }) {
	return (
		<div className={cn("relative", className)}>
			<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
			<Input
				type="search"
				inputMode="search"
				enterKeyHint="search"
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
				{...props}
			/>
			{value && (
				<button
					type="button"
					onClick={() => onChange("")}
					className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
					aria-label="Șterge căutarea"
				>
					<X className="size-4" />
				</button>
			)}
		</div>
	);
}

/**
 * Segmented control — the calendar's view tabs. With `collapse`, inactive
 * options show only their icon and the active one expands to its label
 * (grid-template-columns transition, no JS animation).
 */
export function Segmented({ value, onValueChange, options, collapse = false, className, ...props }) {
	return (
		<div role="tablist" className={cn("inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1", className)} {...props}>
			{options.map((option) => {
				const active = option.value === value;
				const Icon = option.icon;
				return (
					<button
						key={option.value}
						type="button"
						role="tab"
						aria-selected={active}
						aria-label={collapse ? option.label : undefined}
						onClick={() => onValueChange(option.value)}
						className={cn(
							"inline-flex h-full min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
							active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
							!collapse && "px-2.5",
						)}
					>
						{Icon && <Icon className="size-4 shrink-0" aria-hidden />}
						{collapse ? (
							<span
								className={cn(
									"grid transition-[grid-template-columns,opacity] duration-200 ease-(--ease-soft)",
									active ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0",
								)}
							>
								<span className="overflow-hidden whitespace-nowrap">
									<span className="pl-1.5">{option.label}</span>
								</span>
							</span>
						) : (
							option.label && <span className={cn(Icon && "ml-1.5")}>{option.label}</span>
						)}
						{option.count != null && !collapse && (
							<span className="ml-1.5 rounded-full bg-background/60 px-1.5 text-2xs tabular-nums">{option.count}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

/** Horizontally scrolling single-select pills with counts. */
export function FilterChips({ value, onChange, options, className }) {
	return (
		<div className={cn("no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0", className)}>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						aria-pressed={active}
						onClick={() => onChange(option.value)}
						className={cn(
							"inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors md:h-8 md:px-3",
							active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
						)}
					>
						{option.tone && <span className={cn("size-2 rounded-full", toneOf(option.tone).solid)} aria-hidden />}
						{option.label}
						{option.count != null && <span className={cn("tabular-nums", active ? "opacity-70" : "opacity-60")}>{option.count}</span>}
					</button>
				);
			})}
		</div>
	);
}
