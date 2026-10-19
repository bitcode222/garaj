import { Suspense } from "react";
import { CalendarPage } from "@/features/calendar/calendar-page";

export const metadata = { title: "Calendar" };

// The day, the view and a booking come in the address (?day=…&view=…&id=…): Suspense for the static export.
export default function Page() {
	return (
		<Suspense fallback={null}>
			<CalendarPage />
		</Suspense>
	);
}
