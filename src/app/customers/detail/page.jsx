import { Suspense } from "react";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { CustomerDetail } from "@/features/customers/customer-detail";

export const metadata = { title: "Client" };

export default function Page() {
	return (
		<Suspense fallback={<DetailPageSkeleton />}>
			<CustomerDetail />
		</Suspense>
	);
}
