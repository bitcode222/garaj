const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Time-sortable id. Uses getRandomValues, which (unlike randomUUID) also works
 * outside secure contexts, e.g. the dev server opened over plain http on the LAN.
 */
export function uid() {
	const time = Date.now().toString(36).padStart(9, "0");
	const bytes = new Uint8Array(8);
	globalThis.crypto.getRandomValues(bytes);
	let rand = "";
	for (const b of bytes) rand += ALPHABET[b % 36];
	return time + rand;
}
