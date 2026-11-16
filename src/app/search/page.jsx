import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { SearchPage } from "@/features/search/search-page";

export const metadata = { title: "Caută" };

export default function Page() {
	return (
		<Suspense fallback={<ListPageSkeleton />}>
			<SearchPage />
		</Suspense>
	);
}
