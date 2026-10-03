"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ds/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsReady } from "@/lib/store/hooks";

/**
 * Read-only detail overlay (appointment, customer, vehicle). Same panel as
 * `Sheet`, plus the three states every detail needs: loading skeleton,
 * entity deleted while open (closes itself), and an "open full page" link.
 */
export function DetailSheet({ open, onOpenChange, title, description, entity, missing = "Elementul a fost șters.", fullPage, footer, children }) {
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
			footer={
				footer || fullPage ? (
					<>
						{fullPage && (
							<Link
								href={fullPage}
								prefetch={false}
								onClick={() => onOpenChange(false)}
								aria-label="Pagina completă"
								className="mr-auto inline-flex h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground max-md:w-11 max-md:flex-none! md:h-9"
							>
								<ExternalLink className="size-4" aria-hidden /> <span className="max-md:sr-only">Pagina completă</span>
							</Link>
						)}
						{footer}
					</>
				) : undefined
			}
		>
			{ready && entity ? (
				children
			) : (
				<div className="space-y-3 pt-2">
					<Skeleton className="h-14 w-full rounded-xl" />
					<Skeleton className="h-32 w-full rounded-xl" />
					<Skeleton className="h-24 w-full rounded-xl" />
				</div>
			)}
		</Sheet>
	);
}
