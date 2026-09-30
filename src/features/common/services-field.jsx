"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { fmtHours } from "@/lib/format";
import { SERVICE_CATEGORIES } from "@/lib/labels";
import { tone } from "@/lib/tones";
import { useCollection } from "@/lib/store/hooks";
import { selectList } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";

/** Selected catalog operations as removable chips + a searchable picker. */
export function ServicesField({ value = [], onChange }) {
	const services = useCollection("services");
	const list = selectList(services);
	const [open, setOpen] = useState(false);
	const groups = Object.entries(SERVICE_CATEGORIES)
		.map(([key, category]) => ({ key, category, items: list.filter((s) => s.category === key && !value.includes(s.id)) }))
		.filter((g) => g.items.length);

	return (
		<div className="flex flex-wrap gap-2">
			{value.map((id) => {
				const service = services[id];
				if (!service) return null;
				return (
					<span
						key={id}
						className={cn("inline-flex h-8 items-center gap-1 rounded-md border pr-1 pl-2.5 text-sm", tone(SERVICE_CATEGORIES[service.category]?.tone).chip)}
					>
						{service.name}
						<button
							type="button"
							onClick={() => onChange(value.filter((v) => v !== id))}
							className="flex size-6 items-center justify-center rounded opacity-70 hover:opacity-100"
							aria-label={`Scoate ${service.name}`}
						>
							<X className="size-3.5" />
						</button>
					</span>
				);
			})}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button type="button" variant="outline" size="sm" className="h-8 border-dashed">
						<Plus /> Operațiune
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-[min(92vw,360px)] p-0" align="start">
					<Command>
						<CommandInput placeholder="Caută operațiune…" />
						<CommandList className="max-h-72">
							<CommandEmpty>Nicio operațiune.</CommandEmpty>
							{groups.map((group) => (
								<CommandGroup key={group.key} heading={group.category.label}>
									{group.items.map((service) => (
										<CommandItem
											key={service.id}
											value={`${service.name} ${group.category.label}`}
											onSelect={() => {
												onChange([...value, service.id]);
												setOpen(false);
											}}
											className="py-2"
										>
											<span className="flex-1">{service.name}</span>
											<span className="text-xs text-muted-foreground">{fmtHours(service.hours)}</span>
										</CommandItem>
									))}
								</CommandGroup>
							))}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
