"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export default function ConfirmDialog({ request, open, onSettle }) {
	return (
		<AlertDialog open={open} onOpenChange={(value) => !value && onSettle(false)}>
			<AlertDialogContent className="max-md:top-auto max-md:bottom-[calc(1rem+var(--safe-bottom))] max-md:translate-y-0">
				<AlertDialogHeader>
					<AlertDialogTitle>{request.title}</AlertDialogTitle>
					{request.description && <AlertDialogDescription>{request.description}</AlertDialogDescription>}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className="max-md:h-11" onClick={() => onSettle(false)}>
						{request.cancelLabel ?? "Renunță"}
					</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: request.destructive ? "destructive" : "default", className: "max-md:h-11" })}
						onClick={() => onSettle(true)}
					>
						{request.confirmLabel ?? "Continuă"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
