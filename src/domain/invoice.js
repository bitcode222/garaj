import { DomainError } from "./errors.js";
import { uid } from "./ids.js";
import { computeTotals, lineIssues } from "./lines.js";
import { formatMoney } from "./money.js";
import { joinAddress } from "./customer.js";

// Stored status: draft · issued · cancelled (only through storno).
// Displayed status is derived: paid · partial · overdue come from payments and dates.

export function formatInvoiceNumber(series, number) {
	return number == null ? "Ciornă" : `${series} ${String(number).padStart(4, "0")}`;
}

export function sumPayments(payments = []) {
	return payments.reduce((sum, p) => sum + p.amount, 0);
}

export function invoiceBalance(invoice, payments) {
	return invoice.totals.gross - sumPayments(payments);
}

/** draft · issued · partial · paid · overdue · cancelled · storno */
export function invoiceState(invoice, payments, today) {
	if (invoice.status === "draft") return "draft";
	if (invoice.status === "cancelled") return "cancelled";
	if (invoice.stornoOf) return "storno";
	const paid = sumPayments(payments);
	if (paid >= invoice.totals.gross) return "paid";
	if (invoice.dueDate && invoice.dueDate < today) return "overdue";
	return paid > 0 ? "partial" : "issued";
}

export function buildSnapshot({ settings, customer, vehicle, mileage }) {
	const shop = settings.shop;
	return {
		seller: {
			name: shop.legalName || shop.name,
			brand: shop.name,
			cui: shop.cui,
			regCom: shop.regCom,
			address: joinAddress(shop),
			phone: shop.phone,
			email: shop.email,
			iban: shop.iban,
			bank: shop.bank,
			logo: shop.logo ?? null,
			vatPayer: settings.invoicing.vatPayer,
		},
		buyer: customer
			? {
					type: customer.type,
					name: customer.name,
					cui: customer.cui ?? "",
					regCom: customer.regCom ?? "",
					address: joinAddress(customer),
					phone: customer.phone ?? "",
					email: customer.email ?? "",
				}
			: null,
		vehicle: vehicle
			? {
					plate: vehicle.plate,
					make: vehicle.make,
					model: vehicle.model,
					vin: vehicle.vin ?? "",
					mileage: mileage ?? null,
				}
			: null,
	};
}

/** Blocking problems before a draft can get a number. */
export function issueProblems(draft, { customer }) {
	const problems = [];
	if (!customer) problems.push("Alege clientul facturii.");
	if (customer?.type === "company" && !customer.cui) problems.push("Clientul persoană juridică nu are CUI.");
	if (!draft.lines?.length) problems.push("Adaugă cel puțin o linie.");
	for (const line of draft.lines ?? []) {
		const issues = lineIssues(line);
		if (issues.length) {
			problems.push(`Linia „${line.description || "fără descriere"}”: ${issues[0]}`);
			break;
		}
	}
	if (!draft.issueDate) problems.push("Alege data emiterii.");
	if (draft.dueDate && draft.issueDate && draft.dueDate < draft.issueDate) {
		problems.push("Scadența nu poate fi înainte de data emiterii.");
	}
	return problems;
}

/**
 * Turns a draft into an issued, immutable invoice. The caller supplies `number`
 * from an atomic counter; seller/buyer/vehicle are frozen in a snapshot.
 */
export function issueInvoice(draft, { settings, customer, vehicle, number, now = new Date().toISOString() }) {
	const problems = issueProblems(draft, { customer });
	if (problems.length) throw new DomainError("cannot_issue", problems[0]);
	const vatPayer = settings.invoicing.vatPayer;
	const lines = draft.lines.map((line) => ({ ...line, vatRate: vatPayer ? Number(line.vatRate) || 0 : 0 }));
	const totals = computeTotals(lines, { vatPayer });
	if (totals.gross <= 0) throw new DomainError("cannot_issue", "Totalul facturii trebuie să fie pozitiv.");
	return {
		...draft,
		status: "issued",
		series: draft.series || settings.invoicing.series,
		number,
		lines,
		totals,
		snapshot: buildSnapshot({ settings, customer, vehicle, mileage: draft.mileage }),
		issuedAt: now,
		activity: [...(draft.activity ?? []), { at: now, type: "issued" }],
		updatedAt: now,
	};
}

/**
 * A storno (credit note) mirrors the original with negative quantities. The
 * original becomes "cancelled"; the pair nets to zero in every report.
 */
export function buildStorno(original, { number, today, now = new Date().toISOString() }) {
	if (original.status === "draft") throw new DomainError("cannot_storno", "Ciornele se șterg, nu se stornează.");
	if (original.status === "cancelled") throw new DomainError("cannot_storno", "Factura este deja stornată.");
	if (original.stornoOf) throw new DomainError("cannot_storno", "O factură de stornare nu poate fi stornată.");
	const lines = original.lines.map((line) => ({ ...line, id: uid(), qty: -line.qty }));
	const totals = computeTotals(lines, { vatPayer: original.snapshot.seller.vatPayer });
	const label = formatInvoiceNumber(original.series, original.number);
	return {
		id: uid(),
		status: "issued",
		series: original.series,
		number,
		issueDate: today,
		dueDate: today,
		customerId: original.customerId,
		vehicleId: original.vehicleId,
		workOrderId: null,
		mileage: original.mileage ?? null,
		lines,
		totals,
		snapshot: original.snapshot,
		stornoOf: original.id,
		notes: `Stornare integrală a facturii ${label} din ${original.issueDate}.`,
		issuedAt: now,
		activity: [{ at: now, type: "issued" }],
		createdAt: now,
		updatedAt: now,
	};
}

/** Returns a user-facing problem, or null when the payment can be recorded. */
export function paymentProblem(amount, { invoice, payments, currency = "RON" }) {
	if (invoice.status !== "issued" || invoice.stornoOf) return "Pe această factură nu se pot înregistra plăți.";
	if (!Number.isInteger(amount) || amount <= 0) return "Introdu o sumă mai mare ca zero.";
	const balance = invoiceBalance(invoice, payments);
	if (balance <= 0) return "Factura este deja achitată integral.";
	if (amount > balance) return `Suma depășește restul de plată (${formatMoney(balance, currency)}).`;
	return null;
}

/** Plain-text reminder / share message for an invoice. */
export function invoiceMessage({ invoice, balance, settings }) {
	const number = formatInvoiceNumber(invoice.series, invoice.number);
	const currency = settings.currency;
	const pay = settings.shop.iban ? `\nPlată prin transfer: ${settings.shop.iban}${settings.shop.bank ? ` (${settings.shop.bank})` : ""}.` : "";
	return [
		"Bună ziua!",
		`Vă transmitem factura ${number} din ${invoice.issueDate}, în valoare de ${formatMoney(invoice.totals.gross, currency)}.`,
		balance > 0 && balance < invoice.totals.gross ? `Rest de plată: ${formatMoney(balance, currency)}.` : "",
		invoice.dueDate ? `Scadență: ${invoice.dueDate}.` : "",
		pay.trim(),
		`Mulțumim, ${settings.shop.name}`,
	]
		.filter(Boolean)
		.join("\n");
}
