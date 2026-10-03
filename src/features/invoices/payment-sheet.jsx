"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { Money } from "@/components/ds/data";
import { Field, MoneyInput, Segmented } from "@/components/ds/inputs";
import { Sheet } from "@/components/ds/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayISO } from "@/domain/dates";
import { formatInvoiceNumber, invoiceBalance } from "@/domain/invoice";
import { formatMoney } from "@/domain/money";
import { PAYMENT_METHODS } from "@/lib/labels";
import { recordPayment } from "@/lib/store/actions";
import { useCollection, useEntity, useSettings } from "@/lib/store/hooks";
import { selectPaymentsByInvoice } from "@/lib/store/selectors";

export default function PaymentSheet({ open, onOpenChange, invoiceId }) {
	const settings = useSettings();
	const invoice = useEntity("invoices", invoiceId);
	const payments = selectPaymentsByInvoice(useCollection("payments")).get(invoiceId) ?? [];
	const customer = useEntity("customers", invoice?.customerId);
	const balance = invoice ? invoiceBalance(invoice, payments) : 0;
	const [amount, setAmount] = useState(balance);
	const [method, setMethod] = useState(customer?.type === "company" ? "transfer" : "card");
	const [date, setDate] = useState(todayISO());
	const [note, setNote] = useState("");
	const [error, setError] = useState(null);

	if (!invoice) return null;

	const submit = (event) => {
		event.preventDefault();
		try {
			recordPayment(invoice.id, { amount, method, date, note });
			toast.success(amount === balance ? "Factura este achitată integral." : "Plata a fost înregistrată.");
			onOpenChange(false);
		} catch (err) {
			setError(err.message);
		}
	};

	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			title="Înregistrează plata"
			description={`Factura ${formatInvoiceNumber(invoice.series, invoice.number)} · rest ${formatMoney(balance, settings.currency)}`}
			footer={
				<>
					<Button variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
						Renunță
					</Button>
					<Button type="submit" form="payment-form" className="max-md:h-11">
						Încasează <Money value={amount} />
					</Button>
				</>
			}
		>
			<form id="payment-form" onSubmit={submit} className="grid gap-4">
				<Field label="Sumă" error={error}>
					{(id) => (
						<MoneyInput
							id={id}
							value={amount}
							currency={settings.currency}
							onValueChange={(value) => {
								setAmount(value);
								setError(null);
							}}
							className="h-12 text-lg font-semibold md:h-11"
						/>
					)}
				</Field>
				<div className="flex flex-wrap gap-2">
					{[1, 0.5].map((part) => (
						<Button key={part} type="button" size="sm" variant="outline" onClick={() => setAmount(Math.round(balance * part))}>
							{part === 1 ? "Tot restul" : "Jumătate"}
						</Button>
					))}
				</div>
				<Field label="Metodă">
					<Segmented
						value={method}
						onValueChange={setMethod}
						options={Object.entries(PAYMENT_METHODS).map(([value, m]) => ({ value, label: m.label, icon: m.icon }))}
						className="h-11 w-full md:h-10 [&>button]:flex-1"
					/>
				</Field>
				<Field label="Data încasării">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
				<Field label="Notă (opțional)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. bon fiscal 1234, OP 55" />}</Field>
			</form>
		</Sheet>
	);
}
