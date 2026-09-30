/** Lowercase without diacritics: "Ștefan Ionescu" → "stefan ionescu". */
export function fold(input) {
	return String(input ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase();
}

export function queryTokens(query) {
	return fold(query).split(/[\s,]+/).filter(Boolean);
}

/** Every token must appear somewhere in the (already folded) haystack. */
export function matchesTokens(haystack, tokens) {
	for (const token of tokens) if (!haystack.includes(token)) return false;
	return true;
}
