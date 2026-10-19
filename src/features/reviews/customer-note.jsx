"use client";

import { Star } from "lucide-react";
import { latestNoteOn } from "@/domain/review";
import { REVIEW_TAGS } from "@/lib/labels";
import { useCollection } from "@/lib/store/hooks";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/**
 * What the admin noted about a customer the last time (docs/VISIT-FLOW.md §6.4): stars, tags
 * and the start of the note, one quiet line. Nothing when there is no note.
 */
export function CustomerNote({ customerId, className }) {
	const reviews = useCollection("reviews");
	const note = customerId ? latestNoteOn(reviews, customerId) : null;
	if (!note) return null;
	const words = [...(note.tags ?? []).map((tag) => REVIEW_TAGS[tag]), note.note?.trim()].filter(Boolean).join(" · ");
	return (
		<p className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)} title={note.note || undefined}>
			{note.rating ? (
				<span className={cn("inline-flex shrink-0 items-center gap-0.5 font-semibold", tone("yellow").text)}>
					<Star className="size-3.5 fill-current" aria-hidden />
					{note.rating}
				</span>
			) : null}
			<span className="sr-only">Nota ta despre client:</span>
			<span className="truncate">{words || "fără notiță"}</span>
		</p>
	);
}
