"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Text edited in place (docs/VISIT-FLOW.md D6): it reads as text with a pencil; a click or
 * tap turns it into a field. Enter or leaving the field saves, Esc gives up (before the
 * sheet around it hears it). `onSave(text)` gets the trimmed text, only when it changed.
 */
export function InlineText({ value, placeholder, label, onSave, className }) {
	const [draft, setDraft] = useState(null); // null: not editing
	const field = useRef(null);
	const editing = draft !== null;

	// Esc belongs to the field while it is open: caught before the sheet's own Esc closes the sheet.
	useEffect(() => {
		if (!editing) return undefined;
		const onKey = (event) => {
			if (event.key !== "Escape" || event.target !== field.current) return;
			event.stopPropagation();
			event.preventDefault();
			setDraft(null);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [editing]);

	const save = () => {
		const text = (draft ?? "").trim();
		setDraft(null);
		if (text !== (value ?? "")) onSave(text);
	};

	if (editing) {
		return (
			<input
				ref={field}
				autoFocus
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={save}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						save();
					}
				}}
				placeholder={placeholder}
				aria-label={label}
				className={cn("-mx-1.5 h-9 w-full rounded-md border border-input bg-background px-1.5 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 md:h-8 md:text-sm", className)}
			/>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setDraft(value ?? "")}
			aria-label={`${label}: ${value || placeholder}. Editează`}
			className={cn("group -mx-1.5 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-accent md:min-h-8", className)}
		>
			<span className={cn("truncate", !value && "italic opacity-70")}>{value || placeholder}</span>
			<Pencil className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60 pointer-coarse:opacity-60" aria-hidden />
		</button>
	);
}
