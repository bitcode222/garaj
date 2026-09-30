import { Skeleton } from "@/components/ui/skeleton";
import { Page } from "./page";

/** Loading states mirror the final layout so nothing jumps when data arrives. */
export function ListPageSkeleton({ stats = false, rows = 8 }) {
	return (
		<Page>
			<div className="mb-6 space-y-2">
				<Skeleton className="h-7 w-40" />
				<Skeleton className="h-4 w-64" />
			</div>
			{stats && (
				<div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
					{Array.from({ length: 4 }, (_, i) => (
						<Skeleton key={i} className="h-[106px] rounded-xl" />
					))}
				</div>
			)}
			<div className="mb-4 flex gap-2">
				<Skeleton className="h-11 flex-1 rounded-md md:h-9 md:max-w-sm" />
				<Skeleton className="hidden h-9 w-72 rounded-full md:block" />
			</div>
			<div className="overflow-hidden rounded-xl border bg-card">
				{Array.from({ length: rows }, (_, i) => (
					<div key={i} className="flex h-[60px] items-center gap-3 border-b px-4 last:border-0 md:h-12">
						<Skeleton className="size-9 rounded-lg" />
						<div className="flex-1 space-y-1.5">
							<Skeleton className="h-3.5 w-1/3" />
							<Skeleton className="h-3 w-1/4" />
						</div>
						<Skeleton className="h-5 w-20" />
					</div>
				))}
			</div>
		</Page>
	);
}

export function DetailPageSkeleton() {
	return (
		<Page>
			<div className="mb-6 space-y-3">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-56" />
			</div>
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
				<div className="space-y-6">
					<Skeleton className="h-48 rounded-xl" />
					<Skeleton className="h-80 rounded-xl" />
				</div>
				<div className="space-y-6">
					<Skeleton className="h-40 rounded-xl" />
					<Skeleton className="h-56 rounded-xl" />
				</div>
			</div>
		</Page>
	);
}
