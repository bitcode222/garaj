import { Money } from "@/components/ds/data";
import { Plate } from "@/components/ds/plate";
import { formatIBAN } from "@/domain/customer";
import { formatInvoiceNumber } from "@/domain/invoice";
import { lineNet } from "@/domain/lines";
import { formatQuantity } from "@/domain/money";
import { fmtDateDoc, fmtKm } from "@/lib/format";
import { cn } from "@/lib/utils";

function Party({ label, party, lines }) {
	return (
		<div className="min-w-0">
			<p className="mb-1.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
			<p className="text-[15px] leading-snug font-semibold">{party?.name || "—"}</p>
			<div className="mt-1 space-y-0.5 text-muted-foreground">
				{lines.filter(Boolean).map((line) => (
					<p key={line}>{line}</p>
				))}
			</div>
		</div>
	);
}

/**
 * The paper. Always light (the `.paper` token scope), A4 proportions, and the
 * only thing on screen that prints (data-print="document").
 */
export function InvoiceDocument({ invoice, snapshot, totals, currency = "RON", draft = false, heading, numberLabel, legal = true, className }) {
	const { seller, buyer, vehicle } = snapshot;
	const vatPayer = seller.vatPayer;
	const storno = Boolean(invoice.stornoOf);
	const title = heading ?? (storno ? "Factură de stornare" : "Factură");

	return (
		<article
			data-print="document"
			className={cn(
				"paper relative mx-auto w-full max-w-[794px] overflow-hidden rounded-xl p-5 text-[13px] leading-relaxed shadow-paper ring-1 ring-black/5 sm:p-8 md:p-10 dark:ring-white/10",
				className,
			)}
		>
			{draft && (
				<span
					aria-hidden
					className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -rotate-[18deg] text-[5.5rem] font-black tracking-[0.2em] whitespace-nowrap text-zinc-900/[0.04] select-none sm:text-[8rem]"
				>
					CIORNĂ
				</span>
			)}

			<header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex min-w-0 items-start gap-3">
					{seller.logo ? (
						// eslint-disable-next-line @next/next/no-img-element -- data URL logo, nothing to optimize
						<img src={seller.logo} alt="" className="size-12 shrink-0 rounded-lg object-contain" />
					) : (
						<span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-lg font-bold text-white">
							{(seller.brand || seller.name || "G").slice(0, 1)}
						</span>
					)}
					<div className="min-w-0">
						<p className="text-lg leading-tight font-semibold tracking-tight">{seller.brand || seller.name}</p>
						{seller.brand && seller.brand !== seller.name && <p className="text-muted-foreground">{seller.name}</p>}
					</div>
				</div>
				<div className="sm:text-right">
					<p className="text-2xl font-semibold tracking-tight">{title}</p>
					<p className="mt-0.5 font-mono text-[15px] font-medium">
						{numberLabel ?? (draft ? `Seria ${invoice.series} · nr. la emitere` : formatInvoiceNumber(invoice.series, invoice.number))}
					</p>
					<dl className="mt-2 grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-0.5 text-muted-foreground sm:justify-end">
						<dt>Data emiterii</dt>
						<dd className="font-medium text-foreground tabular-nums">{fmtDateDoc(invoice.issueDate)}</dd>
						{invoice.dueDate && (
							<>
								<dt>Scadență</dt>
								<dd className="font-medium text-foreground tabular-nums">{fmtDateDoc(invoice.dueDate)}</dd>
							</>
						)}
					</dl>
				</div>
			</header>

			<div className="mt-8 grid gap-6 border-t pt-6 sm:grid-cols-2 sm:gap-10">
				<Party
					label="Furnizor"
					party={seller}
					lines={[
						[seller.cui && `CUI ${seller.cui}`, seller.regCom].filter(Boolean).join(" · "),
						seller.address,
						[seller.phone, seller.email].filter(Boolean).join(" · "),
						!vatPayer && "Neplătitor de TVA",
					]}
				/>
				<Party
					label="Client"
					party={buyer}
					lines={[
						buyer?.type === "company" ? [buyer.cui && `CUI ${buyer.cui}`, buyer.regCom].filter(Boolean).join(" · ") : null,
						buyer?.address,
						buyer?.phone,
					]}
				/>
			</div>

			{vehicle && (
				<div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted px-3.5 py-2.5">
					<Plate value={vehicle.plate} size="sm" />
					<span className="font-medium">{[vehicle.make, vehicle.model].filter(Boolean).join(" ")}</span>
					{vehicle.vin && <span className="font-mono text-xs text-muted-foreground">VIN {vehicle.vin}</span>}
					{vehicle.mileage != null && <span className="text-muted-foreground tabular-nums">{fmtKm(vehicle.mileage)}</span>}
				</div>
			)}

			<table className="mt-6 w-full border-collapse text-left">
				<thead>
					<tr className="border-b text-2xs tracking-wider text-muted-foreground uppercase">
						<th className="w-8 py-2 pr-2 font-medium">Nr.</th>
						<th className="py-2 pr-3 font-medium">Denumire</th>
						<th className="hidden py-2 pr-3 font-medium sm:table-cell">U.M.</th>
						<th className="py-2 pr-3 text-right font-medium">Cant.</th>
						<th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Preț unitar</th>
						{vatPayer && <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">TVA</th>}
						<th className="py-2 text-right font-medium">Valoare</th>
					</tr>
				</thead>
				<tbody>
					{invoice.lines.map((line, index) => (
						<tr key={line.id} className="border-b align-top last:border-b-0">
							<td className="py-2.5 pr-2 text-muted-foreground tabular-nums">{index + 1}</td>
							<td className="py-2.5 pr-3">
								<span className="font-medium">{line.description || "—"}</span>
								<span className="block text-xs text-muted-foreground tabular-nums sm:hidden">
									{formatQuantity(line.qty)} {line.unit} × <Money value={line.unitPrice} currency={currency} />
								</span>
								{line.discountPct > 0 && <span className="block text-xs text-muted-foreground">Discount {line.discountPct}%</span>}
							</td>
							<td className="hidden py-2.5 pr-3 text-muted-foreground sm:table-cell">{line.unit}</td>
							<td className="py-2.5 pr-3 text-right tabular-nums">{formatQuantity(line.qty)}</td>
							<td className="hidden py-2.5 pr-3 text-right sm:table-cell">
								<Money value={line.unitPrice} currency={currency} />
							</td>
							{vatPayer && <td className="hidden py-2.5 pr-3 text-right text-muted-foreground tabular-nums md:table-cell">{line.vatRate}%</td>}
							<td className="py-2.5 text-right font-medium">
								<Money value={lineNet(line)} currency={currency} />
							</td>
						</tr>
					))}
					{!invoice.lines.length && (
						<tr>
							<td colSpan={7} className="py-8 text-center text-muted-foreground">
								Nicio linie încă.
							</td>
						</tr>
					)}
				</tbody>
			</table>

			<div className="mt-6 flex flex-col gap-6 border-t pt-6 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-3 text-muted-foreground sm:max-w-[55%]">
					{(totals.labor !== 0 || totals.parts !== 0) && (
						<p>
							Din care manoperă <Money value={totals.labor} currency={currency} className="text-foreground" /> · piese{" "}
							<Money value={totals.parts} currency={currency} className="text-foreground" />
						</p>
					)}
					{seller.iban && (
						<div>
							<p className="mb-0.5 text-2xs font-medium tracking-wider uppercase">Plată prin transfer</p>
							<p className="font-mono text-xs text-foreground">{formatIBAN(seller.iban)}</p>
							{seller.bank && <p>{seller.bank}</p>}
						</div>
					)}
					{invoice.notes && <p className="whitespace-pre-line text-foreground">{invoice.notes}</p>}
				</div>
				<dl className="w-full space-y-1.5 sm:w-72">
					{vatPayer && (
						<>
							<div className="flex justify-between gap-4">
								<dt className="text-muted-foreground">Total fără TVA</dt>
								<dd>
									<Money value={totals.net} currency={currency} />
								</dd>
							</div>
							{totals.byRate.map((group) => (
								<div key={group.rate} className="flex justify-between gap-4">
									<dt className="text-muted-foreground">TVA {group.rate}%</dt>
									<dd>
										<Money value={group.vat} currency={currency} />
									</dd>
								</div>
							))}
						</>
					)}
					<div className="flex items-baseline justify-between gap-4 border-t pt-2.5">
						<dt className="font-semibold">Total de plată</dt>
						<dd>
							<Money value={totals.gross} currency={currency} className="text-xl font-semibold tracking-tight" />
						</dd>
					</div>
				</dl>
			</div>

			<footer className="mt-10 grid grid-cols-2 gap-8 text-xs text-muted-foreground">
				<div>
					<div className="mb-1.5 h-10 border-b border-dashed" />
					Semnătura furnizorului
				</div>
				<div>
					<div className="mb-1.5 h-10 border-b border-dashed" />
					Semnătura clientului
				</div>
				{legal && (
					<p className="col-span-2 text-2xs leading-relaxed">
						Factura circulă fără semnătură și ștampilă, conform art. 319 alin. (29) din Legea nr. 227/2015 privind Codul fiscal.
					</p>
				)}
			</footer>
		</article>
	);
}
