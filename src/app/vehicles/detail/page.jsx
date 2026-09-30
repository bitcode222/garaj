import { Suspense } from "react";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { VehicleDetail } from "@/features/vehicles/vehicle-detail";

export const metadata = { title: "Mașină" };

export default function Page() {
	return (
		<Suspense fallback={<DetailPageSkeleton />}>
			<VehicleDetail />
		</Suspense>
	);
}
