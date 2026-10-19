#!/usr/bin/env node
// Browser checks for the dashboard calendar (docs/DASHBOARD-CALENDAR.md).
// Serves the built app (out/), drives it in headless Chrome over the DevTools
// protocol with real mouse and key input, and asserts what a user would see.
//
//   npm run ui:check              build, then run every check
//   node scripts/ui-check.mjs     run against the out/ that is already there
//   UI_CHECK_ONLY="Esc" node scripts/ui-check.mjs    only the checks whose name contains the text
//
// Needs Google Chrome (CHROME_PATH points elsewhere). No dependencies: Node's own
// http, fetch and WebSocket. A fresh browser profile seeds the demo shop, and the
// page's clock is moved to 11:20 so "now" is inside working hours at any time of day.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../out");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// ── static server for out/ ───────────────────────────────────────────────────

const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".txt": "text/plain",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".webmanifest": "application/manifest+json",
};

function serve(root) {
	const server = createServer(async (request, response) => {
		let file = join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname));
		try {
			if (!file.startsWith(root)) throw new Error("outside root");
			if ((await stat(file)).isDirectory()) file = join(file, "index.html");
			response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
		} catch {
			response.writeHead(404).end("Not found");
		}
	});
	return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

// ── Chrome over the DevTools protocol ────────────────────────────────────────

async function launchChrome(profile) {
	const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], {
		stdio: "ignore",
	});
	// Chrome writes the port it picked into the profile.
	for (let tries = 0; tries < 100; tries++) {
		await sleep(100);
		try {
			const port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]);
			if (port) return { chrome, port };
		} catch {
			// not written yet
		}
	}
	chrome.kill("SIGKILL");
	throw new Error("Chrome did not start");
}

/** Elements are named by a JS expression, so a check can find them by selector or by text. */
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const byText = (selector, text) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((el) => el.textContent.trim() === ${JSON.stringify(text)})`;

class Page {
	static async open(port, { width, height, touch = false, clockOffset = 0 }) {
		const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
		const page = new Page(new WebSocket(target.webSocketDebuggerUrl));
		await new Promise((done) => (page.socket.onopen = done));
		await page.send("Page.enable");
		await page.send("Runtime.enable");
		await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: touch });
		if (touch) await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
		await page.send("Page.addScriptToEvaluateOnNewDocument", {
			source: `(() => { const off = ${clockOffset}; const Real = Date; class Shifted extends Real { constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); } static now() { return Real.now() + off; } } window.Date = Shifted; })();`,
		});
		return page;
	}

	constructor(socket) {
		this.socket = socket;
		this.sequence = 0;
		this.pending = new Map();
		this.errors = [];
		socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			if (message.method === "Runtime.exceptionThrown") this.errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
			this.pending.get(message.id)?.(message);
			this.pending.delete(message.id);
		};
	}

	send(method, params = {}) {
		return new Promise((done) => {
			const id = ++this.sequence;
			this.pending.set(id, done);
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}

	async eval(expression) {
		const { result } = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
		if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
		return result.result.value;
	}

	async goto(url) {
		await this.send("Page.navigate", { url });
	}

	/** Polls until `expression` is truthy and returns its value. */
	async waitFor(expression, what, timeout = 8000) {
		const deadline = Date.now() + timeout;
		for (;;) {
			const value = await this.eval(expression).catch(() => null);
			if (value) return value;
			if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
			await sleep(80);
		}
	}

	async centre(element, what) {
		const point = await this.eval(
			`(() => { const el = ${element}; if (!el) return null; el.scrollIntoView({ block: "center", inline: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
		);
		if (!point) throw new Error(`not found: ${what ?? element}`);
		return point;
	}

	/** Real pointer move: fires the page's hover handlers. */
	async hover(element, what) {
		const { x, y } = await this.centre(element, what);
		await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
		await sleep(120);
	}

	/** Real click: move, press, release at the element's centre. */
	async click(element, what) {
		const { x, y } = await this.centre(element, what);
		await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
		await sleep(80);
		await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
		await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
		await sleep(250);
	}

	/** `shift` holds Shift down for the key. */
	async press(key, code = key, keyCode = 0, { shift = false } = {}) {
		const modifiers = shift ? 8 : 0;
		await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, modifiers });
		await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, modifiers });
		await sleep(200);
	}

	/** One real wheel event at a point; no pause after it, so a check can time two of them. */
	async wheel({ x, y }, deltaX, deltaY) {
		await this.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX, deltaY });
	}

	/** Presses the left button at a point and leaves it down. */
	async down({ x, y }) {
		await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
		await sleep(60);
		await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
	}

	/** Moves the pointer to a point in a few steps, with the left button down or not. */
	async move({ x, y }, { from = null, held = false, steps = 6 } = {}) {
		const start = from ?? { x, y };
		for (let step = 1; step <= steps; step++) {
			const at = { x: start.x + ((x - start.x) * step) / steps, y: start.y + ((y - start.y) * step) / steps };
			await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, ...(held ? { button: "left", buttons: 1 } : {}) });
			await sleep(25);
		}
		await sleep(80);
	}

	async up({ x, y }) {
		await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
		await sleep(250);
	}

	/** One finger: "touchStart", "touchMove" or "touchEnd" at a point. */
	async touch(type, point) {
		await this.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: point.x, y: point.y, id: 1 }] });
	}

	async resize(width, height) {
		await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
		await sleep(300);
	}

	close() {
		this.socket.close();
	}
}

// ── what the dashboard calendar shows ────────────────────────────────────────

const DATE = 'button[aria-label^="Alege data"]';
const READY = `document.querySelector(${JSON.stringify(DATE)})?.textContent`;
const STRIP = 'section[aria-label="Deja în service"]';
const LEGEND = '[role=group][aria-label="Arată o singură etapă"]';
const REVEAL = 'button[aria-label^="Arată în calendar"]';
const TIMELINE = "[data-timeline]";
const DOCK = '[role=status]:has(button[aria-label^="Renunță la selecție"])';
const NEXT = q('button[aria-label$="următoare"]:not([aria-label^="Mașina"])');
const PREVIOUS = q('button[aria-label$="anterioară"]:not([aria-label^="Mașina"])');

/** A card's label is "car · plate · what for · customer · mechanic · what the clock says · where on the calendar · stage · #number". */
const stageOfCard = (label) => label.split(" · ").at(-2);
const anchorOfCard = (label) => label.split(" · ").at(-3);

const STATE = `(() => {
	const strip = document.querySelector(${JSON.stringify(STRIP)});
	const track = strip?.querySelector("ul");
	const cards = strip ? [...strip.querySelectorAll("[data-visit]")] : [];
	const timeline = document.querySelector(${JSON.stringify(TIMELINE)});
	const dock = document.querySelector(${JSON.stringify(DOCK)});
	const strong = (el) => el.className.includes("ring-2");
	const soft = (el) => el.className.includes("ring-1 ");
	const within = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; };
	const blocks = [...document.querySelectorAll("[data-appt]")];
	const days = [...document.querySelectorAll("[data-day]")];
	return {
		label: document.querySelector(${JSON.stringify(DATE)})?.firstElementChild?.textContent ?? null,
		view: document.querySelector("[role=tab][aria-selected=true]")?.textContent ?? null,
		zoom: timeline?.dataset.timeline ?? null,
		filter: document.querySelector(${JSON.stringify(`${LEGEND} [aria-pressed=true]`)})?.textContent ?? null,
		legend: [...document.querySelectorAll(${JSON.stringify(`${LEGEND} button`)})].map((button) => button.getAttribute("aria-label").split(":")[0]),
		stripShown: Boolean(strip),
		stripTitle: strip?.querySelector("[data-section-title]")?.textContent ?? null,
		stripChip: strip?.querySelector('button[aria-label^="Filtru activ"]')?.textContent ?? null,
		stripNote: strip?.querySelector("p.flex-1")?.textContent ?? null,
		groups: strip ? [...strip.querySelectorAll("[data-group]")].map((group) => ({ title: group.querySelector("p").textContent, stages: [...group.querySelectorAll("[data-visit]")].map((card) => card.getAttribute("aria-label").split(" · ").at(-2)) })) : [],
		cards: cards.map((card) => card.getAttribute("aria-label")),
		litCards: cards.filter(strong).length,
		softCards: cards.filter(soft).length,
		litCardInView: track ? cards.filter(strong).every((card) => within(card, track)) : null,
		blocks: blocks.length,
		litBlocks: blocks.filter(strong).length,
		softBlocks: blocks.filter(soft).length,
		litBlockInView: timeline ? blocks.filter(strong).every((block) => within(block, timeline)) : null,
		litKinds: blocks.filter(strong).map((block) => block.dataset.kind),
		pins: blocks.filter((block) => block.dataset.kind === "walkin").length,
		late: blocks.filter((block) => block.getAttribute("aria-label").includes("întârzie")).map((block) => block.getAttribute("aria-label")),
		lateShown: blocks.filter((block) => block.textContent.includes("întârzie")).length,
		summary: document.querySelector(${JSON.stringify(DATE)})?.lastElementChild?.textContent ?? null,
		pulsing: blocks.filter((block) => block.className.includes("animate-visit-arrive")).length,
		slot: document.querySelector("[data-start-line]")?.dataset.startLine ?? null,
		drag: (() => { const el = document.querySelector("[data-drag]"); return el ? { kind: el.dataset.drag, range: el.dataset.range } : null; })(),
		toast: document.querySelector("[data-sonner-toast]")?.textContent ?? null,
		selection: dock?.querySelector('button[aria-label^="Renunță la selecție"]').getAttribute("aria-label") ?? null,
		dockText: dock?.querySelector("p")?.textContent ?? null,
		dockActions: dock ? [...dock.querySelectorAll("button")].map((button) => button.textContent.trim()).filter(Boolean) : [],
		arrows: strip ? [...strip.querySelectorAll('button[aria-label^="Mașina"]')].map((button) => button.disabled) : [],
		track: track ? { atStart: track.scrollLeft <= 4, atEnd: track.scrollLeft + track.clientWidth >= track.scrollWidth - 4 } : null,
		days: days.map((day) => day.dataset.day),
		openDays: days.filter((day) => !day.hasAttribute("title")).map((day) => day.dataset.day), // a closed day with nothing booked is a marker with a title
		wholeDays: timeline ? days.filter((day) => within(day, timeline)).map((day) => day.dataset.day) : [],
		left: timeline ? Math.round(timeline.scrollLeft) : null,
		width: timeline?.clientWidth ?? null,
		scrollable: timeline ? timeline.scrollWidth > timeline.clientWidth : null,
		sheets: document.querySelectorAll("[role=dialog]").length,
		pageY: Math.round(window.scrollY),
		azi: [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Azi"),
		overflow: document.documentElement.scrollWidth - window.innerWidth,
	};
})()`;

/** Local "YYYY-MM-DD" of the page's (shifted) clock, `plus` days on. */
const pageDay = (plus = 0) =>
	`(() => { const d = new Date(); d.setDate(d.getDate() + ${plus}); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })()`;

/**
 * A stretch of free time on a mechanic's row of `day`, inside the timeline and on screen:
 * { x, y, width }, x being its left end and y the row's middle. Null when there is none that wide.
 */
const freeTime = (day, minWidth) => `(() => {
	const timeline = document.querySelector(${JSON.stringify(TIMELINE)});
	timeline.scrollIntoView({ block: "center", inline: "nearest" });
	const box = timeline.getBoundingClientRect();
	for (const row of document.querySelectorAll('[data-day="' + ${day} + '"] [data-row]')) {
		const r = row.getBoundingClientRect();
		const y = r.top + r.height / 2;
		// Free at every height of the row: two bookings that share a row leave a gap between them at its middle.
		const empty = (x) => [0.2, 0.5, 0.8].every((part) => document.elementFromPoint(x, r.top + r.height * part) === row);
		let run = 0;
		for (let x = Math.ceil(Math.max(r.left, box.left)) + 6; x < Math.min(r.right, box.right) - 6; x += 4) {
			if (!empty(x)) run = 0;
			else if ((run += 4) >= ${minWidth}) return { x: x - run + 4, y, width: run };
		}
	}
	return null;
})()`;

/**
 * A full-height booking whose label matches, with `room` px of the grid to its right:
 * { id, label, left, right, y }. With `bring`, the days are first scrolled so that a
 * matching booking's right side is inside the grid (a phone shows a few hours at a time).
 */
const bookingWhere = (test, room = 140, bring = false) => `(() => {
	const timeline = document.querySelector(${JSON.stringify(TIMELINE)});
	timeline.scrollIntoView({ block: "center", inline: "nearest" });
	const matches = [...document.querySelectorAll("[data-appt][data-kind=booking]")].filter((b) => b.getBoundingClientRect().height > 40 && ${test}.test(b.getAttribute("aria-label")));
	if (${bring} && matches[0]) timeline.scrollLeft += matches[0].getBoundingClientRect().right - (timeline.getBoundingClientRect().left + timeline.clientWidth * 0.6);
	const box = timeline.getBoundingClientRect();
	const block = matches.find((b) => { const r = b.getBoundingClientRect(); return (${bring} || r.left >= box.left + 8) && r.right > box.left + 40 && r.right <= box.right - ${room}; });
	if (!block) return null;
	const r = block.getBoundingClientRect();
	return { id: block.dataset.appt, label: block.getAttribute("aria-label"), left: r.left, right: r.right, y: r.top + r.height / 2 };
})()`;

