import { Money } from "@/components/ds/data";
import { cn } from "@/lib/utils";

/** Net · VAT per rate · total. Right-aligned, tabular — the loudest number is the total. */
export function TotalsBlock({ totals, vatPayer, currency, emphasis = "lg", className }) {
	return (
		<dl className={cn("space-y-1.5 text-sm", className)}>
			{vatPayer && (
				<>
					<div className="flex items-baseline justify-between gap-4">
						<dt className="text-muted-foreground">Total fără TVA</dt>
						<dd>
							<Money value={totals.net} currency={currency} />
						</dd>
					</div>
					{totals.byRate.map((group) => (
						<div key={group.rate} className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">TVA {group.rate}%</dt>
							<dd>
								<Money value={group.vat} currency={currency} />
							</dd>
						</div>
					))}
				</>
			)}
			<div className="flex items-baseline justify-between gap-4 border-t pt-2.5">
				<dt className="font-medium">Total de plată</dt>
				<dd>
					<Money
						value={totals.gross}
						currency={currency}
						className={cn("font-semibold tracking-tight", emphasis === "lg" ? "text-2xl" : "text-lg")}
					/>
				</dd>
			</div>
		</dl>
	);
}
