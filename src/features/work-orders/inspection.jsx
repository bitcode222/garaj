"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { INSPECTION_ITEMS } from "@/domain/work-order";
import { INSPECTION_STATUS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

/** Digital vehicle inspection: OK / attention / urgent per item, with an optional note. */
export function InspectionChecklist({ items, onChange, readOnly = false }) {
	const [noteOpen, setNoteOpen] = useState(null);
	const byKey = Object.fromEntries((items ?? []).map((i) => [i.key, i]));
	const set = (key, patch) => {
		const existing = byKey[key] ?? { key, status: null, note: "" };
		const next = { ...existing, ...patch };
		onChange(INSPECTION_ITEMS.map((i) => (i.key === key ? next : (byKey[i.key] ?? { key: i.key, status: null, note: "" }))));
	};

	return (
		<ul className="divide-y rounded-xl border">
			{INSPECTION_ITEMS.map(({ key, label }) => {
				const item = byKey[key] ?? { status: null, note: "" };
				return (
					<li key={key} className="px-3 py-2.5">
						<div className="flex flex-wrap items-center gap-2">
							<span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
							<div className="flex gap-1" role="radiogroup" aria-label={label}>
								{Object.entries(INSPECTION_STATUS).map(([value, meta]) => {
									const active = item.status === value;
									return (
										<button
											key={value}
											type="button"
											role="radio"
											aria-checked={active}
											disabled={readOnly}
											onClick={() => set(key, { status: active ? null : value })}
											className={cn(
												"h-9 rounded-md border px-2.5 text-xs font-medium transition-colors md:h-7",
												active ? tone(meta.tone).chip : "bg-card text-muted-foreground hover:text-foreground",
											)}
										>
											{meta.label}
										</button>
									);
								})}
							</div>
							{!readOnly && (
								<button
									type="button"
									onClick={() => setNoteOpen(noteOpen === key ? null : key)}
									className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:size-7"
									aria-label={`Notă pentru ${label}`}
								>
									<MessageSquarePlus className="size-4" />
								</button>
							)}
						</div>
						{(noteOpen === key || item.note) && (
							<Input
								value={item.note ?? ""}
								readOnly={readOnly}
								onChange={(e) => set(key, { note: e.target.value })}
								placeholder="ex. plăcuțe 3 mm, de schimbat în 1.000 km"
								className="mt-2 h-9 text-sm"
							/>
						)}
					</li>
				);
			})}
		</ul>
	);
}
