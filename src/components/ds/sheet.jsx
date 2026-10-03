"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { createContext, useContext, useRef } from "react";
import { cn } from "@/lib/utils";

/** Position in the global sheet stack. A sheet above another reuses the scrim below it. */
export const SheetDepth = createContext(0);

/**
 * Create/edit surface: a bottom sheet on phones, a right-hand panel from md up.
 * Focus moves to the panel, not the first input, so the iOS keyboard does not
 * pop up before the user chooses a field.
 */
export function Sheet({ open, onOpenChange, title, description, headerActions, footer, size = "md", className, children }) {
	const contentRef = useRef(null);
	const depth = useContext(SheetDepth);
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				{depth === 0 && <DialogPrimitive.Overlay className="scrim" />}
				<DialogPrimitive.Content
					ref={contentRef}
					tabIndex={-1}
					onOpenAutoFocus={(event) => {
						event.preventDefault();
						contentRef.current?.focus();
					}}
					className={cn(
						"fixed z-50 flex flex-col bg-card text-card-foreground shadow-2xl outline-none",
						"inset-x-0 bottom-0 max-h-[92dvh] border-t duration-300",
						"max-md:data-[state=closed]:animate-out max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:animate-in max-md:data-[state=open]:slide-in-from-bottom",
						"md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-full md:border-t-0 md:border-l",
						"md:data-[state=closed]:animate-out md:data-[state=closed]:slide-out-to-right md:data-[state=open]:animate-in md:data-[state=open]:slide-in-from-right",
						size === "xl" ? "md:max-w-4xl" : size === "lg" ? "md:max-w-2xl" : "md:max-w-md",
						depth > 0 && "shadow-[0_0_0_1px_var(--border),-24px_0_48px_-12px_oklch(0_0_0/0.25)]",
						className,
					)}
				>
					<div className="mx-auto mt-2 h-1 w-10 shrink-0 bg-border md:hidden" aria-hidden />
					<div className="shrink-0 px-4 pt-3 pb-3 md:px-6 md:pt-5">
						{/* Top bar: back (when stacked) and the sheet's controls on the left, close on the right. */}
						<div className="-mx-2 flex min-h-10 items-center gap-0.5 md:min-h-9">
							{depth > 0 && (
								<button
									type="button"
									onClick={() => onOpenChange(false)}
									className="flex h-10 items-center gap-1 rounded-md pr-3 pl-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:h-9"
									aria-label="Înapoi"
								>
									<ArrowLeftIcon className="size-4" /> Înapoi
								</button>
							)}
							{headerActions}
							<DialogPrimitive.Close
								className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-9"
								aria-label="Închide"
							>
								<XIcon className="size-4" />
							</DialogPrimitive.Close>
						</div>
						<div className="mt-1 min-w-0">
							<DialogPrimitive.Title className="text-heading">{title}</DialogPrimitive.Title>
							<DialogPrimitive.Description className={description ? "mt-0.5 text-sm text-muted-foreground" : "sr-only"}>
								{description ?? title}
							</DialogPrimitive.Description>
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-6"><SheetDepth.Provider value={depth + 1}>{children}</SheetDepth.Provider></div>
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
