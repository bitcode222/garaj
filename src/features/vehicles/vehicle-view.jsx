"use client";

import { DetailSheet } from "@/components/ds/detail-sheet";
import { EmbeddedLinks } from "@/components/ds/embedded-links";
import { vehicleName } from "@/domain/vehicle";
import { detailHref } from "@/lib/detail-mode";
import { FUELS } from "@/lib/labels";
import { openSheet } from "@/lib/sheets";
import { useEntity } from "@/lib/store/hooks";
import { VehicleEmbedded } from "./vehicle-detail";

/** Vehicle overlay: everything the vehicle page shows (deadlines, mileage chart, service history, details). */
export default function VehicleView({ open, onOpenChange, id }) {
	const vehicle = useEntity("vehicles", id);
	return (
		<DetailSheet
			open={open}
			onOpenChange={onOpenChange}
			entity={vehicle}
			missing="Mașina a fost ștearsă."
			title={vehicle ? vehicleName(vehicle) || "Mașină" : "Mașină"}
			description={vehicle ? [vehicle.year, vehicle.engine, FUELS[vehicle.fuel], vehicle.color].filter(Boolean).join(" · ") || undefined : undefined}
			fullPage={vehicle && detailHref("vehicle", vehicle.id)}
			onEdit={() => openSheet("vehicle", { id: vehicle.id })}
			size="xl"
		>
			{vehicle && (
				<EmbeddedLinks>
					<VehicleEmbedded vehicle={vehicle} />
				</EmbeddedLinks>
			)}
		</DetailSheet>
	);
}
