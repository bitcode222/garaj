// Edits a form holds back for a moment (useDraft) are written before another record is made from them: the visit
// bar makes an invoice from a job while its form may still be waiting to save (docs/VISIT-BAR.md §3.3).

const flushes = new Set();

/** Registers a form's `flush` while it is on screen; returns what removes it (an effect's cleanup). */
export function holdEdits(flush) {
	flushes.add(flush);
	return () => flushes.delete(flush);
}

/** Writes every held edit now. */
export function flushEdits() {
	for (const flush of flushes) flush();
}
