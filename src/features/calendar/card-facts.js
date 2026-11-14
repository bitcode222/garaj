import { formatPlate, vehicleName } from "@/domain/vehicle";

/**
 * What a booking's card on the calendar says, most important first: its headline (the car's make
 * and model, else the customer, else its title), the make (for the logo), the car's owner, its
 * plate, what it is in for (the title, else the operations, else the services) and the mechanic.
 */
export function cardFacts(appointment, lookups) {
	const vehicle = lookups.vehicles[appointment.vehicleId] ?? null;
	const customer = lookups.customers[appointment.customerId] ?? null;
	const mechanic = appointment.staffId ? (lookups.staff?.[appointment.staffId] ?? null) : null;
	const car = vehicleName(vehicle);
	const title = appointment.title?.trim();
	// "Programare" is what a booking saved without a title is called: it says nothing.
	const named = title && title !== "Programare" ? title : null;
	const subject =
		named ||
		(appointment.operations ?? [])
			.map((op) => op.name)
			.filter(Boolean)
			.join(", ") ||
		(appointment.serviceIds ?? [])
			.map((id) => lookups.services?.[id]?.name)
			.filter(Boolean)
			.join(", ") ||
		null;
	const name = car || customer?.name || named || "Programare";
	return {
		vehicle,
		customer,
		mechanic,
		make: vehicle?.make ?? null,
		name,
		owner: car ? (customer?.name ?? null) : null,
		plate: vehicle?.plate ? formatPlate(vehicle.plate) : null,
		subject: subject && subject !== name ? subject : null,
	};
}

/** A first name ("Andrei" of "Andrei Popescu"). */
export const firstName = (name) => String(name ?? "").split(" ")[0];
