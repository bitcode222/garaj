"use client";

import { useState } from "react";
import { Banknote, BellRing, CircleCheck, FileCheck2, RefreshCw, RotateCcw, Trash2, TriangleAlert, Undo2, Zap } from "lucide-react";
import { FlowSteps } from "@/components/ds/flow-steps";
import { Button } from "@/components/ui/button";
import { invoiceFlow } from "@/domain/flow";
import { formatInvoiceNumber, issueChecklist } from "@/domain/invoice";
import { fmtDate, formatMoney } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

const STEPS = [
	{ key: "draft", label: "Ciornă", tone: "neutral" },
	{ key: "issued", label: "Emisă", tone: "blue" },
	{ key: "paid", label: "Încasată", tone: "green" },
];

/** The fix each issue problem offers (docs/VISIT-FLOW.md §6.3). */
const FIX = { customer: "Alege clientul", cui: "Completează CUI", lines: "Adaugă o linie", line: "Corectează linia", issue_date: "Alege data", due_date: "Corectează scadența" };

/**
 * An invoice's state section: Ciornă → Emisă → Încasată (a part payment fills the last step,
 * an overdue invoice is marked on "Emisă"), the next step, what blocks issuing with a fix for
 * each problem, and the moves of the moment. A cancelled invoice and a credit note are banners.
 *
 * handlers: { issue, issueAndPay(method), remove, pay, remind, storno, stornoAndRedo, redo,
 *             fix(code), refresh, open(invoiceId, direction) } — only those that apply are used.
 */
