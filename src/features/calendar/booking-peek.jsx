"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import { Initials, Money } from "@/components/ds/data";
import { PlateTag, VehicleLabel } from "@/components/ds/make-logo";
import { StatusBadge } from "@/components/ds/tone";
import { minutesBetween } from "@/domain/dates";
import { bookingMark } from "@/domain/visit";
import { orderTotals } from "@/domain/work-order";
import { fmtDate, fmtTime, fmtWorkOrder } from "@/lib/format";
import { APPOINTMENT_STATUS, BOOKING_MARK, WORK_ORDER_STATUS } from "@/lib/labels";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { CustomerNote } from "@/features/reviews/customer-note";
import { BookingWarnings } from "./booking-warnings";

const OPEN_MS = 120; // resting on a card this long opens its details; a pointer only passing over opens nothing
const WARM_MS = 400; // once one was open, the next card's open at once for this long
const LEAVE_MS = 200; // the pointer may cross from the card onto the details (and use their buttons)
const GAP = 8;

const durationLabel = (m) => (m < 60 ? `${m} min` : `${(m / 60).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} h`);

/** One line of the list: its name on the left, its value on the right; nothing without a value. */
function Item({ label, children }) {
	if (children == null || children === false || children === "") return null;
	return (
		<>
			<dt className="pt-px text-xs text-muted-foreground">{label}</dt>
			<dd className="min-w-0">{children}</dd>
		</>
	);
}

/** The details of one booking, placed beside its card (or under it, when the card is too wide). */
function PeekCard({ id, rect, controls }) {
	const box = useRef(null);
	const settings = useSettings();
	const a = useEntity("appointments", id);
	const customer = useEntity("customers", a?.customerId);
	const vehicle = useEntity("vehicles", a?.vehicleId);
	const mechanic = useEntity("staff", a?.staffId);
	const bay = useEntity("bays", a?.bayId);
	const workOrders = useCollection("workOrders");
	const services = useCollection("services");

	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		// Beside the card (right, else left), level with its top; under it (else over it) when neither side has room.
		let left = rect.right + GAP + w <= innerWidth - GAP ? rect.right + GAP : rect.left - GAP - w >= GAP ? rect.left - GAP - w : null;
		let top;
		if (left != null) top = Math.max(GAP, Math.min(rect.top, innerHeight - h - GAP));
		else {
			left = Math.max(GAP, Math.min(rect.left, innerWidth - w - GAP));
			top = rect.bottom + GAP + h <= innerHeight - GAP ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - h);
		}
		el.style.left = `${left}px`;
		el.style.top = `${top}px`;
		el.style.visibility = "visible";
	}, [rect, a]);

	if (!a) return null;
	const order = (a.workOrderId && workOrders[a.workOrderId]) || Object.values(workOrders).find((o) => o.appointmentId === a.id) || null;
	const mark = bookingMark(a, order);
	// The state beside what it is: the job's once the car is in, the booking's until then.
	const byOrder = mark !== "booking" && order;
	const totals = order?.lines?.length ? orderTotals(order, settings) : null;
	const serviceNames = a.operations ? a.operations.map((op) => op.name).filter(Boolean) : a.serviceIds?.map((sid) => services[sid]?.name).filter(Boolean);
	const active = a.status !== "cancelled" && a.status !== "no_show";
	// The complaint only when it says more than the services.
	const complaint = order?.complaint?.trim() && order.complaint.trim() !== serviceNames?.join(", ") ? order.complaint.trim() : null;
	// An arrival the customer announced, while it is still ahead (once passed, the warning "late" says it).
	const announced = (a.status === "scheduled" || a.status === "confirmed") && a.expectedAt && a.expectedAt > a.start && a.expectedAt > new Date().toISOString() ? a.expectedAt : null;

	return (
		<div
			ref={box}
			role="group"
			aria-label="Detaliile programării"
			data-booking-peek={a.id}
			onPointerEnter={() => controls.current?.keep()}
			onPointerLeave={() => controls.current?.release()}
			className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg transition-none animate-in fade-in-0 zoom-in-95 [animation-duration:120ms]"
			style={{ left: -9999, top: 0, visibility: "hidden" }}
		>
			<div className="flex items-center gap-1.5">
				<StatusBadge map={BOOKING_MARK} value={mark} size="sm" />
				{byOrder ? <StatusBadge map={WORK_ORDER_STATUS} value={order.status} size="sm" icon={false} /> : <StatusBadge map={APPOINTMENT_STATUS} value={a.status} size="sm" icon={false} />}
				{a.number != null && <span className="ml-auto text-xs text-muted-foreground tabular-nums">#{a.number}</span>}
			</div>
			<div className="mt-2.5 flex items-center justify-between gap-2">
				{vehicle ? <VehicleLabel vehicle={vehicle} nameClassName="font-semibold" /> : <span className="truncate font-semibold">{a.title || "Programare"}</span>}
				<PlateTag value={vehicle?.plate} />
			</div>
			<p className="mt-1 text-xs text-muted-foreground tabular-nums first-letter:uppercase">
				{fmtDate(a.start, "EEEE, d MMMM")} · {fmtTime(a.start)}–{fmtTime(a.end)} · {durationLabel(minutesBetween(a.start, a.end))}
			</p>
			{/* What needs attention, with its fixes (docs/WARNINGS.md); a fix closes the details. */}
			<BookingWarnings appointment={a} size="peek" limit={3} className="mt-3" onDone={() => controls.current?.close()} />
			<dl className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t pt-3">
				<Item label="Client">
					{customer && (
						<>
							<span className="block truncate">{customer.name}</span>
							{customer.phone && <span className="block text-xs text-muted-foreground tabular-nums">{customer.phone}</span>}
						</>
					)}
				</Item>
				<Item label="Mecanic">
					{mechanic ? (
						<span className="flex min-w-0 items-center gap-1.5">
							<Initials name={mechanic.name} tone={mechanic.color} size="sm" className="size-4 shrink-0 text-[8px]" />
							<span className="truncate">{mechanic.name}</span>
						</span>
					) : (
						<span className="text-muted-foreground">Nealocat</span>
					)}
				</Item>
				<Item label="Elevator">{bay?.name}</Item>
				<Item label="Servicii">{serviceNames?.length ? serviceNames.join(", ") : null}</Item>
				<Item label="Lucrare">
					{order && (
						<span className="tabular-nums">
							{fmtWorkOrder(order.number)}
							{totals?.gross ? (
								<>
									{" · "}
									<Money value={totals.gross} />
								</>
							) : null}
						</span>
					)}
				</Item>
				<Item label="Problemă">{complaint}</Item>
				<Item label="Motiv">{active ? null : a.cancelReason}</Item>
			</dl>
			{a.notes && <p className="mt-3 line-clamp-3 rounded-md bg-muted px-2.5 py-2 text-xs whitespace-pre-line">{a.notes}</p>}
			{announced && (
				<p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
					<Clock className="size-3.5 shrink-0" aria-hidden /> Anunțat: ajunge la {fmtTime(announced)}
				</p>
			)}
			{customer && <CustomerNote customerId={customer.id} className="mt-2" />}
		</div>
	);
}

