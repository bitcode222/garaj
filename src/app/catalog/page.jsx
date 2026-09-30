import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { CatalogPage } from "@/features/catalog/catalog-page";

export const metadata = { title: "Catalog" };

export default function Page() {
	return (
		<Suspense fallback={<ListPageSkeleton stats />}>
			<CatalogPage />
		</Suspense>
	);
}
