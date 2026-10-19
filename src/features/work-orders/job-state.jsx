"use client";

import { useState } from "react";
import { CircleX, KeyRound, PackageSearch, RotateCcw, Star, Undo2, Wrench } from "lucide-react";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ds/confirm";
import { FlowSteps } from "@/components/ds/flow-steps";
import { Field } from "@/components/ds/inputs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { JOB_STEPS, jobFlow, skippedSteps } from "@/domain/flow";
import { fmtDate } from "@/lib/format";
import { WORK_ORDER_STATUS } from "@/lib/labels";
import { restoreWorkOrder, setWorkOrderStatus } from "@/lib/store/actions";

const STEPS = JOB_STEPS.map((key) => ({ key, label: WORK_ORDER_STATUS[key].label, tone: WORK_ORDER_STATUS[key].tone }));
const label = (status) => WORK_ORDER_STATUS[status].label;

/** What the next move is called on its button. */
export function nextLabel(move) {
	if (!move) return null;
	if (move.id === "resume") return "Piesele au sosit";
	if (move.id === "reactivate") return "Reactivează";
	return { approved: "Aprobă devizul", in_progress: "Începe lucrul", ready: "Marchează gata", delivered: "Predă mașina" }[move.to] ?? label(move.to);
}

/**
 * A job's moves (docs/VISIT-FLOW.md §6.2), shared by its state section and the phone's bottom
 * bar: the flow, `perform(move)` (asks first when the move needs it, opens a panel for the moves
 * that take a reason), and the open panel. Every change can be undone from its toast; the
 * booking that followed the job is put back too. `beforeMove` saves edits still being typed.
 */
export function useJobMoves({ order, invoice, appointment, beforeMove }) {
	const confirm = useConfirm();
	const [panel, setPanel] = useState(null); // cancel · reopen · pause
	const flow = jobFlow(order, { invoice });

	const apply = (to, reason = "") => {
		beforeMove?.();
		const previous = order;
		const previousAppointment = appointment ?? null;
		try {
			setWorkOrderStatus(order.id, to, { reason });
			setPanel(null);
			toast.success(`Lucrarea #${order.number}: ${label(to)}`, {
				action: {
					label: "Anulează",
					onClick: () => {
						try {
							restoreWorkOrder(previous, previousAppointment);
						} catch (error) {
							toast.error(error.message);
						}
					},
				},
			});
		} catch (error) {
			toast.error(error.message);
		}
	};

	const perform = async (move) => {
		if (!move.allowed) {
			toast.info(move.reason);
			return;
		}
		if (move.id === "cancel" || move.id === "reopen" || move.id === "pause") {
			setPanel(move.id);
			return;
		}
		if (move.confirm) {
			const skipping = move.skipped?.length > 0;
			const unbilled = move.to === "delivered" && !flow.invoiced;
			const ok = await confirm({
				title: skipping ? `Sari la ${label(move.to)}?` : "Mașina nu are factură emisă",
				description: [
					skipping ? `${move.skipped.map(label).join(", ")} ${move.skipped.length === 1 ? "rămâne marcat" : "rămân marcate"} „sărit”.` : null,
					unbilled ? "O poți preda acum și factura ulterior (ex. flote cu facturare lunară)." : null,
				]
					.filter(Boolean)
					.join(" "),
				confirmLabel: skipping ? `Sari la ${label(move.to)}` : "Predă fără factură",
			});
			if (!ok) return;
		}
		apply(move.to);
	};

	return { flow, perform, apply, panel, setPanel };
}

/**
 * The job's state section: the stepper as it always looked (every step can be clicked: back,
 * next, or a jump that names what it skips), one next step with a sentence, the moves that are
 * not steps (wait for parts, cancel, reopen), and their reason panels.
 */
