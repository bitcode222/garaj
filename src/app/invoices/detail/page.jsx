import { Suspense } from "react";
import { DetailPageSkeleton } from "@/components/ds/skeletons";
import { InvoiceDetail } from "@/features/invoices/invoice-detail";

export const metadata = { title: "Factură" };

export default function Page() {
	return (
		<Suspense fallback={<DetailPageSkeleton />}>
			<InvoiceDetail />
		</Suspense>
	);
}
