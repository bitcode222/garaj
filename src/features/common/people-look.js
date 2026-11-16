import { LayoutGrid, Rows3 } from "lucide-react";

// Oameni și mașini (docs/DESIGN.md §4): two looks, one switch for clients, cars and De contactat, kept on this device.
// "Listă": dense tables. "Galerie": clients as cards, cars as covers, reminders with the message ready to send.
export const PEOPLE_LOOK_KEY = "garaj.oameni.look";
export const PEOPLE_LOOKS = [
	{ value: "list", label: "Listă", icon: Rows3 },
	{ value: "gallery", label: "Galerie", icon: LayoutGrid },
];
