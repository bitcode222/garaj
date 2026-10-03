"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Maximize2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { navigateFromSheet } from "@/lib/sheets";
import { useIsReady } from "@/lib/store/hooks";

/**
 * Detail overlay (appointment, customer, vehicle, work order, invoice). The
 * controls live in the top bar: open the full page, edit, close. Also handles
 * the three states every detail needs: loading skeleton, record deleted while
 * open (closes itself), and the footer for primary actions.
 */
export function DetailSheet({ open, onOpenChange, title, description, entity, missing = "Elementul a fost șters.", fullPage, onEdit, editLabel = "Editează", footer, children }) {
	const router = useRouter();
	const ready = useIsReady();
	const gone = ready && !entity;
	useEffect(() => {
		if (gone && open) {
			toast.info(missing);
			onOpenChange(false);
		}
	}, [gone, open, missing, onOpenChange]);

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			description={description}
			size="lg"
			headerActions={
				entity && (
					<>
						{onEdit && (
							<Button variant="ghost" size="icon" className="size-10 text-muted-foreground md:size-9" onClick={onEdit} aria-label={editLabel} title={editLabel}>
								<Pencil />
							</Button>
						)}
						{fullPage && (
							<Button variant="ghost" size="icon" className="size-10 text-muted-foreground md:size-9" onClick={() => navigateFromSheet(router, fullPage)} aria-label="Deschide pagina completă" title="Pagina completă">
								<Maximize2 />
							</Button>
						)}
					</>
				)
			}
			footer={footer}
		>
			{ready && entity ? (
				children
			) : (
				<div className="space-y-3 pt-2">
					<Skeleton className="h-14 w-full rounded-md" />
					<Skeleton className="h-32 w-full rounded-md" />
					<Skeleton className="h-24 w-full rounded-md" />
				</div>
			)}
		</Sheet>
	);
}
