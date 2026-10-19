import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { matchesWords, normalize, searchText, searchWords } from "./booking-search.js";

const text = searchText({
	appointment: { number: 128, title: "Schimb ulei", operations: [{ name: "Filtru aer" }] },
	order: { number: 1873, complaint: "Zgomot la frânare" },
	customer: { name: "Ionuț Ștefănescu", phone: "0722 123 456" },
	vehicle: { make: "Dacia", model: "Logan", plate: "B 123 ABC", vin: "UU1LSDAAH12345678" },
	mechanic: { name: "Andrei Popescu" },
	serviceNames: ["Revizie"],
});
const finds = (query) => matchesWords(text, searchWords(query));

describe("calendar search", () => {
	test("case, diacritics and spacing do not matter", () => {
		assert.equal(normalize("  Ionuț   ȘTEFĂNESCU "), "ionut stefanescu");
		assert.ok(finds("ionut"));
		assert.ok(finds("ȘTEFĂN"));
		assert.ok(finds("franare"));
	});

	test("a plate and a phone are found with or without their spaces", () => {
		for (const query of ["B 123 ABC", "b123abc", "123abc", "0722 123 456", "0722123456", "123456"]) assert.ok(finds(query), query);
	});

	test("every word must be found, in any order", () => {
		assert.ok(finds("logan ionut"));
		assert.ok(finds("ulei dacia"));
		assert.ok(!finds("logan maria"));
	});

	test("by the booking's number, the job's number, the mechanic, the operations and the VIN", () => {
		for (const query of ["#128", "#1873", "1873", "andrei", "filtru", "revizie", "uu1lsd"]) assert.ok(finds(query), query);
		assert.ok(!finds("#129"));
	});

	test("too short to search: fewer than two letters or digits", () => {
		assert.equal(searchWords(""), null);
		assert.equal(searchWords(" a "), null);
		assert.equal(searchWords("#"), null);
		assert.equal(searchWords("#1"), null);
		assert.deepEqual(searchWords("#12"), ["#12"]);
		assert.deepEqual(searchWords("Dacia  Logan"), ["dacia", "logan"]);
	});
});