export function InvoiceState({ invoice, payments = [], today, customer, currency = "RON", behind = false, creditNote = null, original = null, handlers }) {
	const [panel, setPanel] = useState(null); // issue_and_pay
	const flow = invoiceFlow(invoice, { payments, today, customer });
	const checklist = flow.state === "draft" ? issueChecklist(invoice, { customer }) : [];
	const lastPayment = [...payments].sort((a, b) => (a.date < b.date ? 1 : -1))[0];

	// Where the bars stand: a part payment is on its way through "Încasată".
	const current = flow.state === "partial" ? 2 : flow.current;
	const progress = flow.state === "partial" && flow.total > 0 ? flow.paid / flow.total : null;

	let next = null;
	if (flow.next?.id === "issue") {
		next = {
			label: checklist.length ? `Emite factura (${checklist.length === 1 ? "o problemă" : `${checklist.length} probleme`})` : "Emite factura",
			icon: FileCheck2,
			hint: "Primește numărul următor din serie; după emitere nu se mai modifică.",
			disabled: checklist.length > 0,
			reason: checklist[0]?.text,
			onClick: handlers.issue,
		};
	} else if (flow.next?.id === "pay") {
		const rest = flow.balance < flow.total;
		next = {
			label: rest ? `Încasează restul (${formatMoney(flow.balance, currency)})` : "Înregistrează plata",
			icon: Banknote,
			hint:
				flow.state === "overdue"
					? `Restantă de ${flow.overdueDays === 1 ? "o zi" : `${flow.overdueDays} zile`}: trimite o reamintire și înregistrează plata când vine.`
					: invoice.dueDate
						? `Scadentă pe ${fmtDate(invoice.dueDate, "d MMM yyyy")}.`
						: "Înregistrează plata când clientul plătește.",
			onClick: handlers.pay,
		};
	}

	const MOVE = {
		issue_and_pay: { label: "Emite și încasează integral", icon: Zap, run: () => setPanel("issue_and_pay") },
		delete: { label: "Șterge ciorna", icon: Trash2, run: handlers.remove, destructive: true },
		remind: { label: "Trimite reamintire", icon: BellRing, run: handlers.remind },
		storno: { label: "Stornează", icon: Undo2, run: handlers.storno, destructive: true },
		storno_and_redo: { label: "Stornează și refă", icon: RotateCcw, run: handlers.stornoAndRedo },
	};
	const moves = flow.moves
		.filter((move) => MOVE[move.id] && move !== flow.next)
		.map((move) => ({
			id: move.id,
			label: MOVE[move.id].label,
			icon: MOVE[move.id].icon,
			onClick: MOVE[move.id].run,
			disabled: !move.allowed || !MOVE[move.id].run,
			reason: move.reason ?? (move.id === "remind" ? "Clientul nu are telefon." : null),
			destructive: MOVE[move.id].destructive,
		}));

	let off = null;
	if (flow.off === "cancelled") {
		off = {
			title: "Factură stornată",
			description: creditNote ? `Prin stornarea ${formatInvoiceNumber(creditNote.series, creditNote.number)} din ${fmtDate(creditNote.issueDate)}. Poți face o factură nouă din aceleași linii.` : null,
			tone: "neutral",
			icon: Undo2,
			actions: [{ label: "Refă factura", onClick: handlers.redo, primary: true }, ...(creditNote ? [{ label: "Vezi stornarea", onClick: () => handlers.open(creditNote.id, "forward") }] : [])],
		};
	} else if (flow.off === "storno") {
		off = {
			title: "Factură de stornare",
			description: original ? `Anulează factura ${formatInvoiceNumber(original.series, original.number)} din ${fmtDate(original.issueDate)}.` : null,
			tone: "neutral",
			icon: Undo2,
			actions: original ? [{ label: "Vezi factura stornată", onClick: () => handlers.open(original.id, "back") }] : [],
		};
	}

	const notice =
		flow.state === "paid" ? (
			<p className="flex items-center gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
				<CircleCheck className={cn("size-4 shrink-0", tone("green").text)} aria-hidden />
				Încasată integral{lastPayment ? ` pe ${fmtDate(lastPayment.date, "d MMM yyyy")}` : ""}.
			</p>
		) : null;

	// Under the next step: what blocks issuing (each with its fix), and a draft that fell behind its job.
	const afterNext =
		checklist.length > 0 || behind ? (
			<div className="space-y-2">
				{behind && (
					<div className={cn("flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center", tone("yellow").chip)}>
						<p className="flex min-w-0 flex-1 items-start gap-2">
							<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
							Lucrarea s-a modificat după crearea ciornei.
						</p>
						<Button size="sm" variant="outline" className="max-md:h-11" onClick={handlers.refresh}>
							<RefreshCw /> Actualizează liniile
						</Button>
					</div>
				)}
				{checklist.length > 0 && (
					<ul className="divide-y rounded-lg border" aria-label="Înainte de emitere">
						{checklist.map((item) => (
							<li key={item.code} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
								<span className="flex min-w-0 items-start gap-2">
									<TriangleAlert className={cn("mt-0.5 size-4 shrink-0", tone("yellow").text)} aria-hidden />
									{item.text}
								</span>
								<Button size="sm" variant="ghost" className="shrink-0 max-md:h-11" onClick={() => handlers.fix(item.code)}>
									{FIX[item.code]}
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
		) : null;

	const panelNode =
		panel === "issue_and_pay" ? (
			<div className="space-y-3 rounded-lg border p-4">
				<p className="text-sm font-semibold">Emite și încasează integral</p>
				<p className="text-xs text-muted-foreground">Factura primește numărul și se înregistrează o plată pentru tot totalul. Cum a plătit clientul?</p>
				<div className="flex flex-wrap gap-2">
					{["cash", "card", "transfer"].map((method) => (
						<Button
							key={method}
							variant="outline"
							className="max-md:h-11"
							onClick={() => {
								setPanel(null);
								handlers.issueAndPay(method);
							}}
						>
							{PAYMENT_METHODS[method]?.label ?? method}
						</Button>
					))}
					<Button variant="ghost" className="max-md:h-11" onClick={() => setPanel(null)}>
						Renunță
					</Button>
				</div>
			</div>
		) : null;

	return (
		<FlowSteps
			label="Starea facturii"
			steps={STEPS}
			current={current}
			progress={progress}
			pause={flow.state === "partial" ? { label: `Parțial plătită · ${Math.round((progress ?? 0) * 100)}%`, tone: "yellow" } : null}
			mark={flow.state === "overdue" ? { label: `Restantă de ${flow.overdueDays === 1 ? "o zi" : `${flow.overdueDays} zile`}`, tone: "red" } : null}
			off={off}
			notice={notice}
			next={next}
			afterNext={afterNext}
			moves={off ? [] : moves}
			panel={panelNode}
			onPanelClose={() => setPanel(null)}
		/>
	);
}
