#!/usr/bin/env node
// Browser checks for the dashboard calendar (docs/DASHBOARD-CALENDAR.md).
// Serves the built app (out/), drives it in headless Chrome over the DevTools
// protocol with real mouse and key input, and asserts what a user would see.
//
//   npm run ui:check              build, then run every check
//   node scripts/ui-check.mjs     run against the out/ that is already there
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
			`(() => { const el = ${element}; if (!el) return null; el.scrollIntoView({ block: "center", inline: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
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
const REVEAL = 'button[aria-label^="Arată programarea"]';
const TIMELINE = "[data-timeline]";
const NEXT = q('button[aria-label="Ziua următoare"]');
const PREVIOUS = q('button[aria-label="Ziua anterioară"]');

/** A card's label is "car · plate · customer · stage · #number". */
const stageOfCard = (label) => label.split(" · ").at(-2);

const STATE = `(() => {
	const strip = document.querySelector(${JSON.stringify(STRIP)});
	const track = strip?.querySelector("ul");
	const cards = strip ? [...strip.querySelectorAll("li > button:first-child")] : [];
	const timeline = document.querySelector(${JSON.stringify(TIMELINE)});
	const lit = (el) => el.className.includes("ring-brand");
	const inside = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; };
	const blocks = [...document.querySelectorAll("[data-appt]")];
	return {
		label: document.querySelector(${JSON.stringify(DATE)})?.textContent ?? null,
		view: document.querySelector("[role=tab][aria-selected=true]")?.textContent ?? null,
		filter: document.querySelector(${JSON.stringify(`${LEGEND} [aria-pressed=true]`)})?.textContent ?? null,
		stripShown: Boolean(strip),
		stripTitle: strip?.querySelector("p")?.textContent ?? null,
		stripChip: strip?.querySelector('button[aria-label^="Filtru activ"]')?.textContent ?? null,
		stripNote: strip?.querySelector("p.flex-1")?.textContent ?? null,
		cards: cards.map((card) => card.getAttribute("aria-label")),
		litCards: cards.filter(lit).length,
		blocks: blocks.length,
		litBlocks: blocks.filter(lit).length,
		litBlockInView: timeline ? blocks.filter(lit).every((block) => inside(block, timeline)) : null,
		selection: document.querySelector('button[aria-label^="Renunță la selecție"]')?.textContent ?? null,
		arrows: strip ? [...strip.querySelectorAll('button[aria-label^="Mașina"]')].map((button) => button.disabled) : [],
		track: track ? { atStart: track.scrollLeft <= 4, atEnd: track.scrollLeft + track.clientWidth >= track.scrollWidth - 4 } : null,
		days: [...document.querySelectorAll("[data-day]")].map((day) => day.dataset.day),
		left: timeline ? Math.round(timeline.scrollLeft) : null,
		width: timeline?.clientWidth ?? null,
		scrollable: timeline ? timeline.scrollWidth > timeline.clientWidth : null,
		pageY: Math.round(window.scrollY),
		azi: [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "Azi"),
		overflow: document.documentElement.scrollWidth - window.innerWidth,
	};
})()`;

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
	/** Waits for the page to reach a state (glides take up to 650 ms) and returns it. */
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
	const stage = stageOfCard(start.cards[0]);
	const segment = q(`button[title^="${stage}:"]`);
	const onGrid = () => page.centre(q(TIMELINE), "the timeline");

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

	console.log(" Scrolling through days");

	await fresh("the day in view is written between the ‹ › buttons", async () => {
		const order = await page.eval(`[${PREVIOUS}, ${q(DATE)}, ${NEXT}].map((el) => Math.round(el.getBoundingClientRect().left))`);
		expect(order[0] < order[1] && order[1] < order[2], `left edges of ‹, date, ›: ${order.join(", ")}`);
	});

	await fresh("› glides to the next day, ‹ comes back, and the date follows", async () => {
		await page.click(NEXT, "next day");
		const next = await rest();
		expect(next.label.endsWith("mâine"), `after › the date reads "${next.label}"`);
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
		await until((now) => now.label.endsWith("mâine"), "→ should go to tomorrow");
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
		const target = await page.eval(`(() => { const d = new Date(); d.setDate(d.getDate() + 9); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })()`);
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
		expect(wide.label.endsWith("mâine"), `after › the date reads "${wide.label}"`);
		await page.resize(1180, 900);
		const narrow = await rest();
		expect(narrow.width < wide.width, "the timeline did not get narrower");
		expect(narrow.label.endsWith("mâine"), `after resizing the date reads "${narrow.label}" (scroll ${wide.left} → ${narrow.left}, days ${narrow.days.join(", ")})`);
		await page.resize(1440, 900);
		const again = await rest();
		expect(again.label.endsWith("mâine"), `after resizing back the date reads "${again.label}"`);
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
		await page.click(byText("[role=tab]", "Săptămână"), "the Săptămână tab");
		const week = await state();
		expect(week.view === "Săptămână", `view: ${week.view}`);
		expect(week.filter === null, `in Săptămână the filter is still "${week.filter}"`);
		await page.click(byText("[role=tab]", "Zi"), "the Zi tab");
		expectNoFilter(await state(), "back in Zi");
	});

	await fresh("the filter stays while moving between days, and Azi clears it", async () => {
		await filterOn();
		await page.click(NEXT, "next day");
		const next = await rest();
		expect(next.label.endsWith("mâine"), `after › the date reads "${next.label}"`);
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
		// Find a booking on screen whose car is in service: hovering it must light both halves.
		const count = await page.eval(`document.querySelectorAll("[data-appt]").length`);
		let linked = null;
		for (let i = 0; i < count && !linked; i++) {
			await page.hover(`document.querySelectorAll("[data-appt]")[${i}]`, "a booking");
			const now = await state();
			if (now.litBlocks >= 1 && now.litCards >= 1) linked = now;
		}
		if (!linked) skip("no booking in view belongs to a car in service");
		await page.hover(q("h1"), "the page title");
		const now = await state();
		expect(now.litCards === 0 && now.litBlocks === 0, `still lit after leaving: ${now.litCards} cards, ${now.litBlocks} bookings`);
	});

	await fresh("Arată în calendar travels to the booking, and it stays selected until Esc", async () => {
		const card = `[...document.querySelectorAll(${JSON.stringify(`${STRIP} li`)})].find((li) => li.querySelector(${JSON.stringify(REVEAL)}))`;
		if (!(await page.eval(`Boolean(${card})`))) skip("no car in service has a booking");
		await page.hover(card, "a card with a booking");
		await page.click(`${card}.querySelector(${JSON.stringify(REVEAL)})`, "its calendar button");
		await page.waitFor(`Boolean(${q('button[aria-label^="Renunță la selecție"]')})`, "the selection to show in the header");
		await until((now) => now.litBlocks >= 1 && now.litBlockInView, "the selected booking should be lit and inside the timeline");
		await page.hover(q("h1"), "the page title");
		await sleep(700);
		const away = await state();
		expect(away.litBlocks === 1 && away.litBlockInView, `with the pointer away: ${away.litBlocks} bookings lit, in view: ${away.litBlockInView}`);
		expect(away.litCards === 1, `the card it came from should stay lit, ${away.litCards} are`);
		await page.press("Escape", "Escape", 27);
		const cleared = await state();
		expect(cleared.selection === null && cleared.litBlocks === 0, `after Esc: selection ${cleared.selection}, ${cleared.litBlocks} lit`);
	});

	await fresh("from Săptămână, Arată în calendar opens Zi on the booking", async () => {
		await page.click(byText("[role=tab]", "Săptămână"), "the Săptămână tab");
		const card = `[...document.querySelectorAll(${JSON.stringify(`${STRIP} li`)})].find((li) => li.querySelector(${JSON.stringify(REVEAL)}))`;
		if (!(await page.eval(`Boolean(${card})`))) skip("no car in service has a booking");
		await page.hover(card, "a card with a booking");
		await page.click(`${card}.querySelector(${JSON.stringify(REVEAL)})`, "its calendar button");
		const now = await until((s) => s.view === "Zi" && s.litBlocks === 1 && s.litBlockInView, "Zi should open with the booking lit and in view");
		expect(now.selection !== null, "the selection should be named in the header");
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
}

// ── run ──────────────────────────────────────────────────────────────────────

let failed = 0;
let skipped = 0;
async function check(name, run) {
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
// The same day, 11:20: inside working hours whenever the checks run.
const eleven = new Date();
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
	await check("no script errors on the page", async () => expect(desktop.errors.length === 0, desktop.errors.join("\n      ")));
	desktop.close();

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
