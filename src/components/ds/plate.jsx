import { cn } from "@/lib/utils";
import { formatPlate } from "@/domain/vehicle";

const SIZES = {
	sm: "h-5 text-[11px]",
	md: "h-6 text-[13px]",
	lg: "h-9 text-lg",
	xl: "h-12 text-2xl md:h-14 md:text-[1.75rem]",
};

const STARS = Array.from({ length: 12 }, (_, i) => {
	const a = (i / 12) * Math.PI * 2;
	return [5 + Math.cos(a) * 3.3, 5 + Math.sin(a) * 3.3];
});

/** Romanian number plate: white field, black rim, blue EU strip with "RO". */
export function Plate({ value, size = "md", className }) {
	return (
		<span
			translate="no"
			className={cn(
				"inline-flex shrink-0 items-stretch overflow-hidden rounded-[0.3em] border-[0.1em] border-zinc-900 bg-white leading-none font-semibold text-zinc-900 dark:border-zinc-400",
				SIZES[size],
				className,
			)}
		>
			<span className="flex w-[1.05em] flex-col items-center justify-between bg-[#1d4ed8] py-[0.12em] text-[0.42em] font-bold text-white">
				<svg viewBox="0 0 10 10" className="size-[1.4em]" aria-hidden>
					{STARS.map(([x, y]) => (
						<circle key={`${x}-${y}`} cx={x} cy={y} r="0.62" fill="#facc15" />
					))}
				</svg>
				RO
			</span>
			<span className="flex items-center px-[0.4em] font-mono tracking-[0.04em] whitespace-nowrap uppercase">
				{formatPlate(value)}
			</span>
		</span>
	);
}