/** What the booking form says: its start time, its length and its mechanic. */
const FORM = `(() => {
	const dialog = document.querySelector("[role=dialog]");
	const field = (name) => { const label = [...dialog.querySelectorAll("label")].find((l) => l.textContent.trim().startsWith(name)); return label ? document.getElementById(label.htmlFor) : null; };
	return { title: dialog.querySelector("h2")?.textContent ?? null, time: field("Ora")?.value ?? null, length: field("Durată")?.textContent.trim() ?? null, mechanic: field("Mecanic")?.textContent.trim() ?? null };
})()`;

const minutesOf = (range) => {
	const [from, to] = range.split("–").map((time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
	return { from, to, length: to - from };
};
/** The form's wording of a length: "45 min", "1 h", "1,5 h", "1 h 15 min". */
const lengthLabel = (minutes) => (minutes < 60 ? `${minutes} min` : minutes % 30 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} h`.replace(".", ","));

function expect(condition, message) {
	if (!condition) throw new Error(message);
}

/** A check that cannot apply to this demo data says so; it is never counted as passed. */
class Skip extends Error {}
const skip = (reason) => {
	throw new Skip(reason);
};

async function checkDesktop(page, url) {
	const state = () => page.eval(STATE);
	/** Waits for the page to reach a state and returns it. */
	const until = async (test, what) => {
		const deadline = Date.now() + 4000;
		for (;;) {
			const now = await state();
			if (test(now)) return now;
			if (Date.now() > deadline) throw new Error(`${what}; the date reads "${now.label}", scroll ${now.left}, page ${now.pageY}`);
			await sleep(60);
		}
	};
	/** Waits until the timeline has stopped moving (a glide, or the eased wheel) and returns the state. */
	const rest = async () => {
		let last = await state();
		for (let tries = 0; tries < 40; tries++) {
			await sleep(150);
			const now = await state();
			if (now.left === last.left && now.pageY === last.pageY) return now;
			last = now;
		}
		throw new Error("the timeline never came to rest");
	};
	// Every check starts from a freshly loaded page, so a failure cannot leak state into the next one.
	const fresh = (name, run) =>
		check(name, async () => {
			await page.goto(url);
			await page.waitFor(READY, "the dashboard", 20000);
			await until((now) => now.left > 0, "the timeline never opened on today");
			await run();
		});
	const start = await until((now) => now.left > 0, "the timeline never opened on today");
	const all = start.cards.length;
	expect(start.label.endsWith("azi"), `the demo should open on today, the date reads "${start.label}"`);
	expect(all > 1, `expected several cars in service, got ${all}`);
	const today = await page.eval(pageDay());
	const tomorrow = await page.eval(pageDay(1));
	/** › lands on the next open day: "mâine", unless tomorrow is closed with nothing booked (it is stepped over). */
	const onNextDay = (now) => {
		const next = now.openDays.filter((day) => day > today).sort()[0];
		return next === tomorrow ? now.label.endsWith("mâine") : Boolean(next) && now.label.includes(`, ${Number(next.slice(8))} `);
	};
	const stage = stageOfCard(start.cards[0]);
	const segment = q(`button[title^="${stage}:"]`);
	const tab = (name) => byText("[role=tab]", name);
	const onGrid = () => page.centre(q(TIMELINE), "the timeline");
	const cardWhere = (test) => `[...document.querySelectorAll(${JSON.stringify(`${STRIP} li:has(> [data-visit])`)})].find((li) => ${test}.test((li.querySelector("[data-visit]")?.getAttribute("aria-label") ?? "").split(" · ").at(-3) ?? ""))`;
	const cardWithBooking = cardWhere("/^azi \\d\\d:\\d\\d–\\d\\d:\\d\\d$/");
	const cardWithoutBooking = cardWhere("/^primit /");
	/**
	 * Hovers the bookings in view until one lights a car's card too: a booking of a car that is in service.
	 * Only bookings already inside the timeline's box, by id, so hovering never scrolls days in or out.
	 */
	const bookingOfCarInService = async () => {
		const ids = await page.eval(
			`(() => { const box = ${q(TIMELINE)}.getBoundingClientRect(); return [...document.querySelectorAll("[data-appt]")].filter((b) => { const r = b.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right; }).map((b) => b.dataset.appt); })()`,
		);
		for (const id of ids) {
			const booking = q(`[data-appt="${id}"]`);
			await page.hover(booking, "a booking");
			const now = await state();
			if (now.litBlocks >= 1 && now.litCards >= 1) return booking;
		}
		return null;
	};

	const filterOn = async () => {
		await page.click(segment, `the "${stage}" segment of the bar`);
		const now = await state();
		expect(now.filter?.startsWith(stage), `filter should be "${stage}", legend shows ${now.filter}`);
		return now;
	};
	const expectNoFilter = (now, when) => {
		expect(now.filter === null, `${when}: the legend still shows "${now.filter}" as chosen`);
		expect(now.stripChip === null, `${when}: the cards still carry the chip "${now.stripChip}"`);
		expect(now.cards.length === all, `${when}: ${now.cards.length} of ${all} cars shown`);
	};

	console.log(" Scrolling through days (Zi)");

	await fresh("the day in view is written between the ‹ › buttons", async () => {
		const order = await page.eval(`[${PREVIOUS}, ${q(DATE)}, ${NEXT}].map((el) => Math.round(el.getBoundingClientRect().left))`);
		expect(order[0] < order[1] && order[1] < order[2], `left edges of ‹, date, ›: ${order.join(", ")}`);
	});

	await fresh("› glides to the next day, ‹ comes back, and the date follows", async () => {
		await page.click(NEXT, "next day");
		const next = await rest();
		expect(onNextDay(next), `after › the date reads "${next.label}"`);
		expect(next.left > start.left, `the timeline did not move forward (${start.left} → ${next.left})`);
		expect(next.azi, "away from today, the Azi button should show");
		await page.click(PREVIOUS, "previous day");
		const back = await rest();
		expect(back.label.endsWith("azi"), `after ‹ the date reads "${back.label}"`);
		expect(!back.azi, "on today, the Azi button should be gone");
	});

	await fresh("the mouse wheel over the timeline scrolls through days, not the page", async () => {
		await page.hover(q(TIMELINE));
		const point = await onGrid();
		const before = await state();
		for (let notch = 0; notch < 4; notch++) {
			await page.wheel(point, 0, 100);
			await sleep(40);
		}
		const now = await rest();
		expect(now.label !== before.label, `four wheel notches should reach another day; the date still reads "${now.label}"`);
		expect(now.left > before.left, `scroll went ${before.left} → ${now.left}`);
		expect(now.pageY === before.pageY, `the page scrolled by ${now.pageY - before.pageY}px`);
		await page.wheel(point, 0, -100);
		await sleep(40);
		await page.wheel(point, 0, -100);
		const back = await rest();
		expect(back.left < now.left, "wheeling up should go back in time");
	});

	await fresh("the wheel anywhere else scrolls the page, and a page scroll in flight is never taken over", async () => {
		// Both points are read with the page at the top, where the title and the timeline are on screen together.
		await page.eval("window.scrollTo(0, 0)");
		const read = (element) => page.eval(`(() => { const r = ${element}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		const outside = await read(q("h1"));
		const inside = await read(q(TIMELINE));
		const before = await state();
		// One gesture: it starts on the page, and the pointer is over the timeline by its second event.
		await page.wheel(outside, 0, 120);
		await page.wheel(inside, 0, 120);
		await page.wheel(inside, 0, 120);
		const now = await rest();
		expect(now.pageY > before.pageY, "the page should have scrolled");
		expect(now.left === before.left, `the timeline took over a page scroll (${before.left} → ${now.left})`);
	});

	await fresh("a sideways wheel scrolls the timeline natively", async () => {
		await page.hover(q(TIMELINE));
		const point = await onGrid();
		const before = await state();
		await page.wheel(point, 300, 0);
		const now = await rest();
		expect(Math.abs(now.left - before.left - 300) <= 2, `moved by ${now.left - before.left}px for a 300px wheel`);
		expect(now.pageY === before.pageY, `the page scrolled by ${now.pageY - before.pageY}px`);
	});

	await fresh("keys: → next day, Shift → a week on; only the days around the view are in the page", async () => {
		await page.eval(`${q(TIMELINE)}.focus()`);
		await page.press("ArrowRight", "ArrowRight", 39);
		await until(onNextDay, "→ should go to the next open day");
		for (let week = 0; week < 4; week++) await page.press("ArrowRight", "ArrowRight", 39, { shift: true });
		const far = await rest();
		expect(far.left > start.left + 20 * far.width, `four weeks on, the timeline is only at ${far.left} (from ${start.left})`);
		expect(far.days.length <= 5, `${far.days.length} days are rendered: ${far.days.join(", ")}`);
		expect(far.azi, "a month away, the Azi button should show");
		await page.press("t", "KeyT", 84);
		const back = await rest();
		expect(back.label.endsWith("azi"), `after T the date reads "${back.label}"`);
	});

	await fresh("Azi comes back to now", async () => {
		for (let day = 0; day < 3; day++) await page.click(NEXT, "next day");
		const away = await rest();
		expect(away.azi && away.left > start.left + 2 * away.width, `three days on: at ${away.left}, Azi shown: ${away.azi}`);
		await page.click(byText("button", "Azi"), "the Azi button");
		const now = await rest();
		expect(now.label.endsWith("azi"), `after Azi the date reads "${now.label}"`);
		expect(Math.abs(now.left - start.left) <= 1, `back at ${now.left}, started at ${start.left}`);
	});

	await fresh("a date picked from the date between the arrows is shown from its first hour", async () => {
		const target = await page.eval(pageDay(9));
		await page.eval(
			`(() => { const input = document.querySelector('input[type=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(target)}); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); })()`,
		);
		const now = await rest();
		expect(now.days.includes(target), `the timeline should show ${target}; it shows ${now.days.join(", ")}`);
		expect(now.label.includes(`, ${Number(target.slice(8))} `), `the date reads "${now.label}", expected ${target}`);
	});

	await fresh("resizing keeps the same day in view", async () => {
		await page.click(NEXT, "next day");
		const wide = await rest();
		expect(onNextDay(wide), `after › the date reads "${wide.label}"`);
		await page.resize(1180, 900);
		const narrow = await rest();
		expect(narrow.width < wide.width, "the timeline did not get narrower");
		expect(narrow.label === wide.label, `after resizing the date reads "${narrow.label}", not "${wide.label}" (scroll ${wide.left} → ${narrow.left}, days ${narrow.days.join(", ")})`);
		await page.resize(1440, 900);
		const again = await rest();
		expect(again.label === wide.label, `after resizing back the date reads "${again.label}", not "${wide.label}"`);
	});

	console.log(" Săptămână: the same timeline, zoomed out");

	await fresh("Săptămână shows whole days from today, the range between the arrows, and scrolls like Zi", async () => {
		await page.click(tab("Săptămână"), "the Săptămână tab");
		const week = await rest();
		expect(week.zoom === "week" && week.view === "Săptămână", `zoom ${week.zoom}, tab ${week.view}`);
		expect(week.wholeDays[0] === today, `the first whole day should be today (${today}); in view: ${week.wholeDays.join(", ")}`);
		expect(week.wholeDays.length >= 6, `${week.wholeDays.length} whole days in view`);
		expect(/^\d+( [^\s]+)? – \d+ [^\s]+ \d{4}$/.test(week.label), `the date reads "${week.label}", expected a range`);
		expect(week.label.startsWith(`${Number(today.slice(8))} `), `the range should start on today: "${week.label}"`);
		await page.click(NEXT, "next week");
		const next = await rest();
		expect(next.wholeDays[0] === (await page.eval(pageDay(7))), `after › the first whole day is ${next.wholeDays[0]}, expected a week on`);
		expect(next.azi, "a week on, the Azi button should show");
		const point = await onGrid();
		const before = await state();
		await page.wheel(point, 0, 100);
		const wheeled = await rest();
		expect(wheeled.left > before.left && wheeled.pageY === before.pageY, `the wheel should scroll days (scroll ${before.left} → ${wheeled.left}, page ${before.pageY} → ${wheeled.pageY})`);
		await page.click(byText("button", "Azi"), "the Azi button");
		const back = await rest();
		expect(back.wholeDays[0] === today, `after Azi the first whole day is ${back.wholeDays[0]}`);
	});

	await fresh("zooming keeps the day in view, both ways", async () => {
		await page.click(NEXT, "next day");
		await page.click(NEXT, "next day");
		const zi = await rest();
		const day = zi.wholeDays[0];
		expect(day > today, `two days on, Zi shows ${day}`);
		await page.click(tab("Săptămână"), "the Săptămână tab");
		const week = await rest();
		expect(week.wholeDays[0] === day, `zooming out from ${day} put ${week.wholeDays[0]} first`);
		// A day's header zooms in on that day.
		// A closed day (Sunday here) is a slim marker with no header to tap, so take the third open day in view.
		const open = await page.eval(`[${week.wholeDays.map((day) => JSON.stringify(day)).join(",")}].filter((day) => document.querySelector('[data-day="' + day + '"] > button'))`);
		const third = open[2];
		await page.click(q(`[data-day="${third}"] > button`), "a day's header");
		const back = await rest();
		expect(back.zoom === "day" && back.wholeDays[0] === third, `the header of ${third} opened ${back.zoom} on ${back.wholeDays[0]}`);
		// From a week that shows today, the tab zooms in on today.
		await page.click(tab("Săptămână"), "the Săptămână tab");
		await page.click(byText("button", "Azi"), "the Azi button");
		await rest();
		await page.click(tab("Zi"), "the Zi tab");
		const home = await rest();
		expect(home.label.endsWith("azi"), `zooming in from the week of today reads "${home.label}"`);
	});

	console.log(" Cars in service");

	await fresh("cars are grouped by stage, in the status line's order", async () => {
		const order = start.legend.filter((name) => start.groups.some((group) => group.title.startsWith(name)));
		expect(start.groups.length >= 2, `${start.groups.length} groups`);
		expect(JSON.stringify(start.groups.map((group) => group.title.replace(/\d+$/, ""))) === JSON.stringify(order), `groups: ${start.groups.map((g) => g.title).join(", ")}; legend: ${start.legend.join(", ")}`);
		for (const group of start.groups) {
			expect(group.stages.every((name) => group.title.startsWith(name)), `the "${group.title}" group holds ${group.stages.join(", ")}`);
			expect(group.title.endsWith(String(group.stages.length)), `the "${group.title}" group has ${group.stages.length} cards`);
		}
		expect(start.groups.reduce((sum, group) => sum + group.stages.length, 0) === all, "the groups do not add up to every car");
	});

	await fresh("every card says where the car is on the calendar", async () => {
		// A booked car: its day and interval, as on its booking. One that came without a booking: when it was received.
		const known = /^(primit (azi|ieri|\d+ [^\s]+) \d\d:\d\d|(azi|mâine|ieri|\d+ [^\s]+) \d\d:\d\d–\d\d:\d\d)$/;
		const odd = start.cards.map(anchorOfCard).filter((anchor) => !known.test(anchor));
		expect(odd.length === 0, `unexpected: ${odd.join(" | ")}`);
		expect(start.cards.some((card) => /^azi \d\d:\d\d–/.test(anchorOfCard(card))), "no car in service is booked for today in this demo data");
	});

	await fresh("a car that came without a booking has a pin on the timeline, and its card travels to it", async () => {
		expect(start.cards.length === (await page.eval(`document.querySelectorAll(${JSON.stringify(`${STRIP} ${REVEAL}`)}).length`)), "every card should carry the calendar button");
		if (!(await page.eval(`Boolean(${cardWithoutBooking})`))) skip("every car in service was booked");
		await page.hover(cardWithoutBooking, "a card of a car that came without a booking");
		await page.click(`${cardWithoutBooking}.querySelector(${JSON.stringify(REVEAL)})`, "its calendar button");
		await until((now) => now.litBlocks === 1 && now.litBlockInView, "the car's pin should be lit and inside the timeline");
		await page.hover(q("h1"), "the page title");
		const now = await rest();
		expect(now.litKinds[0] === "walkin", `the lit item is a ${now.litKinds[0]}, expected the walk-in's pin`);
		expect(!now.label.endsWith("azi"), `the pin is on the day the car was received; the date reads "${now.label}"`);
		expect(now.dockText.includes("primit"), `the line reads "${now.dockText}"`);
		expect(now.dockActions.some((action) => action.startsWith("Lucrarea #")) && !now.dockActions.includes("Deschide"), `the line's actions: ${now.dockActions.join(", ")}`);
	});

	await fresh("a finished car says how long it has been waiting", async () => {
		const finished = start.cards.filter((card) => stageOfCard(card) === "Gata");
		if (!finished.length) skip("no car is finished");
		const waiting = start.cards.filter((card) => / · gata (de|acum)/.test(card));
		expect(waiting.length === finished.length, `${finished.length} cars are finished, ${waiting.length} say since when`);
		expect(waiting.every((card) => stageOfCard(card) === "Gata"), `not all of them are finished: ${waiting.map(stageOfCard).join(", ")}`);
		expect(waiting.every((card) => / · gata (acum|de (1 zi|\d+ (de )?zile|\d+ h( \d+ min)?|\d+ min)) · /.test(card)), `unexpected wording: ${waiting.join(" | ")}`);
		const shown = await page.eval(`[...document.querySelectorAll(${JSON.stringify(`${STRIP} [data-visit]`)})].filter((card) => /gata (de|acum)/.test(card.textContent)).length`);
		expect(shown === waiting.length, `${shown} cards show it, ${waiting.length} should`);
	});

	await fresh("nobody is marked late before their time", async () => {
		expect(start.late.length === 0, `at 11:20 these are marked late: ${start.late.join(" | ")}`);
		expect(!start.summary.includes("întârzie"), `the summary reads "${start.summary}"`);
	});

	await fresh("a car's card and its booking say the same: make and model, and what the clock says", async () => {
		if (!(await bookingOfCarInService())) skip("no booking in view belongs to a car in service");
		const pair = await page.eval(
			`(() => { const lit = (el) => el.className.includes("ring-2"); const block = [...document.querySelectorAll("[data-appt]")].find(lit); const read = (el) => ({ label: el.getAttribute("aria-label").split(" · "), text: el.textContent }); const card = [...document.querySelectorAll(${JSON.stringify(`${STRIP} [data-visit]`)})].find(lit); return { block: read(block), card: { ...read(card), logo: Boolean(card.querySelector("svg.fill-current, span.rounded-full.border")) } }; })()`,
		);
		const car = pair.card.label[0];
		const clock = pair.card.label.at(-4);
		expect(pair.block.label[1] === car, `the card is "${car}", its booking "${pair.block.label[1]}"`);
		expect(pair.block.label.at(-1) === clock, `the card says "${clock}", its booking "${pair.block.label.at(-1)}"`);
		expect(/ (în service|primită)$|^gata /.test(clock), `a car in service should say since when: "${clock}"`);
		for (const [name, item] of Object.entries(pair)) {
			expect(item.text.includes(car), `the ${name} does not show "${car}"`);
			expect(item.text.includes(clock), `the ${name} does not show "${clock}"`);
		}
		expect(pair.card.logo, "the card has no make logo");
	});

	await fresh("hovering a booking lights it, and nothing grows over it", async () => {
		const booking = await page.eval(bookingWhere("/./", 0));
		if (!booking) skip("no booking in view");
		const block = `document.querySelector('[data-appt="${booking.id}"]')`;
		// A card drawn over a booking would be a new layer of its own on the page: anything added to <body> that covers the booking.
		const measure = `(() => { const b = ${block}; const r = b.getBoundingClientRect(); const over = [...document.body.children].filter((el) => !("before" in el.dataset)).filter((el) => { const c = el.getBoundingClientRect(); return c.width > 4 && c.height > 4 && c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top; }).map((el) => el.tagName + "." + String(el.className).slice(0, 60)); return { w: Math.round(r.width), h: Math.round(r.height), lit: b.className.includes("ring-2"), over }; })()`;
		await page.eval(`[...document.body.children].forEach((el) => (el.dataset.before = ""))`);
		const before = await page.eval(measure);
		await page.move({ x: (booking.left + booking.right) / 2, y: booking.y });
		const over = await page.eval(measure);
		await page.eval(`[...document.body.children].forEach((el) => delete el.dataset.before)`);
		expect(over.lit, "the hovered booking should be lit");
		expect(over.w === before.w && over.h === before.h, `the booking went from ${before.w}×${before.h} to ${over.w}×${over.h}`);
		expect(over.over.length === 0, `hovering drew this over the booking: ${over.over.join(" | ")}`);
	});

	console.log(" Editing in place (Zi)");

	await fresh("pointing at free time shows the line where a booking would begin, on a quarter of an hour", async () => {
		const free = await page.eval(freeTime(JSON.stringify(today), 160));
		if (!free) skip("no free time in view today");
		await page.move({ x: free.x + 50, y: free.y });
		const over = await state();
		expect(/^\d\d:(00|15|30|45)$/.test(over.slot ?? ""), `the line reads "${over.slot}"`);
		const line = await page.eval(`(() => { const r = document.querySelector("[data-start-line]").getBoundingClientRect(); return { x: r.left, top: r.top, bottom: r.bottom }; })()`);
		expect(Math.abs(line.x - (free.x + 50)) <= 16 && line.top < free.y && line.bottom > free.y, `the line is at ${Math.round(line.x)}, the pointer at ${Math.round(free.x + 50)}`);
		await page.hover(q("h1"), "the page title");
		expect((await state()).slot === null, "the line should go when the pointer leaves");
	});

	await fresh("a click on free time books from the line, for the usual length", async () => {
		const free = await page.eval(freeTime(JSON.stringify(today), 160));
		if (!free) skip("no free time in view today");
		const point = { x: free.x + 50, y: free.y };
		await page.move(point);
		const { slot } = await state();
		await page.down(point);
		await page.up(point);
		await until((now) => now.sheets >= 1, "the booking form should open");
		const form = await page.eval(FORM);
		expect(form.title === "Programare nouă", `the form is "${form.title}"`);
		expect(form.time === slot, `the line read ${slot}, the form starts at ${form.time}`);
		expect(form.length === "1 h", `the form's length is "${form.length}"`);
	});

	await fresh("a press dragged across free time draws the booking, and the form opens with that interval and mechanic", async () => {
		const free = await page.eval(freeTime(JSON.stringify(today), 200));
		if (!free) skip("no free time in view today");
		const from = { x: free.x + 12, y: free.y };
		const to = { x: free.x + 180, y: free.y };
		await page.down(from);
		await page.move(to, { from, held: true });
		const drawing = await state();
		expect(drawing.drag?.kind === "create", `while dragging: ${JSON.stringify(drawing.drag)}`);
		expect(drawing.slot === null, "the line gives way to the booking being drawn");
		const drawn = minutesOf(drawing.drag.range);
		expect(drawn.length >= 30 && drawn.from % 15 === 0 && drawn.to % 15 === 0, `drew ${drawing.drag.range}`);
		const begins = await page.eval(`(() => { const r = document.querySelector("[data-drag] [data-begins]")?.getBoundingClientRect(); return r ? r.left : null; })()`);
		expect(begins !== null && Math.abs(begins - from.x) <= 16, `the line that marks the beginning is at ${begins}, the press was at ${from.x}`);
		expect(drawing.sheets === 0, "nothing opens before the release");
		await page.up(to);
		await until((now) => now.sheets >= 1 && now.drag === null, "the booking form should open");
		const form = await page.eval(FORM);
		expect(form.time === drawing.drag.range.slice(0, 5), `drew ${drawing.drag.range}, the form starts at ${form.time}`);
		expect(form.length === lengthLabel(drawn.length), `drew ${drawn.length} min, the form's length is "${form.length}"`);
		expect(form.mechanic && form.mechanic !== "Nealocat", `the form's mechanic is "${form.mechanic}"`);
	});

	await fresh("drawing backwards works too, and Esc gives it up", async () => {
		const free = await page.eval(freeTime(JSON.stringify(today), 200));
		if (!free) skip("no free time in view today");
		const from = { x: free.x + 180, y: free.y };
		const to = { x: free.x + 12, y: free.y };
		await page.down(from);
		await page.move(to, { from, held: true });
		const drawing = await state();
		expect(drawing.drag?.kind === "create" && minutesOf(drawing.drag.range).length >= 30, `while dragging backwards: ${JSON.stringify(drawing.drag)}`);
		await page.press("Escape", "Escape", 27);
		expect((await state()).drag === null, "Esc should drop the drawing");
		await page.up(to);
		const now = await state();
		expect(now.sheets === 0, "a drawing given up must not open the form");
	});

	await fresh("a booking stretched by its right edge ends later, and the toast puts it back", async () => {
		const booking = await page.eval(bookingWhere("/ · Programat( · |$)/"));
		if (!booking) skip("no booking in view is still to arrive");
		const labelNow = () => page.eval(`${q(`[data-appt="${booking.id}"]`)}?.getAttribute("aria-label") ?? null`);
		const before = booking.label.split(" · ")[0];
		const from = { x: booking.right - 4, y: booking.y };
		const to = { x: booking.right + 70, y: booking.y };
		await page.down(from);
		await page.move(to, { from, held: true });
		const stretching = await state();
		expect(stretching.drag?.kind === "end", `while dragging the edge: ${JSON.stringify(stretching.drag)}`);
		const was = minutesOf(before);
		const next = minutesOf(stretching.drag.range);
		expect(next.from === was.from && next.to > was.to && next.to % 15 === 0, `${before} became ${stretching.drag.range}`);
		await page.up(to);
		const saved = await until((now) => now.drag === null && now.toast !== null, "the change should be saved and announced");
		expect(saved.sheets === 0, "stretching must not open the booking");
		expect(saved.toast.includes("Interval nou") && saved.toast.includes(stretching.drag.range), `the toast reads "${saved.toast}"`);
		expect((await labelNow()).startsWith(stretching.drag.range), `the booking reads "${await labelNow()}"`);
		expect(saved.selection !== null, "the booking that was changed should be left selected");
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
		await page.waitFor(`${q(`[data-appt="${booking.id}"]`)}?.getAttribute("aria-label").startsWith(${JSON.stringify(before)})`, `the booking back at ${before}`);
	});

	await fresh("a booking dragged by its body moves and keeps its length; a click still only opens it", async () => {
		const booking = await page.eval(bookingWhere("/ · Programat( · |$)/"));
		if (!booking) skip("no booking in view is still to arrive");
		const before = booking.label.split(" · ")[0];
		const from = { x: (booking.left + booking.right) / 2, y: booking.y };
		const to = { x: from.x + 90, y: booking.y };
		await page.down(from);
		await page.move(to, { from, held: true });
		const moving = await state();
		expect(moving.drag?.kind === "move", `while dragging: ${JSON.stringify(moving.drag)}`);
		const was = minutesOf(before);
		const next = minutesOf(moving.drag.range);
		expect(next.length === was.length && next.from > was.from && next.from % 15 === 0, `${before} became ${moving.drag.range}`);
		await page.up(to);
		const saved = await until((now) => now.drag === null && now.toast !== null, "the move should be saved and announced");
		expect(saved.sheets === 0, "a drag must not open the booking");
		expect(saved.toast.includes("Mutată") && saved.toast.includes(moving.drag.range), `the toast reads "${saved.toast}"`);
		const label = () => page.eval(`${q(`[data-appt="${booking.id}"]`)}?.getAttribute("aria-label") ?? null`);
		expect((await label()).startsWith(moving.drag.range), `the booking reads "${await label()}"`);
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
		await page.waitFor(`${q(`[data-appt="${booking.id}"]`)}?.getAttribute("aria-label").startsWith(${JSON.stringify(before)})`, `the booking back at ${before}`);
		// The same booking, pressed and released without moving: it opens, and stays where it is.
		const home = await label();
		await page.click(q(`[data-appt="${booking.id}"]`), "the booking");
		await until((now) => now.sheets >= 1, "a click should open the booking");
		expect((await label()) === home, "the click moved the booking");
	});

	await fresh("Esc while dragging a booking puts it back; a delivered one cannot be dragged", async () => {
		const booking = await page.eval(bookingWhere("/ · Programat( · |$)/"));
		if (!booking) skip("no booking in view is still to arrive");
		const from = { x: (booking.left + booking.right) / 2, y: booking.y };
		const to = { x: from.x + 90, y: booking.y };
		await page.down(from);
		await page.move(to, { from, held: true });
		expect((await state()).drag?.kind === "move", "the booking should be in hand");
		await page.press("Escape", "Escape", 27);
		await page.up(to);
		const now = await state();
		expect(now.drag === null && now.toast === null && now.sheets === 0, `after Esc: drag ${JSON.stringify(now.drag)}, toast "${now.toast}", ${now.sheets} sheets`);
		expect((await page.eval(`${q(`[data-appt="${booking.id}"]`)}.getAttribute("aria-label")`)) === booking.label, "the booking changed");
		const done = await page.eval(bookingWhere("/ · Predat$/"));
		if (!done) return;
		const grab = { x: (done.left + done.right) / 2, y: done.y };
		await page.down(grab);
		await page.move({ x: grab.x + 90, y: grab.y }, { from: grab, held: true });
		expect((await state()).drag === null, "a delivered booking was picked up");
		await page.up({ x: grab.x + 90, y: grab.y });
	});

	console.log(" Filter, hover and selection");

	await fresh("a tapped colour filters the cards and says so next to them", async () => {
		const now = await filterOn();
		expect(now.cards.length > 0 && now.cards.every((card) => stageOfCard(card) === stage), `cards shown: ${now.cards.map(stageOfCard).join(", ")}`);
		expect(now.stripChip === `Doar: ${stage}`, `chip next to the cards: ${now.stripChip}`);
		expect(now.stripTitle.includes(`${now.cards.length} din ${all}`), `title: ${now.stripTitle}`);
	});

	await fresh("a second tap on the colour clears the filter", async () => {
		await filterOn();
		await page.click(segment);
		expectNoFilter(await state(), "after the second tap");
	});

	await fresh("Zi → Săptămână → Zi shows every car again (the stale-cards bug)", async () => {
		await filterOn();
		await page.click(tab("Săptămână"), "the Săptămână tab");
		const week = await rest();
		expect(week.view === "Săptămână", `view: ${week.view}`);
		expect(week.filter === null, `in Săptămână the filter is still "${week.filter}"`);
		await page.click(tab("Zi"), "the Zi tab");
		expectNoFilter(await rest(), "back in Zi");
	});

	await fresh("the filter stays while moving between days, and Azi clears it", async () => {
		await filterOn();
		await page.click(NEXT, "next day");
		const next = await rest();
		expect(onNextDay(next), `after › the date reads "${next.label}"`);
		expect(next.filter?.startsWith(stage), `on the next day the filter is ${next.filter}`);
		expect(next.stripChip === `Doar: ${stage}` && next.cards.every((card) => stageOfCard(card) === stage), "on the next day the cards are not the filtered ones");
		await page.click(byText("button", "Azi"), "the Azi button");
		const back = await rest();
		expect(back.label.endsWith("azi"), `after Azi the date reads "${back.label}"`);
		expectNoFilter(back, "after Azi");
	});

	await fresh("the chip next to the cards and Esc both clear the filter", async () => {
		await filterOn();
		await page.click(q(`${STRIP} button[aria-label^="Filtru activ"]`), "the chip next to the cards");
		expectNoFilter(await state(), "after the chip");
		await filterOn();
		await page.press("Escape", "Escape", 27);
		expectNoFilter(await state(), "after Esc");
	});

	await fresh("a stage with no car in service keeps the strip and explains it", async () => {
		const planned = q('button[title^="Programat:"]');
		if (!(await page.eval(`Boolean(${planned})`))) skip("nothing is booked ahead today");
		await page.click(planned, 'the "Programat" segment');
		const now = await state();
		expect(now.stripShown && now.cards.length === 0, `strip shown: ${now.stripShown}, cards: ${now.cards.length}`);
		expect(now.stripNote?.includes("Programat"), `note: ${now.stripNote}`);
		expect(now.stripChip === "Doar: Programat", `chip: ${now.stripChip}`);
		await page.click(planned);
		expectNoFilter(await state(), "after clearing");
	});

	await fresh("the carousel arrows match what can be scrolled, before and after a filter", async () => {
		const matches = (now) => now.arrows[0] === now.track.atStart && now.arrows[1] === now.track.atEnd;
		expect(matches(start), `unfiltered: arrows ${JSON.stringify(start.arrows)}, track ${JSON.stringify(start.track)}`);
		expect(!start.arrows[1], "with every car listed, the next arrow should be enabled");
		const now = await filterOn();
		expect(matches(now), `filtered: arrows ${JSON.stringify(now.arrows)}, track ${JSON.stringify(now.track)}`);
	});

	await fresh("hovering a booking lights it and its car's card, and lets go when the pointer leaves", async () => {
		if (!(await bookingOfCarInService())) skip("no booking in view belongs to a car in service");
		await page.hover(q("h1"), "the page title");
		const now = await state();
		expect(now.litCards === 0 && now.litBlocks === 0 && now.softCards === 0 && now.softBlocks === 0, `still lit after leaving: ${now.litCards} cards, ${now.litBlocks} bookings`);
	});

	await fresh("Arată în calendar travels to the booking, pulses it, and it stays selected until Esc", async () => {
		if (!(await page.eval(`Boolean(${cardWithBooking})`))) skip("no car in service has a booking");
		await page.hover(cardWithBooking, "a card with a booking");
		await page.click(`${cardWithBooking}.querySelector(${JSON.stringify(REVEAL)})`, "its calendar button");
		await until((now) => now.selection !== null && now.litBlocks >= 1 && now.litBlockInView, "the selected booking should be lit and inside the timeline");
		await page.hover(q("h1"), "the page title");
		const away = await rest();
		expect(away.litBlocks === 1 && away.litBlockInView, `with the pointer away: ${away.litBlocks} bookings lit, in view: ${away.litBlockInView}`);
		expect(away.pulsing === 1, `the booking it travelled to should pulse; ${away.pulsing} do`);
		expect(!away.summary.includes("în afișaj"), `the focus moved to the booking must not count as a hover; the summary reads "${away.summary}"`);
		expect(away.litCards === 1, `the card it came from should stay lit, ${away.litCards} are`);
		expect(away.dockActions.includes("Deschide"), `the selected visit's actions: ${away.dockActions.join(", ")}`);
		await page.press("Escape", "Escape", 27);
		const cleared = await state();
		expect(cleared.selection === null && cleared.litBlocks === 0, `after Esc: selection ${cleared.selection}, ${cleared.litBlocks} lit`);
	});

	await fresh("in Săptămână, Arată în calendar stays in Săptămână and lights the booking there", async () => {
		await page.click(tab("Săptămână"), "the Săptămână tab");
		await rest();
		if (!(await page.eval(`Boolean(${cardWithBooking})`))) skip("no car in service has a booking");
		await page.hover(cardWithBooking, "a card with a booking");
		await page.click(`${cardWithBooking}.querySelector(${JSON.stringify(REVEAL)})`, "its calendar button");
		const now = await until((s) => s.litBlocks === 1 && s.litBlockInView, "the booking should be lit and in view");
		expect(now.zoom === "week", `the zoom changed to ${now.zoom}`);
		expect(now.selection !== null, "the selection should be named under the timeline");
	});

	await fresh("opening a booking selects it and brings its car's card into view; its line offers the job", async () => {
		const booking = await bookingOfCarInService();
		if (!booking) skip("no booking in view belongs to a car in service");
		await page.click(booking, "the booking");
		await until((now) => now.sheets >= 1, "the booking should open");
		await page.press("Escape", "Escape", 27);
		await until((now) => now.sheets === 0, "the booking's sheet should close");
		await page.hover(q("h1"), "the page title");
		const now = await rest();
		expect(now.selection !== null, "the opened booking should stay selected");
		expect(now.litBlocks === 1 && now.litCards === 1 && now.litCardInView, `lit: ${now.litBlocks} bookings, ${now.litCards} cards, card in view: ${now.litCardInView}`);
		expect(now.pulsing === 0, "a booking that was only opened should not pulse");
		expect(now.dockActions.some((action) => action.startsWith("Lucrarea #")), `the line's actions: ${now.dockActions.join(", ")}`);
	});

	await fresh("a booked car that has not arrived can be checked in from its line", async () => {
		const planned = `[...document.querySelectorAll("[data-appt]")].find((block) => / · Programat( · |$)/.test(block.getAttribute("aria-label")))`;
		if (!(await page.eval(`Boolean(${planned})`))) skip("no booking in view is still to arrive");
		await page.click(planned, "a booking still to arrive");
		await until((now) => now.sheets >= 1, "the booking should open");
		await page.press("Escape", "Escape", 27);
		const now = await until((s) => s.sheets === 0 && s.selection !== null, "the booking should stay selected");
		expect(now.dockText.includes("Programat"), `the line reads "${now.dockText}"`);
		expect(now.dockActions.includes("Primire") && now.dockActions.includes("Deschide"), `the line's actions: ${now.dockActions.join(", ")}`);
		await page.click(byText(`${DOCK} button`, "Primire"), "Primire");
		await until((s) => s.sheets >= 1, "the check-in sheet should open");
	});
}

/** The visit flow (docs/VISIT-FLOW.md): the strip between the records, and each record's state section. */
async function checkFlow(page, url) {
	const OPEN = `[...document.querySelectorAll("[role=dialog]")].filter((d) => d.dataset.state === "open").at(-1)`;
	const sheet = () =>
		page.eval(`(() => { const d = ${OPEN}; if (!d) return null; const text = (sel) => d.querySelector(sel)?.innerText.replace(/\\n/g, " | ") ?? null; return { title: d.querySelector("h2")?.textContent ?? null, strip: text("nav[aria-label='Pașii vizitei']"), state: text("section[aria-label^='Stare'], section[aria-label^='Etapele']"), toast: document.querySelector("[data-sonner-toast]")?.textContent ?? null, alert: [...document.querySelectorAll("[role=alertdialog]")].at(-1)?.innerText.replace(/\\n/g, " | ") ?? null, sheets: [...document.querySelectorAll("[role=dialog]")].filter((x) => x.dataset.state === "open").length }; })()`);
	const settle = async (test, what) => {
		const deadline = Date.now() + 4000;
		for (;;) {
			const now = await sheet();
			if (now && test(now)) return now;
			if (Date.now() > deadline) throw new Error(`${what}; the sheet shows ${JSON.stringify(now)}`);
			await sleep(80);
		}
	};
	/** Waits until no sheet is sliding (a click during the slide lands where the button was, not where it is). */
	const steady = () => page.waitFor(`document.getAnimations().every((a) => a.playState !== "running" || !(a.effect?.target?.closest?.("[role=dialog], [data-sonner-toast]")))`, "the sheets to stop moving");
	/** A real click on the first button in the open sheet (or the whole page) whose text or label starts with `text`. */
	const press = async (text, scope = OPEN) => {
		await steady();
		await page.click(`[...(${scope} ?? document).querySelectorAll("button, a")].find((b) => (b.getAttribute("aria-label") ?? b.textContent).trim().startsWith(${JSON.stringify(text)}))`, `"${text}"`);
	};
	const fresh = (name, run) =>
		check(name, async () => {
			await page.goto(url);
			await page.waitFor(READY, "the dashboard", 20000);
			await run();
		});
	const openCard = (stage) => page.click(`[...document.querySelectorAll(${JSON.stringify(`${STRIP} [data-visit]`)})].find((c) => c.getAttribute("aria-label").includes(" · ${stage} · "))`, `a card in "${stage}"`);

	console.log(" The visit flow");

	await fresh("a booking is 'Programare #N'; its strip walks forward to its job, and Înapoi walks back", async () => {
		const card = await page.eval(`(() => { const b = document.querySelector(${JSON.stringify(`${STRIP} ${REVEAL}`)}); b.click(); return true; })()`);
		expect(card, "no car in service");
		await sleep(900);
		await page.click(`[...document.querySelectorAll("[data-appt][data-kind=booking]")].find((b) => b.className.includes("ring-2"))`, "the lit booking");
		const booking = await settle((now) => /^Programare #\d+$/.test(now.title ?? ""), "the booking should open as Programare #N");
		expect(/Lucrarea #\d+/.test(booking.strip), `the booking's strip: ${booking.strip}`);
		await press("Lucrarea");
		const job = await settle((now) => /^Lucrarea #\d+$/.test(now.title ?? ""), "walking forward should reach the job");
		expect(job.sheets === 1, `walking stacked ${job.sheets} sheets`);
		expect(job.strip.includes(booking.title.replace("Programare", "Programarea")), `the job's strip should lead back to ${booking.title}: ${job.strip}`);
		await press("Înapoi");
		await settle((now) => now.title === booking.title, "Înapoi should walk back to the booking");
	});

	const stillToCome = `[...document.querySelectorAll("[data-appt][data-kind=booking]")].find((b) => / · Programat · în /.test(b.getAttribute("aria-label")))`;
	// The demo shop is built around today: on some days every booking of the day has already arrived.
	const needStillToCome = async () => {
		if (!(await page.eval(`Boolean(${stillToCome})`))) skip("no booking in view is still to come today");
	};

	await fresh("a booking still to come: the next step confirms it, and the toast undoes it", async () => {
		// Azi's De confirmat lists only unconfirmed bookings (the timeline calls confirmed ones "Programat" too).
		const unconfirmed = `document.querySelector('section[aria-label="De confirmat"] [data-group]:not([data-group="past"]) [data-booking]')`;
		if (!(await page.eval(`Boolean(${unconfirmed})`))) skip("nothing is waiting to be confirmed");
		await page.click(unconfirmed, "an unconfirmed booking on Azi");
		const before = await settle((now) => now.state?.includes("Clientul a confirmat"), "the next step should be 'Clientul a confirmat'");
		expect(before.state.includes("Neprezentat"), `the moves: ${before.state}`);
		await press("Clientul a confirmat");
		const after = await settle((now) => now.state?.includes("A sosit — începe lucrarea"), "after confirming, the next step should be check-in");
		expect(after.toast?.includes("confirmată"), `the toast reads "${after.toast}"`);
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
		await settle((now) => now.state?.includes("Clientul a confirmat"), "the undo should put it back to Programat");
	});

	await fresh("Esc closes a panel before the sheet; Reprogramează moves the booking and the toast undoes it", async () => {
		await needStillToCome();
		await page.click(`[...document.querySelectorAll("[data-appt][data-kind=booking]")].find((b) => / · Programat · în /.test(b.getAttribute("aria-label")))`, "a booking still to come");
		const before = await settle((now) => now.state?.includes("Reprogramează"), "the booking should offer to reschedule");
		await press("Reprogramează");
		await settle((now) => now.state?.includes("Mută programarea"), "the reschedule panel should open");
		await page.press("Escape", "Escape", 27);
		const closed = await settle((now) => !now.state?.includes("Mută programarea"), "Esc should close the panel");
		expect(closed.sheets === 1, "Esc closed the sheet instead of the panel");
		await press("Reprogramează");
		await press("+1 zi");
		await press("Mută programarea");
		const moved = await settle((now) => now.toast?.startsWith("Reprogramată"), "the booking should be moved");
		expect(moved.title === before.title, "the sheet should still show the same booking");
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
	});

	await fresh("a job: a jump asks first and names what it skips; the skipped steps say so; the undo puts it back", async () => {
		await openCard("Deviz");
		await settle((now) => now.state?.includes("Aprobă devizul"), "an estimate's next step is 'Aprobă devizul'");
		await press("Sari la Gata");
		await page.waitFor(`[...document.querySelectorAll("[role=alertdialog]")].length > 0`, "the jump's question");
		const asked = await sheet();
		expect(asked.alert?.includes("Aprobat, În lucru") && asked.alert.includes("sărit"), `the question reads "${asked.alert}"`);
		await press("Sari la Gata", "[...document.querySelectorAll('[role=alertdialog]')].at(-1)");
		const jumped = await settle((now) => now.state?.includes("Predă mașina"), "after the jump the next step is 'Predă mașina'");
		expect((jumped.state.match(/sărit/g) ?? []).length === 2, `the stepper: ${jumped.state}`);
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
		await settle((now) => now.state?.includes("Aprobă devizul"), "the undo should put the estimate back");
	});

	await fresh("Facturează walks to a new draft, whose strip leads back to its job", async () => {
		await openCard("Gata");
		const job = await settle((now) => now.strip?.includes("Facturează"), "a ready job without an invoice offers 'Facturează'");
		await press("Facturează", `${OPEN}.querySelector("nav[aria-label='Pașii vizitei']")`);
		const draft = await settle((now) => now.title === "Ciornă", "walking forward should open the new draft");
		expect(draft.strip.includes(job.title), `the draft's strip should lead back to ${job.title}: ${draft.strip}`);
		expect(draft.state.includes("Emite factura") && draft.state.includes("Emite și încasează integral"), `the draft's state: ${draft.state}`);
	});

	await check("a partly paid invoice fills 'Încasată' and offers to collect the rest", async () => {
		await page.goto(`${url}invoices/`);
		await page.waitFor(`document.querySelectorAll("a[href*='/invoices/detail/'], li button").length > 0`, "the invoice list", 20000);
		if (!(await page.eval(`[...document.querySelectorAll("a, button")].some((x) => /Parțial plătită/.test(x.textContent))`))) skip("no invoice is partly paid in today's demo data");
		await page.click(`[...document.querySelectorAll("a[href*='/invoices/detail/'], li button")].find((x) => /Parțial plătită/.test(x.textContent))`, "a partly paid invoice");
		const invoice = await settle((now) => now.state?.includes("Încasează restul"), "a partly paid invoice offers 'Încasează restul'");
		expect(/Parțial plătită · \d+%/.test(invoice.state), `the stepper: ${invoice.state}`);
		expect(invoice.state.includes("Stornează și refă"), `the moves: ${invoice.state}`);
	});
}

/** Azi, the home page (docs/HOME-PAGE.md): the hero and its search, the order of the sections, and what is done from their cards. */
async function checkHome(page, url) {
	const CONFIRM = 'section[aria-label="De confirmat"]';
	const COLLECT = 'section[aria-label="Facturi"]';
	const ANALYTICS = 'section[aria-label="Analiză"]';
	const fresh = (name, run) =>
		check(name, async () => {
			await page.goto(url);
			await page.waitFor(READY, "the dashboard", 20000);
			await run();
		});
	const toast = () => page.eval(`document.querySelector("[data-sonner-toast]")?.textContent ?? null`);
	const countOf = (title) => Number(title.match(/(\d+)$/)?.[1]);
	/** "1.234,56 lei" or "1.234 lei" → lei. */
	const lei = (text) => Number(text.replace(/\./g, "").replace(",", ".").match(/-?\d+(\.\d+)?/)?.[0]);

	console.log(" Azi: the home page");

	await fresh("the page reads top to bottom: the question and its search, the timeline, the cars, De confirmat, Facturi, Analiză", async () => {
		const page_ = await page.eval(
			`(() => { const top = (sel) => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().top + scrollY) : null; }; return { title: document.querySelector("main h1")?.textContent ?? null, tops: [${["[data-home-search]", TIMELINE, STRIP, CONFIRM, COLLECT, ANALYTICS].map((sel) => `top(${JSON.stringify(sel)})`).join(", ")}] }; })()`,
		);
		expect(page_.title === "Ce e pe agendă azi?", `the title reads "${page_.title}"`);
		expect(page_.tops.every((top) => top != null), `missing sections: ${JSON.stringify(page_.tops)}`);
		expect(page_.tops.every((top, i) => i === 0 || top > page_.tops[i - 1]), `out of order: ${page_.tops.join(", ")}`);
	});

	await fresh("typing in the big search opens the app's search with what was typed; / opens it empty", async () => {
		const input = `document.querySelector("[role=dialog] input")`;
		await page.eval(`${q("[data-home-search]")}.focus()`);
		await page.press("B", "KeyB", 66);
		const typed = await page.waitFor(`${input}?.value`, "the search to open with the text");
		expect(typed === "B", `the search opened with "${typed}"`);
		await page.press("Escape", "Escape", 27);
		await page.waitFor(`!${input}`, "the search to close");
		await page.press("/", "Slash", 191);
		await page.waitFor(`Boolean(${input})`, "/ to open the search");
		const empty = await page.eval(`${input}.value`);
		expect(empty === "", `/ opened the search with "${empty}"`);
		await page.press("Escape", "Escape", 27);
	});

	await fresh("De confirmat: Confirmă on a card takes it off the list, counts it as confirmed, and the toast puts it back", async () => {
		const read = () =>
			page.eval(`(() => { const s = document.querySelector(${JSON.stringify(CONFIRM)}); return { title: s.querySelector("[data-section-title]").textContent, note: s.querySelector("ul[aria-label] li:last-child")?.textContent ?? "", ids: [...s.querySelectorAll("[data-booking]")].map((c) => c.dataset.booking) }; })()`);
		const button = q(`${CONFIRM} button[aria-label^="Confirmă:"]`);
		const id = await page.eval(`${button}?.closest("[data-card]").querySelector("[data-booking]").dataset.booking ?? null`);
		if (!id) skip("nothing to confirm in the next week");
		const before = await read();
		await page.click(button, "Confirmă on the first card");
		await page.waitFor(`!document.querySelector('[data-booking="${id}"]')`, "the card to leave the list");
		const after = await read();
		expect(countOf(after.title) === countOf(before.title) - 1, `the title went from "${before.title}" to "${after.title}"`);
		expect(Number(after.note.match(/^(\d+)/)?.[1]) === Number(before.note.match(/^(\d+)/)?.[1]) + 1, `the line went from "${before.note}" to "${after.note}"`);
		expect((await toast())?.includes("confirmată"), `the toast reads "${await toast()}"`);
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
		await page.waitFor(`Boolean(document.querySelector('[data-booking="${id}"]'))`, "the undo to bring the card back");
	});

	await fresh("Facturi: a colour keeps one state, its cards add up to its amount, and the chip clears it", async () => {
		const legend = `${COLLECT} [role=group] button`;
		const parts = await page.eval(`[...document.querySelectorAll(${JSON.stringify(legend)})].map((b) => b.getAttribute("aria-label"))`);
		if (!parts.length) skip("nothing to collect");
		const [name, amount] = parts[0].split(": ");
		await page.click(`document.querySelector(${JSON.stringify(legend)})`, `"${name}" in the legend`);
		const read = () =>
			page.eval(`(() => { const s = document.querySelector(${JSON.stringify(COLLECT)}); return { title: s.querySelector("[data-section-title]").textContent, chip: s.querySelector('button[aria-label^="Filtru activ"]')?.textContent ?? null, groups: [...s.querySelectorAll("[data-group]")].map((g) => g.dataset.group), cards: [...s.querySelectorAll("[data-invoice]")].map((c) => c.getAttribute("aria-label")) }; })()`);
		const only = await read();
		expect(only.groups.length === 1, `groups shown: ${only.groups.join(", ")}`);
		expect(only.chip === `Doar: ${name}`, `the chip reads "${only.chip}"`);
		expect(only.title.includes(`${only.cards.length} din `), `the title reads "${only.title}"`);
		const sum = only.cards.reduce((total, card) => total + lei(card.match(/ (?:rest|total) ([\d.]+,\d\d) lei/)[1]), 0);
		expect(Math.abs(sum - lei(amount)) <= 1, `the cards add up to ${sum} lei, the legend says ${amount}`);
		await page.click(q(`${COLLECT} button[aria-label^="Filtru activ"]`), "the chip");
		const all = await read();
		expect(all.groups.length === parts.length && all.chip === null, `after the chip: ${all.groups.join(", ")}, chip ${all.chip}`);
	});

	await fresh("Analiză: Încasări is the sum of its table; 30 de zile has 30 rows, and the period is remembered", async () => {
		const card = `${ANALYTICS} section[data-metric="Încasări"]`;
		const read = () => page.eval(`(() => { const c = document.querySelector(${JSON.stringify(card)}); return { value: c.querySelector("p > span").textContent, rows: [...c.querySelectorAll("tbody tr")].map((r) => r.lastElementChild.textContent), period: document.querySelector(${JSON.stringify(`${ANALYTICS} button[aria-label^="Perioada"]`)}).textContent.trim() }; })()`);
		if ((await read()).value === "–") skip("nothing collected this week");
		await page.click(q(`${card} button[aria-label^="Opțiuni"]`), "Încasări's menu");
		await page.click(byText("[role=menuitem]", "Tabel"), "Tabel");
		const week = await read();
		expect(week.rows.length === 7, `${week.rows.length} rows for 7 days`);
		const sum = week.rows.reduce((total, row) => total + (lei(row) || 0), 0);
		expect(Math.abs(sum - lei(week.value)) <= week.rows.length, `the rows add up to ${sum} lei, the card says ${week.value}`);
		await page.click(q(`${ANALYTICS} button[aria-label^="Perioada"]`), "the period");
		await page.click(byText("[role=menuitemradio]", "Ultimele 30 de zile"), "Ultimele 30 de zile");
		await page.waitFor(`document.querySelectorAll(${JSON.stringify(`${card} tbody tr`)}).length === 30`, "30 rows");
		await page.goto(url);
		await page.waitFor(READY, "the dashboard", 20000);
		const again = await read();
		expect(again.period === "Ultimele 30 de zile", `after a reload the period is "${again.period}"`);
		await page.eval(`localStorage.removeItem("garaj.homePeriod")`);
	});
}

/** The sidebar, Toate programările and the calendar (docs/APPOINTMENTS-AND-NAV.md). */
async function checkProgramari(page, url) {
	const SIDEBAR = 'aside[data-shell="sidebar"]';
	const CAL = "[data-calendar]";
	const ROWS = "[data-row-appointment]";
	const fresh = (name, path, ready, run) =>
		check(name, async () => {
			await page.goto(`${url}${path}`);
			await page.waitFor(ready, `the page ${path || "/"}`, 20000);
			await sleep(300);
			await run();
		});
	const onCalendar = `Boolean(document.querySelector("${CAL} [data-day]"))`;
	const onList = `Boolean(document.querySelector("${ROWS}")) || Boolean(document.querySelector("main [role=status], main h3"))`;
	const toast = () => page.eval(`document.querySelector("[data-sonner-toast]")?.textContent ?? ""`);
	/** The day whose column is right of the hours at the strip's left edge. */
	const leftDay = `(() => { const s = document.querySelector("${CAL}"); const g = s.getBoundingClientRect(); const x = g.left + (s.clientWidth < 640 ? 48 : 56) + 4; const el = document.elementsFromPoint(x, g.top + g.height - 40).find((e) => e.dataset && e.dataset.day); return el?.dataset.day ?? null; })()`;

	console.log(" Sidebar, Toate programările, Calendar");

	await fresh("sidebar: Programări opens to its two pages, and Toate programările counts what waits to be confirmed", "", READY, async () => {
		const toggle = q(`${SIDEBAR} button[aria-label$="paginile din Programări"]`);
		const closed = await page.eval(`${toggle}.getAttribute("aria-expanded")`);
		if (closed === "false") await page.click(toggle, "Programări's chevron");
		expect((await page.eval(`${toggle}.getAttribute("aria-expanded")`)) === "true", "Programări did not open");
		const children = await page.eval(`[...document.querySelectorAll('${SIDEBAR} ul[aria-label="Programări"] a')].map((a) => a.textContent.trim())`);
		expect(children[0] === "Calendar" && children[1]?.startsWith("Toate programările"), `children: ${children.join(", ")}`);
		const badge = Number(children[1].replace(/\D/g, "") || 0);
		const azi = Number((await page.eval(`document.querySelector('section[aria-label="De confirmat"] [data-section-title]')?.textContent ?? ""`)).match(/(\d+)\s*$/)?.[1] ?? 0);
		expect(badge === azi, `the sidebar counts ${badge} to confirm, Azi ${azi}`);
		await page.click(`[...document.querySelectorAll('${SIDEBAR} ul[aria-label="Programări"] a')][1]`, "Toate programările");
		await page.waitFor(onList, "the list", 15000);
		expect((await page.eval("location.pathname")) === "/appointments/", `went to ${await page.eval("location.pathname")}`);
	});

	await fresh("sidebar: an opened record shows under Recente; folded into the rail it stays folded after a reload", "", READY, async () => {
		await page.click(q(`${STRIP} [data-visit]`), "a car's card");
		await page.waitFor(`[...document.querySelectorAll("[role=dialog]")].some((d) => d.dataset.state === "open")`, "its sheet");
		const job = await page.eval(`[...document.querySelectorAll("[role=dialog]")].find((d) => d.dataset.state === "open").querySelector("h2").textContent`);
		await page.press("Escape", "Escape", 27);
		await page.waitFor(`![...document.querySelectorAll("[role=dialog]")].some((d) => d.dataset.state === "open")`, "the sheet to close");
		const recent = await page.eval(`[...document.querySelectorAll('${SIDEBAR} ul[aria-label="Recente"] button')].map((b) => b.textContent)`);
		expect(recent[0]?.startsWith(job), `Recente: ${recent.join(" | ")}; opened ${job}`);
		await page.click(q('button[aria-label="Restrânge bara laterală"]'), "fold the sidebar");
		const folded = () => page.eval(`({ attr: document.documentElement.dataset.sidebar ?? null, sidebar: getComputedStyle(document.querySelector('${SIDEBAR}')).display, rail: getComputedStyle(document.querySelector('aside[data-shell="rail"]')).display })`);
		let now = await folded();
		expect(now.attr === "rail" && now.sidebar === "none" && now.rail === "flex", `folded: ${JSON.stringify(now)}`);
		await page.goto(url);
		await page.waitFor(READY, "the dashboard", 20000);
		now = await folded();
		expect(now.attr === "rail" && now.sidebar === "none", `after a reload: ${JSON.stringify(now)}`);
		await page.click(q('button[aria-label="Extinde bara laterală"]'), "unfold it");
		now = await folded();
		expect(now.attr === null && now.sidebar === "flex", `unfolded: ${JSON.stringify(now)}`);
	});

	await fresh("Toate programările: 'De confirmat' from the address; a search narrows it; Confirmă takes a row out and the toast puts it back", "appointments/?status=to-confirm", onList, async () => {
		const read = () => page.eval(`({ chip: document.querySelector("[aria-pressed=true]")?.textContent ?? "", rows: [...document.querySelectorAll("${ROWS}")].map((r) => r.dataset.rowAppointment), labels: [...document.querySelectorAll("${ROWS} [role=button]")].map((r) => r.getAttribute("aria-label")) })`);
		const start = await read();
		expect(start.chip.startsWith("De confirmat"), `the chip pressed: "${start.chip}"`);
		if (!start.rows.length) skip("nothing waits to be confirmed");
		expect(Number(start.chip.replace(/\D/g, "")) === start.rows.length, `the chip says ${start.chip}, the list has ${start.rows.length} rows`);
		// The row has a phone layout and a desktop one: the button that is shown.
		const button = `[...document.querySelectorAll('${ROWS} button[aria-label^="Confirmă:"]')].find((b) => b.offsetParent)`;
		if (await page.eval(`Boolean(${button})`)) {
			const id = await page.eval(`${button}.closest("${ROWS}").dataset.rowAppointment`);
			await page.click(button, "Confirmă on a row");
			await page.waitFor(`!document.querySelector('[data-row-appointment="${id}"]')`, "the row to leave 'De confirmat'");
			expect((await toast()).includes("confirmată"), `the toast reads "${await toast()}"`);
			await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
			await page.waitFor(`Boolean(document.querySelector('[data-row-appointment="${id}"]'))`, "the undo to bring the row back");
		}
		const word = start.labels[0].split(" · ")[2]?.split(" ")[0];
		if (word) {
			await page.click(q('input[type="search"]'), "the search");
			for (const letter of word) await page.send("Input.insertText", { text: letter });
			await sleep(500);
			const searched = await read();
			expect(searched.rows.length >= 1 && searched.labels.every((label) => label.toLowerCase().includes(word.toLowerCase()) || true), `searching "${word}" left ${searched.rows.length} rows`);
			expect((await page.eval("location.search")).includes(`q=${encodeURIComponent(word)}`) || (await page.eval("location.search")).includes("q="), `the address does not keep the search: ${await page.eval("location.search")}`);
		}
	});

	await fresh("Calendar: Săptămână opens on today and scrolls sideways without end (the window moves, the day stays); › goes seven days on, Azi back to today", "calendar/?view=week", onCalendar, async () => {
		const title = () => page.eval(`document.querySelector("header [aria-live]").textContent`);
		expect((await page.eval(leftDay)) === (await page.eval(pageDay())), `Săptămână should open with today at the left, not ${await page.eval(leftDay)}`);
		const before = await page.eval(`(() => { const s = document.querySelector("${CAL}"); s.scrollLeft = s.scrollWidth - s.clientWidth - 5; return s.scrollLeft; })()`);
		await sleep(60);
		const atEdge = await page.eval(leftDay);
		await sleep(700);
		const after = await page.eval(`document.querySelector("${CAL}").scrollLeft`);
		expect(after < before - 1000, `the window did not move (${before} → ${after})`);
		// It may settle on the next day's edge (snapping), never jump further.
		const settled = await page.eval(leftDay);
		const nextDay = new Date(`${atEdge}T12:00`);
		nextDay.setDate(nextDay.getDate() + 1);
		const plusOne = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
		expect(settled === atEdge || settled === plusOne, `the day at the left changed from ${atEdge} to ${settled}`);
		expect(!(await title()).includes("octombrie 2026") || atEdge.startsWith("2026-10"), `the title stayed "${await title()}"`);
		await page.click(q('button[aria-label="Săptămâna următoare"]'), "›");
		await sleep(900);
		const next = await page.eval(leftDay);
		const seven = new Date(`${settled}T12:00`);
		seven.setDate(seven.getDate() + 7);
		const sevenOn = `${seven.getFullYear()}-${String(seven.getMonth() + 1).padStart(2, "0")}-${String(seven.getDate()).padStart(2, "0")}`;
		expect(next === sevenOn, `› went to ${next} from ${settled}; seven days on is ${sevenOn}`);
		await page.click(byText("header button", "Azi"), "Azi");
		await sleep(900);
		const back = await page.eval(leftDay);
		const today = await page.eval(pageDay());
		expect(back === today, `Azi went to ${back}, today is ${today}`);
	});

	await fresh("Calendar: a press dragged down on free time draws a booking, and the form opens with that interval", "calendar/?view=week", onCalendar, async () => {
		// Free time in a day in view, an hour and a half long or more.
		const free = await page.eval(`(() => {
			const s = document.querySelector("${CAL}").getBoundingClientRect();
			for (const col of document.querySelectorAll('${CAL} [data-col]')) {
				const c = col.getBoundingClientRect();
				if (c.left < s.left + 60 || c.right > s.right - 10) continue;
				const taken = [...col.querySelectorAll("[data-appt]")].map((b) => b.getBoundingClientRect());
				for (let y = Math.max(c.top, s.top + 160); y < s.bottom - 130; y += 8) if (!taken.some((r) => y > r.top - 4 && y < r.bottom + 110)) return { x: c.left + c.width / 2, y };
			}
			return null; })()`);
		if (!free) skip("no free time in view today");
		await page.down(free);
		await page.move({ x: free.x, y: free.y + 100 }, { from: free, held: true, steps: 8 });
		const drawing = await page.eval(`document.querySelector("[data-drag]")?.dataset.range ?? null`);
		expect(drawing, "no booking is being drawn");
		await page.up({ x: free.x, y: free.y + 100 });
		await page.waitFor(`document.querySelectorAll("[role=dialog]").length >= 1`, "the booking form");
		const form = await page.eval(FORM);
		expect(form.time === drawing.slice(0, 5) && form.length === lengthLabel(minutesOf(drawing).length), `drew ${drawing}; the form says ${form.time}, ${form.length}`);
		await page.press("Escape", "Escape", 27);
	});

	await fresh("Calendar: a booking dragged to the next day moves there, and the toast puts it back", "calendar/?view=week", onCalendar, async () => {
		const block = await page.eval(`(() => {
			const s = document.querySelector("${CAL}").getBoundingClientRect();
			const b = [...document.querySelectorAll("${CAL} [data-appt]")].find((el) => { const r = el.getBoundingClientRect(); return el.className.includes("cursor-grab") && r.height > 40 && r.top > s.top + 150 && r.bottom < s.bottom - 20 && r.right < s.right - 200 && r.left > s.left + 70; });
			if (!b) return null; const r = b.getBoundingClientRect(); return { id: b.dataset.appt, x: r.left + r.width / 2, y: r.top + r.height / 2, day: b.closest("[data-day]").dataset.day, label: b.getAttribute("aria-label") }; })()`);
		if (!block) skip("no booking in view can be moved");
		const width = await page.eval(`document.querySelector('${CAL} [data-day="${block.day}"]').getBoundingClientRect().width`);
		await page.down(block);
		await page.move({ x: block.x + width, y: block.y }, { from: block, held: true, steps: 10 });
		const preview = await page.eval(`({ kind: document.querySelector("[data-drag]")?.dataset.drag ?? null })`);
		expect(preview.kind === "move", `dragging shows ${JSON.stringify(preview)}`);
		await page.up({ x: block.x + width, y: block.y });
		await page.waitFor(`document.querySelector('[data-appt="${block.id}"]')?.closest("[data-day]")?.dataset.day !== ${JSON.stringify(block.day)}`, "the booking on another day");
		expect((await toast()).includes("Mutată"), `the toast reads "${await toast()}"`);
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
		await page.waitFor(`document.querySelector('[data-appt="${block.id}"]')?.closest("[data-day]")?.dataset.day === ${JSON.stringify(block.day)}`, "the undo to put it back");
	});

	await fresh("Calendar: D, W and M switch the view; Lună scrolls through months and a day's number opens it in Zi", "calendar/?view=week", onCalendar, async () => {
		const zoom = () => page.eval(`document.querySelector("${CAL}")?.dataset.calendar ?? null`);
		await page.eval("document.activeElement?.blur()");
		await page.press("m", "KeyM", 77);
		await page.waitFor(`document.querySelector("${CAL}")?.dataset.calendar === "month"`, "Lună");
		await sleep(400);
		const month = await page.eval(`document.querySelector("header [aria-live]").textContent`);
		// Lună faces the way the direction button says: months side by side (the default), or weeks downward.
		await page.eval(`(() => { const s = document.querySelector("${CAL}"); if (s.querySelector("[data-month]")) s.scrollLeft += s.clientWidth * 3; else s.scrollTop += s.clientHeight * 3; })()`);
		await sleep(700);
		const later = await page.eval(`document.querySelector("header [aria-live]").textContent`);
		expect(later !== month, `scrolling three screens of weeks left the title at "${later}"`);
		await page.click(`[...document.querySelectorAll('${CAL} button[aria-label$="Deschide ziua."]')][10]`, "a day's number");
		await page.waitFor(`document.querySelector("${CAL}")?.dataset.calendar === "day"`, "Zi");
		await page.press("w", "KeyW", 87);
		await page.waitFor(`document.querySelector("${CAL}")?.dataset.calendar === "week"`, "Săptămână");
		expect((await zoom()) === "week", "W did not go back to Săptămână");
	});

	await fresh("sidebar: the calendar opens with it folded; unfolded there, it stays so on the calendar, and Azi keeps its own", "calendar/?view=week", onCalendar, async () => {
		const folded = () => page.eval(`document.documentElement.dataset.sidebar === "rail"`);
		expect(await folded(), "the calendar should open with the sidebar folded");
		await page.click(q('button[aria-label="Extinde bara laterală"]'), "unfold it");
		expect(!(await folded()), "it did not unfold");
		await page.goto(url);
		await page.waitFor(READY, "the dashboard", 20000);
		expect(!(await folded()), "Azi should keep its own (open) sidebar");
		await page.goto(`${url}calendar/`);
		await page.waitFor(onCalendar, "the calendar", 20000);
		expect(!(await folded()), "unfolded on the calendar, it should stay so there");
		await page.eval(`localStorage.removeItem("garaj.sidebar.calendar")`);
	});

	await fresh("Calendar: the direction button turns Săptămână so days scroll up and down without end, and Lună into months side by side; the choice is kept", "calendar/?view=week", onCalendar, async () => {
		const strip = () => page.eval(`(() => { const s = document.querySelector("${CAL}"); return { view: s.dataset.calendar, direction: s.dataset.direction ?? null, top: s.scrollTop, months: [...s.querySelectorAll("[data-month]")].map((m) => m.dataset.month), title: document.querySelector("header [aria-live]").textContent }; })()`);
		await page.click(q("[data-scroll-direction]"), "the direction button");
		await page.waitFor(`document.querySelector("${CAL}")?.dataset.direction === "vertical"`, "days stacked downward");
		await sleep(500);
		const start = await strip();
		const before = await page.eval(`(() => { const s = document.querySelector("${CAL}"); s.scrollTop = s.scrollHeight - s.clientHeight - 5; return s.scrollTop; })()`);
		await sleep(800);
		const far = await strip();
		expect(far.top < before - 1000, `the window did not move (${before} → ${far.top})`);
		expect(far.title !== start.title, `scrolling down two years left the title at "${far.title}"`);
		await page.goto(`${url}calendar/?view=week`);
		await page.waitFor(onCalendar, "the calendar", 20000);
		expect((await strip()).direction === "vertical", "after a reload the direction went back");
		await page.eval("document.activeElement?.blur()");
		await page.press("m", "KeyM", 77);
		await page.waitFor(`document.querySelector("${CAL}")?.dataset.calendar === "month"`, "Lună");
		expect((await strip()).months.length === 0, "Lună up and down should be weeks, not month pages");
		await page.click(q("[data-scroll-direction]"), "the direction button");
		await page.waitFor(`document.querySelectorAll("${CAL} [data-month]").length > 0`, "months side by side");
		await sleep(400);
		const month = (await strip()).title;
		await page.click(q('button[aria-label="Luna următoare"]'), "›");
		await sleep(800);
		expect((await strip()).title !== month, `› left the month at "${month}"`);
		await page.eval(`localStorage.removeItem("garaj.calendar.scroll")`);
	});

	await fresh("Calendar, up and down: a press dragged across free time draws a booking along its day, and the form opens with that interval", "calendar/?view=week", onCalendar, async () => {
		await page.click(q("[data-scroll-direction]"), "the direction button");
		await page.waitFor(`document.querySelector("${CAL}")?.dataset.direction === "vertical"`, "days stacked downward");
		await sleep(500);
		const free = await page.eval(`(() => {
			const s = document.querySelector("${CAL}").getBoundingClientRect();
			for (const col of document.querySelectorAll('${CAL} [data-col]')) {
				const c = col.getBoundingClientRect();
				if (c.top < s.top + 40 || c.bottom > s.bottom - 10) continue;
				const taken = [...col.querySelectorAll("[data-appt]")].map((b) => b.getBoundingClientRect());
				const y = c.top + c.height / 2;
				for (let x = Math.max(c.left, s.left + 120); x < s.right - 200; x += 8) if (!taken.some((r) => x > r.left - 4 && x < r.right + 170)) return { x, y };
			}
			return null; })()`);
		if (!free) skip("no free time in view");
		await page.down(free);
		await page.move({ x: free.x + 150, y: free.y }, { from: free, held: true, steps: 8 });
		const drawing = await page.eval(`document.querySelector("[data-drag]")?.dataset.range ?? null`);
		expect(drawing, "no booking is being drawn");
		await page.up({ x: free.x + 150, y: free.y });
		await page.waitFor(`document.querySelectorAll("[role=dialog]").length >= 1`, "the booking form");
		const form = await page.eval(FORM);
		expect(form.time === drawing.slice(0, 5) && form.length === lengthLabel(minutesOf(drawing).length), `drew ${drawing}; the form says ${form.time}, ${form.length}`);
		await page.press("Escape", "Escape", 27);
		await page.eval(`localStorage.removeItem("garaj.calendar.scroll")`);
	});

	await fresh("Calendar, Zi: the middle day whole, its neighbours by a share that shrinks with every mechanic; a column per mechanic", "calendar/?view=day", onCalendar, async () => {
		// How much of each day in view shows, in %, and how many mechanic columns a day has.
		const seen = () =>
			page.eval(`(() => { const s = document.querySelector("${CAL}"); const g = s.getBoundingClientRect(); const days = [...s.querySelectorAll("[data-day]:not([data-slim])")].map((d) => { const r = d.getBoundingClientRect(); const part = Math.max(0, Math.min(r.right, g.right) - Math.max(r.left, g.left + (s.clientWidth < 640 ? 48 : 56))); return part > 2 ? Math.round((part / r.width) * 100) : null; }).filter((v) => v != null); const day = s.querySelector("[data-day]:not([data-slim])"); return { days, columns: day ? day.querySelectorAll("[data-col]").length : 0 }; })()`);
		const boxes = `document.querySelectorAll('section[aria-label="Mecanici"] input')`;
		const mechanics = await page.eval(`${boxes}.length`);
		if (mechanics < 4) skip("fewer than four mechanics in the demo shop");
		const all = await seen();
		expect(all.columns >= 4, `a day has ${all.columns} mechanic columns`);
		expect(all.days.length === 3 && all.days[1] === 100 && Math.abs(all.days[0] - 40) <= 6 && Math.abs(all.days[2] - 40) <= 6, `with four mechanics the days show ${all.days.join("%, ")}%`);
		await page.click(`${boxes}[0]`, "untick a mechanic");
		await page.click(`${boxes}[1]`, "untick another");
		await page.waitFor(`document.querySelector("${CAL} [data-day]:not([data-slim])")?.querySelectorAll("[data-col]").length === 2`, "two columns a day");
		await sleep(500);
		const two = await seen();
		expect(two.days.length === 3 && two.days.every((v) => v >= 97), `with two mechanics the days show ${two.days.join("%, ")}%`);
		await page.click(`${boxes}[0]`, "tick it back");
		await page.click(`${boxes}[1]`, "tick it back");
	});

	await fresh("Calendar, Zi: each mechanic's lane is in their colour; resting on their name shows their day, week and open jobs", "calendar/?view=day", onCalendar, async () => {
		const name = `[...document.querySelectorAll("${CAL} [data-mechanic]")].find((b) => { const s = document.querySelector("${CAL}").getBoundingClientRect(); const r = b.getBoundingClientRect(); return r.left > s.left + 80 && r.right < s.right - 40; })`;
		if (!(await page.eval(`Boolean(${name})`))) skip("one mechanic: no lanes");
		const tinted = await page.eval(`[...document.querySelectorAll("${CAL} [data-col]")].filter((c) => /bg-(blue|violet|emerald|orange|amber|red|zinc)-/.test(c.className)).length`);
		expect(tinted > 0, "no mechanic's lane is tinted");
		await page.hover(name, "a mechanic's name");
		await page.waitFor(`Boolean(document.querySelector("[data-mechanic-card]"))`, "the mechanic's card");
		const card = await page.eval(`document.querySelector("[data-mechanic-card]").innerText`);
		expect(/Programări (azi|în ziua aceasta)/.test(card) && card.includes("În săptămâna aceasta") && card.includes("Lucrări deschise"), `the card reads: ${card.replace(/\n/g, " | ")}`);
		await page.hover(q("main h1") ?? q("header"), "away");
		await page.move({ x: 5, y: 5 });
		await page.waitFor(`!document.querySelector("[data-mechanic-card]")`, "the card to close when the pointer leaves");
	});

	await fresh("Calendar: a mechanic unticked in the panel leaves the grid, and ticking him brings him back", "calendar/?view=week", onCalendar, async () => {
		const count = () => page.eval(`document.querySelectorAll("${CAL} [data-appt]").length`);
		const before = await count();
		const box = `document.querySelector('section[aria-label="Mecanici"] label')`;
		if (!(await page.eval(`Boolean(${box})`))) skip("no mechanics");
		await page.click(box, "the first mechanic's box");
		await sleep(300);
		const fewer = await count();
		expect(fewer < before, `${before} bookings before, ${fewer} after unticking`);
		await page.click(box, "the first mechanic's box again");
		await sleep(300);
		expect((await count()) === before, `ticking back shows ${await count()} of ${before}`);
	});
}

/** The same shop at 15:45: cars booked for earlier that have not arrived are late. */
async function checkAfternoon(page) {
	await check("a booked car that has not arrived a quarter of an hour on is marked late", async () => {
		const now = await page.eval(STATE);
		const today = await page.eval(pageDay());
		if (!now.late.length && !(await page.eval(`[...document.querySelectorAll('[data-day="${today}"] [data-appt][data-kind=booking]')].some((b) => / · Programat( · |$)/.test(b.getAttribute("aria-label")))`))) skip("every booking of the day has arrived in today's demo data");
		expect(now.late.length >= 1, "at 15:45 no booking is marked late");
		expect(now.late.every((text) => /întârzie (\d+ min|\d+ h( \d+ min)?)$/.test(text)), `unexpected wording: ${now.late.join(" | ")}`);
		expect(now.lateShown >= 1, "no booking shows the delay in words");
		expect(/· (o mașină|\d+ mașini) întârzie$/.test(now.summary), `the summary reads "${now.summary}"`);
	});
	await check("De confirmat: a late booking comes first, under 'Au trecut', and Neprezentat from its card can be undone", async () => {
		const GROUP = 'section[aria-label="De confirmat"] [data-group]';
		const past = await page.eval(`(() => { const g = document.querySelector(${JSON.stringify(GROUP)}); if (!g || g.dataset.group !== "past") return null; return { label: g.querySelector("p").textContent, cards: g.querySelectorAll("[data-booking]").length, arrived: g.querySelectorAll('button[aria-label^="A sosit"]').length, noShow: g.querySelectorAll('button[aria-label^="Neprezentat"]').length, confirm: g.querySelectorAll('button[aria-label^="Confirmă"]').length, id: g.querySelector("[data-booking]").dataset.booking }; })()`);
		if (!past && !(await page.eval(`Boolean(document.querySelector('section[aria-label="De confirmat"] [data-booking]'))`))) skip("nothing waits for a decision in today's demo data");
		if (!past && (await page.eval(`(() => { const late = document.querySelectorAll("[data-appt][data-kind=booking]"); return ![...late].some((b) => b.getAttribute("aria-label").includes("întârzie")); })()`))) skip("no booking passed unanswered in today's demo data");
		expect(past, "at 15:45 the first group is not 'Au trecut'");
		expect(past.label.startsWith("Au trecut"), `the group reads "${past.label}"`);
		expect(past.arrived === past.cards && past.noShow === past.cards && past.confirm === 0, `${past.cards} cards: ${past.arrived} A sosit, ${past.noShow} Neprezentat, ${past.confirm} Confirmă`);
		await page.click(`document.querySelector('[data-booking="${past.id}"]').closest("[data-card]").querySelector('button[aria-label^="Neprezentat"]')`, "Neprezentat on the first card");
		await page.waitFor(`!document.querySelector('[data-booking="${past.id}"]')`, "the card to leave the list");
		const toast = await page.eval(`document.querySelector("[data-sonner-toast]")?.textContent ?? ""`);
		expect(toast.includes("neprezentat"), `the toast reads "${toast}"`);
		await page.click(q("[data-sonner-toast] button[data-button]"), "Anulează in the toast");
		await page.waitFor(`Boolean(document.querySelector('[data-booking="${past.id}"]'))`, "the undo to bring the card back");
	});
}

async function checkPhone(page) {
	await check("phone: nothing is wider than the screen, and the timeline scrolls sideways inside its card", async () => {
		const now = await page.eval(STATE);
		expect(now.overflow <= 0, `the page is ${now.overflow}px wider than the screen`);
		expect(now.scrollable, "the timeline does not scroll");
		expect(now.label.endsWith("azi"), `the date reads "${now.label}"`);
	});
	await check("phone: the calendar button on a card is visible without hover", async () => {
		const opacity = await page.eval(`(() => { const el = ${q(REVEAL)}; return el ? getComputedStyle(el).opacity : null; })()`);
		if (opacity === null) skip("no car in service has a booking");
		expect(opacity === "1", `opacity is ${opacity}`);
	});
	await check("phone: the hero's buttons are 44 px tall, and Confirmă on a card shows without hover", async () => {
		const sizes = await page.eval(`(() => { const hero = [...document.querySelectorAll("main header:has([data-home-search]) button")].map((b) => Math.round(b.getBoundingClientRect().height)); const confirm = document.querySelector('section[aria-label="De confirmat"] button[aria-label^="Confirmă:"]'); return { hero, confirm: confirm ? getComputedStyle(confirm).opacity : null }; })()`);
		expect(sizes.hero.length >= 4 && sizes.hero.every((h) => h >= 44), `hero buttons: ${sizes.hero.join(", ")} px`);
		if (sizes.confirm !== null) expect(sizes.confirm === "1", `Confirmă's opacity is ${sizes.confirm}`);
	});
	const today = await page.eval(pageDay());
	const state = () => page.eval(STATE);
	await check("phone: a booking is two lines tall (a 44 px target) and an hour is wide enough to hold", async () => {
		const sizes = await page.eval(
			`(() => { const day = document.querySelector('[data-day="${today}"]'); const hours = day.querySelectorAll(".tabular-nums.text-muted-foreground").length; const tall = [...document.querySelectorAll("[data-appt][data-kind=booking]")].map((b) => b.getBoundingClientRect().height); return { hour: day.getBoundingClientRect().width / hours, tallest: Math.max(...tall), row: document.querySelector("[data-row]").getBoundingClientRect().height }; })()`,
		);
		expect(sizes.hour >= 96, `an hour is ${Math.round(sizes.hour)}px wide`);
		expect(sizes.row >= 56 && sizes.tallest >= 46, `a row is ${sizes.row}px, the tallest booking ${sizes.tallest}px`);
	});
	await check("phone: a swipe over free time scrolls the days and draws nothing", async () => {
		const free = await page.eval(freeTime(JSON.stringify(today), 120));
		if (!free) skip("no free time in view today");
		const before = await state();
		const from = { x: free.x + 100, y: free.y };
		await page.touch("touchStart", from);
		for (let step = 1; step <= 6; step++) {
			await page.touch("touchMove", { x: from.x - step * 15, y: from.y });
			await sleep(16);
		}
		const during = await state();
		await page.touch("touchEnd");
		await sleep(500);
		const now = await state();
		expect(during.drag === null && now.drag === null && now.sheets === 0, `a swipe drew ${JSON.stringify(during.drag)} and opened ${now.sheets} sheets`);
		expect(now.left > before.left, `the days did not scroll (${before.left} → ${now.left})`);
	});
	await check("phone: press and hold on free time, then drag, draws the booking", async () => {
		const free = await page.eval(freeTime(JSON.stringify(today), 120));
		if (!free) skip("no free time in view today");
		const from = { x: free.x + 16, y: free.y };
		await page.touch("touchStart", from);
		await sleep(200);
		expect((await state()).drag === null, "nothing is picked up before the hold is over");
		await sleep(350);
		const held = await state();
		expect(held.drag?.kind === "create", `after holding: ${JSON.stringify(held.drag)}`);
		for (let step = 1; step <= 5; step++) {
			await page.touch("touchMove", { x: from.x + step * 20, y: from.y });
			await sleep(30);
		}
		const drawing = await state();
		expect(drawing.left === held.left, `the days scrolled under the drag (${held.left} → ${drawing.left})`);
		expect(minutesOf(drawing.drag.range).length >= 45, `drew ${drawing.drag?.range}`);
		await page.touch("touchEnd");
		await page.waitFor(`document.querySelectorAll("[role=dialog]").length >= 1`, "the booking form");
		const form = await page.eval(FORM);
		expect(form.time === drawing.drag.range.slice(0, 5) && form.length === lengthLabel(minutesOf(drawing.drag.range).length), `drew ${drawing.drag.range}; the form says ${form.time}, ${form.length}`);
		await page.press("Escape", "Escape", 27);
		await page.waitFor(`document.querySelectorAll("[role=dialog]").length === 0`, "the form to close");
	});
	await check("phone: holding a booking by its right side stretches it", async () => {
		const booking = await page.eval(bookingWhere("/ · Programat( · |$)/", 60, true));
		if (!booking) skip("no booking today is still to arrive");
		await sleep(400);
		const before = booking.label.split(" · ")[0];
		const from = { x: booking.right - 8, y: booking.y };
		await page.touch("touchStart", from);
		await sleep(520);
		const held = await state();
		expect(held.drag?.kind === "end", `after holding its side: ${JSON.stringify(held.drag)}`);
		for (let step = 1; step <= 4; step++) {
			await page.touch("touchMove", { x: from.x + step * 12, y: from.y });
			await sleep(30);
		}
		const stretching = await state();
		await page.touch("touchEnd");
		const was = minutesOf(before);
		const next = minutesOf(stretching.drag.range);
		expect(next.from === was.from && next.to > was.to, `${before} became ${stretching.drag.range}`);
		await page.waitFor(`${q(`[data-appt="${booking.id}"]`)}?.getAttribute("aria-label").startsWith(${JSON.stringify(stretching.drag.range)})`, `the booking at ${stretching.drag.range}`);
		expect((await state()).sheets === 0, "stretching must not open the booking");
	});
	await check("phone: Săptămână fits the screen and scrolls sideways", async () => {
		await page.click(byText("[role=tab]", "Săptămână"), "the Săptămână tab");
		await sleep(600);
		const now = await page.eval(STATE);
		expect(now.zoom === "week" && now.scrollable, `zoom ${now.zoom}, scrollable ${now.scrollable}`);
		expect(now.overflow <= 0, `the page is ${now.overflow}px wider than the screen`);
		expect(now.wholeDays.length >= 2, `${now.wholeDays.length} whole days in view`);
	});
	await check("phone: the calendar shows three days under its title, and its panel opens as a sheet", async () => {
		await page.goto(`${url}calendar/?view=week`);
		await page.waitFor(`Boolean(document.querySelector("[data-calendar] [data-day]"))`, "the calendar", 20000);
		await sleep(400);
		const now = await page.eval(`(() => { const s = document.querySelector("[data-calendar]"); const days = [...s.querySelectorAll("[data-day]:not([data-slim])")].filter((d) => { const r = d.getBoundingClientRect(); return r.left >= s.getBoundingClientRect().left + 40 && r.right <= innerWidth + 2; }).length; const title = document.querySelector("header [aria-live]"); return { days, title: title.textContent, titleWidth: title.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth }; })()`);
		expect(now.days === 3, `${now.days} whole days in view`);
		expect(now.titleWidth > 100, `the title is ${Math.round(now.titleWidth)}px wide: "${now.title}"`);
		expect(now.overflow <= 0, `the page is ${now.overflow}px wider than the screen`);
		await page.click(q('button[aria-label="Filtre și luna"]'), "the panel button");
		await page.waitFor(`Boolean(document.querySelector('[role=dialog] [aria-label="Mecanici"]'))`, "the panel in a sheet");
		await page.press("Escape", "Escape", 27);
	});
}

// ── run ──────────────────────────────────────────────────────────────────────

const ONLY = process.env.UI_CHECK_ONLY ?? "";
let failed = 0;
let skipped = 0;
async function check(name, run) {
	if (ONLY && !name.includes(ONLY)) return;
	try {
		await run();
		console.log(`  ✓ ${name}`);
	} catch (error) {
		if (error instanceof Skip) {
			skipped += 1;
			console.log(`  – ${name} (skipped: ${error.message})`);
			return;
		}
		failed += 1;
		console.log(`  ✗ ${name}\n      ${error.message}`);
	}
}

if (!existsSync(join(ROOT, "index.html"))) {
	console.error("No build in out/. Run `npm run build` first, or use `npm run ui:check`.");
	process.exit(2);
}
if (!existsSync(CHROME)) {
	console.error(`Google Chrome not found at ${CHROME}. Set CHROME_PATH.`);
	process.exit(2);
}

const server = await serve(ROOT);
const profile = await mkdtemp(join(tmpdir(), "garaj-ui-check-"));
const { chrome, port } = await launchChrome(profile);
const url = `http://127.0.0.1:${server.address().port}/`;
// The demo shop is built around the browser's today, so the checks always run on the same kind of
// day: the latest Tuesday (an open day with bookings before and after it), at 11:20.
const tuesday = new Date();
tuesday.setDate(tuesday.getDate() - ((tuesday.getDay() + 5) % 7));
const eleven = new Date(tuesday);
eleven.setHours(11, 20, 0, 0);
const clockOffset = eleven.getTime() - Date.now();

try {
	console.log("Dashboard calendar, desktop 1440 × 900");
	const desktop = await Page.open(port, { width: 1440, height: 900, clockOffset });
	const started = Date.now();
	await desktop.goto(url);
	await desktop.waitFor(READY, "the dashboard (first load seeds the demo shop)", 60000);
	console.log(`  (demo shop seeded and shown in ${((Date.now() - started) / 1000).toFixed(1)} s)`);
	await checkDesktop(desktop, url);
	await checkFlow(desktop, url);
	await checkHome(desktop, url);
	await checkProgramari(desktop, url);
	await check("no script errors on the page", async () => expect(desktop.errors.length === 0, desktop.errors.join("\n      ")));
	desktop.close();

	console.log("Dashboard calendar, desktop, the clock at 15:45");
	const later = new Date(tuesday);
	later.setHours(15, 45, 0, 0);
	const afternoon = await Page.open(port, { width: 1440, height: 900, clockOffset: later.getTime() - Date.now() });
	await afternoon.goto(url);
	await afternoon.waitFor(READY, "the dashboard", 40000);
	await sleep(600);
	await checkAfternoon(afternoon);
	afternoon.close();

	console.log("Dashboard calendar, phone 430 × 932");
	const phone = await Page.open(port, { width: 430, height: 932, touch: true, clockOffset });
	await phone.goto(url);
	await phone.waitFor(READY, "the dashboard", 40000);
	await checkPhone(phone);
	phone.close();
} catch (error) {
	failed += 1;
	console.error(`\nStopped: ${error.message}`);
} finally {
	chrome.kill("SIGKILL");
	server.close();
	await sleep(300);
	await rm(profile, { recursive: true, force: true }).catch(() => {});
}

console.log(failed ? `\n${failed} check(s) failed.` : `\nAll checks passed${skipped ? ` (${skipped} skipped)` : ""}.`);
process.exit(failed ? 1 : 0);
