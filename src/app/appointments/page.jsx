import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ds/skeletons";
import { AppointmentsPage } from "@/features/appointments/appointments-page";

export const metadata = { title: "Toate programările" };

// The filters are in the address (?status=…), read with useSearchParams: Suspense for the static export.
export default function Page() {
	return (
		<Suspense fallback={<ListPageSkeleton stats rows={8} />}>
			<AppointmentsPage />
		</Suspense>
	);
}
