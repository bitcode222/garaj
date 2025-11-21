import React, { Suspense } from "react";
import { Calendar } from "@/components/calendar/calendar";
import { CalendarSkeleton } from "@/components/calendar/skeletons/calendar-skeleton";

export default function HomeCalendar() {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <Calendar />
    </Suspense>
  );
}
