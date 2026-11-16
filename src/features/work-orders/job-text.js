// The words of a job (as the iPhone's JobText): what it is about, and one line of what is going on.

import { steps } from "@/domain/work-clock";

/** The client's request (first line), else the first lines of work, else the job number. */
export function jobHeadline(order) {
	const first = String(order.complaint ?? "").split("\n")[0].trim();
	if (first) return first;
	const names = (order.lines ?? []).filter((l) => !l.refused).map((l) => String(l.description ?? "").trim()).filter(Boolean);
	if (names.length) return names.slice(0, 2).join(" + ") + (names.length > 2 ? ` +${names.length - 2}` : "");
	return `Lucrarea #${order.number}`;
}

/** The mechanic's diagnosis, else how many operations and parts it has. */
export function jobSummary(order) {
	const diagnosis = String(order.diagnosis ?? "").trim();
	if (diagnosis) return diagnosis;
	const lines = (order.lines ?? []).filter((l) => !l.refused);
	if (!lines.length) return "Nicio operație încă. Adaugă ce e de făcut.";
	const labor = lines.filter((l) => l.kind === "labor").length;
	const parts = lines.filter((l) => l.kind === "part").length;
	return [labor && `${labor} ${labor === 1 ? "operație" : "operații"}`, parts && `${parts} ${parts === 1 ? "piesă" : "piese"}`].filter(Boolean).join(" · ");
}

/** "Pas 2 din 4", or null when the job has no lines. */
export function stepText(order) {
	const { total, done } = steps(order);
	return total ? `pas ${Math.min(done + 1, total)} din ${total}` : null;
}

/** "1:12:40": hours, minutes, seconds worked. */
export function clockText(ms) {
	const s = Math.floor(ms / 1000);
	return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
