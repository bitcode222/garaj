import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ds/data";
import { Page } from "@/components/ds/page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<Page>
			<EmptyState
				icon={SearchX}
				title="Pagina nu există"
				description="Linkul este greșit sau pagina a fost mutată."
				action={
					<Button asChild>
						<Link href="/">Înapoi la Azi</Link>
					</Button>
				}
			/>
		</Page>
	);
}
