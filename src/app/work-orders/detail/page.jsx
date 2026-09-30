import { Suspense } from "react";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { WorkOrderDetail } from "@/features/work-orders/work-order-detail";

export const metadata = { title: "Lucrare" };

export default function Page() {
	return (
		<Suspense fallback={<DetailPageSkeleton />}>
			<WorkOrderDetail />
		</Suspense>
	);
}
