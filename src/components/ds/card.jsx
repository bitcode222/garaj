import { cn } from "@/lib/utils";

/** Flat sheet with a hairline border (elevation e0). */
export function Card({ className, ...props }) {
	return <div className={cn("rounded-xl border bg-card text-card-foreground", className)} {...props} />;
}

export function CardHeader({ title, description, action, icon: Icon, className, children }) {
	return (
		<div className={cn("flex items-start justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5", className)}>
			<div className="flex min-w-0 items-center gap-2.5">
				{Icon && (
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
						<Icon className="size-4" aria-hidden />
					</span>
				)}
				<div className="min-w-0">
					{title && <h3 className="truncate text-heading">{title}</h3>}
					{description && <p className="text-xs text-muted-foreground">{description}</p>}
				</div>
			</div>
			{action}
			{children}
		</div>
	);
}

export function CardContent({ className, ...props }) {
	return <div className={cn("p-4 md:p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
	return <div className={cn("flex items-center gap-2 border-t px-4 py-3 md:px-5", className)} {...props} />;
}
