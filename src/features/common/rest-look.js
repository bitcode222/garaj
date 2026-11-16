import { PanelLeft, Rows3 } from "lucide-react";

// Catalog, setări și căutare (docs/DESIGN.md §4): one switch for the four, kept on this device.
// "Listă" (A): the catalog as tables, settings as the iPhone's grouped list, search as the ⌘K window, Nou as tiles under
// its button. "File" (B): catalog and settings with tabs on the left, search as a results page, Nou as a centred sheet.
export const REST_LOOK_KEY = "garaj.rest.look";
export const REST_LOOKS = [
	{ value: "list", label: "Listă", icon: Rows3 },
	{ value: "tabs", label: "File", icon: PanelLeft },
];
export const REST_VALUES = REST_LOOKS.map((look) => look.value);