export function JobState({ order, moves, onReview }) {
	const { flow, perform, apply, panel, setPanel } = moves;
	const lastReason = (to) => [...(order.activity ?? [])].reverse().find((entry) => entry.type === "status" && entry.to === to)?.reason ?? "";

	const onStep = (key) => {
		const move = flow.moves.find((m) => m.to === key && (m.kind === "back" || m.kind === "next" || m.kind === "skip"));
		if (!move) return null;
		const text = move.kind === "back" ? `Înapoi la ${label(key)}` : move.kind === "skip" ? `Sari la ${label(key)}` : nextLabel(move);
		return { label: text, onClick: () => perform(move) };
	};

	const waitingFor = flow.paused ? lastReason("waiting_parts") : "";
	const HINT = {
		estimate: "Trimite devizul clientului; după aprobare poți începe.",
		approved: "Mecanicul poate începe.",
		in_progress: "Anunță clientul când e gata.",
		waiting_parts: waitingFor ? `Așteaptă: ${waitingFor}.` : "Lucrul continuă când vin piesele.",
		ready: flow.invoiced ? "Factura e emisă: mașina poate fi predată." : "Nu are factură emisă: o poți preda acum și factura mai târziu.",
	};
	const ICON = { approved: KeyRound, in_progress: Wrench, ready: KeyRound, delivered: KeyRound };
	const next = flow.next && !flow.off ? { label: nextLabel(flow.next), hint: HINT[order.status], icon: flow.next.id === "resume" ? PackageSearch : ICON[flow.next.to], onClick: () => perform(flow.next) } : null;

	const MOVE = { pause: { label: "Așteaptă piese", icon: PackageSearch }, cancel: { label: "Anulează lucrarea", icon: CircleX }, reopen: { label: "Redeschide", icon: RotateCcw } };
	const others = flow.moves
		.filter((m) => MOVE[m.id])
		.map((m) => ({ id: m.id, ...MOVE[m.id], onClick: () => perform(m), disabled: !m.allowed, reason: m.reason, destructive: m.id === "cancel" }));

	const off = flow.off
		? {
				title: "Lucrare anulată",
				description: [order.dates?.cancelled ? `pe ${fmtDate(order.dates.cancelled, "d MMM, HH:mm")}` : null, lastReason("cancelled")].filter(Boolean).join(" · ") || null,
				tone: "red",
				icon: CircleX,
				actions: [{ label: "Reactivează", onClick: () => perform(flow.next), primary: true }],
			}
		: null;

	const notice =
		order.status === "delivered" ? (
			<div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center">
				<p className="min-w-0 flex-1 text-sm">
					Predată {order.dates?.delivered ? <>pe <span className="font-medium tabular-nums">{fmtDate(order.dates.delivered, "d MMM, HH:mm")}</span></> : null}. Vizita se încheie cu părerea clientului.
				</p>
				<Button size="sm" variant="outline" className="max-md:h-11" onClick={onReview}>
					<Star /> Cere recenzie
				</Button>
			</div>
		) : null;

	let panelNode = null;
	if (panel === "cancel")
		panelNode = <ReasonPanel title="Anulezi lucrarea?" placeholder="ex. clientul a renunțat" saveLabel="Anulează lucrarea" destructive onSave={(reason) => apply("cancelled", reason)} onClose={() => setPanel(null)} />;
	if (panel === "reopen")
		panelNode = (
			<ReasonPanel
				title="Redeschizi lucrarea?"
				placeholder="ex. clientul a revenit cu aceeași problemă"
				saveLabel="Redeschide"
				note={flow.invoiced ? "Factura e emisă, așa că liniile rămân blocate. Pentru alte linii: stornează și refă factura." : "Revine la Gata; mașina apare din nou în service."}
				onSave={(reason) => apply("ready", reason)}
				onClose={() => setPanel(null)}
			/>
		);
	if (panel === "pause")
		panelNode = <ReasonPanel title="Ce piesă așteptați?" placeholder="ex. plăcuțe frână, vin joi" saveLabel="Așteaptă piese" onSave={(reason) => apply("waiting_parts", reason)} onClose={() => setPanel(null)} optional />;

	const skipped = skippedSteps(order);
	return (
		<FlowSteps
			label="Etapele lucrării"
			steps={STEPS}
			current={flow.current}
			skipped={skipped}
			pause={flow.paused ? { label: label("waiting_parts"), tone: WORK_ORDER_STATUS.waiting_parts.tone } : null}
			mark={flow.paused && waitingFor ? { label: waitingFor, tone: WORK_ORDER_STATUS.waiting_parts.tone } : null}
			onStep={flow.off || order.status === "delivered" ? null : onStep}
			help={order.status === "delivered" || flow.off ? null : "Atinge o etapă ca să revii la ea sau să sari direct acolo."}
			off={off}
			notice={notice}
			next={next}
			moves={flow.off ? [] : others}
			panel={panelNode}
			onPanelClose={() => setPanel(null)}
		/>
	);
}

/** A move that takes a few words (why it was cancelled, why it was reopened, which part it waits for). */
function ReasonPanel({ title, placeholder, note, saveLabel, onSave, onClose, destructive = false, optional = true }) {
	const [reason, setReason] = useState("");
	return (
		<div className="space-y-3 rounded-lg border p-4">
			<p className="text-sm font-semibold">{title}</p>
			{note && <p className="text-xs text-muted-foreground">{note}</p>}
			<Field label={optional ? "Motiv (opțional)" : "Motiv"}>{(id) => <Input id={id} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={placeholder} onKeyDown={(event) => event.key === "Enter" && onSave(reason)} />}</Field>
			<div className="flex flex-wrap justify-end gap-2">
				<Button variant="outline" className="max-md:h-11 max-md:flex-1" onClick={onClose}>
					<Undo2 /> Renunță
				</Button>
				<Button variant={destructive ? "destructive" : "default"} className="max-md:h-11 max-md:flex-1" onClick={() => onSave(reason)}>
					{saveLabel}
				</Button>
			</div>
		</div>
	);
}
