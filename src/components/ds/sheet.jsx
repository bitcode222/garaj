"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Create/edit surface: a bottom sheet on phones, a right-hand panel from md up.
 * Focus moves to the panel, not the first input, so the iOS keyboard does not
 * pop up before the user chooses a field.
 */
export function Sheet({ open, onOpenChange, title, description, footer, size = "md", className, children }) {
	const contentRef = useRef(null);
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
				<DialogPrimitive.Content
					ref={contentRef}
					tabIndex={-1}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						contentRef.current?.focus();
					}}
					className={cn(
						"fixed z-50 flex flex-col bg-card text-card-foreground shadow-2xl outline-none",
						"inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t duration-300",
						"max-md:data-[state=closed]:animate-out max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:animate-in max-md:data-[state=open]:slide-in-from-bottom",
						"md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-full md:rounded-none md:rounded-l-2xl md:border-t-0 md:border-l",
						"md:data-[state=closed]:animate-out md:data-[state=closed]:slide-out-to-right md:data-[state=open]:animate-in md:data-[state=open]:slide-in-from-right",
						size === "lg" ? "md:max-w-2xl" : "md:max-w-md",
						className,
					)}
				>
					<div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" aria-hidden />
					<div className="flex shrink-0 items-start justify-between gap-4 px-4 pt-3 pb-3 md:px-6 md:pt-6">
						<div className="min-w-0">
							<DialogPrimitive.Title className="text-heading">{title}</DialogPrimitive.Title>
							<DialogPrimitive.Description className={description ? "mt-0.5 text-sm text-muted-foreground" : "sr-only"}>
								{description ?? title}
							</DialogPrimitive.Description>
						</div>
						<DialogPrimitive.Close
							className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
							aria-label="Închide"
						>
							<XIcon className="size-4" />
						</DialogPrimitive.Close>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-6">{children}</div>
					{footer && (
						<div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-card px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] md:px-6 md:pb-5 [&>*]:max-md:flex-1">
							{footer}
						</div>
					)}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