/**
 * A booking's details while the mouse rests on its card (docs/APPOINTMENTS-AND-NAV.md): what it is
 * (booked, a job, finished) and its state, the car, when, who, what, the job and its value, and what
 * needs attention with its fixes (docs/WARNINGS.md). One for the whole calendar, found through the
 * cards' `data-appt`. The pointer may move onto it to use a fix; a click on the card still opens the
 * booking, and a phone (no hover) finds the same fixes in the booking's sheet.
 */
export function BookingPeek({ host }) {
	const [peek, setPeek] = useState(null); // { id, rect }
	const controls = useRef(null); // keep · release · close, for the details themselves

	useEffect(() => {
		const el = host.current;
		if (!el) return;
		let timer = 0;
		let pending = null;
		let shown = null;
		let warmUntil = 0;
		let held = null; // a card pressed (a click, a drag): no details for it until the pointer leaves it
		let leaving = 0;
		const cardOf = (target) => (target instanceof Element ? target.closest("[data-appt]") : null);
		const close = () => {
			clearTimeout(timer);
			clearTimeout(leaving);
			pending = null;
			if (shown) warmUntil = Date.now() + WARM_MS;
			shown = null;
			setPeek(null);
		};
		// Leaving the card (or the details) closes them a moment later, so the pointer can cross the gap.
		const release = () => {
			clearTimeout(leaving);
			leaving = setTimeout(close, LEAVE_MS);
		};
		const keep = () => clearTimeout(leaving);
		controls.current = { keep, release, close };
		const over = (event) => {
			if (event.pointerType !== "mouse" || event.buttons) return;
			const card = cardOf(event.target);
			if (!card || !el.contains(card)) return;
			const id = card.dataset.appt;
			keep(); // back on a card: what is open stays (or gives way to this card's)
			if (id === shown || id === pending || id === held) return;
			clearTimeout(timer);
			pending = id;
			timer = setTimeout(
				() => {
					pending = null;
					if (!card.isConnected) return;
					shown = id;
					setPeek({ id, rect: card.getBoundingClientRect() });
				},
				shown || Date.now() < warmUntil ? 0 : OPEN_MS,
			);
		};
		const out = (event) => {
			const card = cardOf(event.target);
			if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
			if (card.dataset.appt === held) held = null;
			clearTimeout(timer);
			pending = null;
			if (shown) release();
		};
		const down = (event) => {
			held = cardOf(event.target)?.dataset.appt ?? null;
			close();
		};
		const key = (event) => event.key === "Escape" && close();
		el.addEventListener("pointerover", over);
		el.addEventListener("pointerout", out);
		el.addEventListener("pointerdown", down);
		el.addEventListener("scroll", close, true);
		el.addEventListener("wheel", close, { passive: true });
		window.addEventListener("keydown", key);
		return () => {
			clearTimeout(timer);
			clearTimeout(leaving);
			controls.current = null;
			el.removeEventListener("pointerover", over);
			el.removeEventListener("pointerout", out);
			el.removeEventListener("pointerdown", down);
			el.removeEventListener("scroll", close, true);
			el.removeEventListener("wheel", close);
			window.removeEventListener("keydown", key);
		};
	}, [host]);

	if (!peek) return null;
	return createPortal(<PeekCard key={peek.id} id={peek.id} rect={peek.rect} controls={controls} />, document.body);
}
