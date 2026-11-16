// The day at a glance (Agendă · Zi, the owner's pick C, 16 Nov 2026): the free time in a day and how full it is.
// Times are minutes after midnight; a busy span is [start, end].

/** The busy spans merged, clipped to [open, close] and sorted. */
export function mergeSpans(spans, open, close) {
	const list = spans
		.map(([s, e]) => [Math.max(open, s), Math.min(close, e)])
		.filter(([s, e]) => e > s)
		.sort((a, b) => a[0] - b[0]);
	const out = [];
	for (const span of list) {
		const last = out.at(-1);
		if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
		else out.push([...span]);
	}
	return out;
}

/** Minutes booked between open and close (overlaps counted once). */
export function busyMinutes(spans, open, close) {
	return mergeSpans(spans, open, close).reduce((n, [s, e]) => n + e - s, 0);
}

/** The free spans of at least `min` minutes between `from` (default: open) and close. */
export function freeGaps(spans, open, close, { from = open, min = 60 } = {}) {
	const start = Math.max(open, from);
	const gaps = [];
	let at = start;
	for (const [s, e] of mergeSpans(spans, start, close)) {
		if (s - at >= min) gaps.push([at, s]);
		at = Math.max(at, e);
	}
	if (close - at >= min) gaps.push([at, close]);
	return gaps;
}
