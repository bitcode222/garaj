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

	async press(key, code = key, keyCode = 0) {
		await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode });
		await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
		await sleep(200);
	}

	close() {
		this.socket.close();
	}
}

// ── what the dashboard calendar shows ────────────────────────────────────────

const READY = `document.querySelector("h2")?.textContent`;
const STRIP = 'section[aria-label="Deja în service"]';
const LEGEND = '[role=group][aria-label="Arată o singură etapă"]';
const REVEAL = 'button[aria-label^="Arată programarea"]';

/** A card's label is "car · plate · customer · stage · #number". */
const stageOfCard = (label) => label.split(" · ").at(-2);

const STATE = `(() => {
	const strip = document.querySelector(${JSON.stringify(STRIP)});
	const cards = strip ? [...strip.querySelectorAll("li > button:first-child")] : [];
	const lit = (el) => el.className.includes("ring-brand");
	return {
		title: document.querySelector("h2")?.textContent ?? null,
		view: document.querySelector("[role=tab][aria-selected=true]")?.textContent ?? null,
		filter: document.querySelector(${JSON.stringify(`${LEGEND} [aria-pressed=true]`)})?.textContent ?? null,
		stripShown: Boolean(strip),
		stripTitle: strip?.querySelector("p")?.textContent ?? null,
		stripChip: strip?.querySelector('button[aria-label^="Filtru activ"]')?.textContent ?? null,
		stripNote: strip?.querySelector("p.flex-1")?.textContent ?? null,
		cards: cards.map((card) => card.getAttribute("aria-label")),
		litCards: cards.filter(lit).length,
		blocks: document.querySelectorAll("[data-appt]").length,
		litBlocks: [...document.querySelectorAll("[data-appt]")].filter(lit).length,
		selection: document.querySelector('button[aria-label^="Renunță la selecție"]')?.textContent ?? null,
		arrows: strip ? [...strip.querySelectorAll('button[aria-label^="Mașina"]')].map((button) => button.disabled) : [],
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
	// Every check starts from a freshly loaded page, so a failure cannot leak state into the next one.
	const fresh = (name, run) =>
		check(name, async () => {
			await page.goto(url);
			await page.waitFor(READY, "the dashboard", 20000);
			await run();
		});
	const start = await state();
	const all = start.cards.length;
	expect(start.title === "Programul de azi", `the demo should open on today's day view, got "${start.title}"`);
	expect(all > 1, `expected several cars in service, got ${all}`);
	const stage = stageOfCard(start.cards[0]);
	const segment = `${q(`button[title^="${stage}:"]`)}`;

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
		await page.click(q('button[aria-label="Ziua următoare"]'), "next day");
		const next = await state();
		expect(next.filter?.startsWith(stage), `on the next day the filter is ${next.filter}`);
		await page.click(q('button[aria-label="Ziua anterioară"]'), "previous day");
		const back = await state();
		expect(back.stripChip === `Doar: ${stage}`, `back on today the chip is ${back.stripChip}`);
		expect(back.cards.every((card) => stageOfCard(card) === stage), "back on today the cards are not the filtered ones");
		await page.click(q('button[aria-label="Ziua următoare"]'), "next day");
		await page.click(byText("button", "Azi"), "the Azi button");
		expectNoFilter(await state(), "after Azi");
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

	await fresh("the carousel arrows match what can be scrolled", async () => {
		expect(start.arrows[0] === true, "at the start the previous arrow should be disabled");
		const counts = new Map();
		for (const card of start.cards) counts.set(stageOfCard(card), (counts.get(stageOfCard(card)) ?? 0) + 1);
		const single = [...counts].find(([, count]) => count === 1)?.[0];
		if (!single) skip("no stage has exactly one car in service");
		await page.click(q(`button[title^="${single}:"]`), `the "${single}" segment`);
		const now = await state();
		expect(now.cards.length === 1, `expected one "${single}" car, got ${now.cards.length}`);
		expect(now.arrows.every(Boolean), `one card cannot scroll, but the arrows are ${JSON.stringify(now.arrows)}`);
		await page.click(q(`button[title^="${single}:"]`));
	});

	await fresh("hover lights a car and lets go when the pointer leaves", async () => {
		await page.hover(q(`${STRIP} li`), "the first card");
		expect((await state()).litCards >= 1, "the hovered card is not lit");
		await page.hover(q("h1"), "the page title");
		const now = await state();
		expect(now.litCards === 0 && now.litBlocks === 0, `still lit after leaving: ${now.litCards} cards, ${now.litBlocks} bookings`);
	});

	await fresh("Arată în calendar selects the booking, and it stays selected until Esc", async () => {
		const card = `[...document.querySelectorAll(${JSON.stringify(`${STRIP} li`)})].find((li) => li.querySelector(${JSON.stringify(REVEAL)}))`;
		if (!(await page.eval(`Boolean(${card})`))) skip("no car in service has a booking");
		await page.hover(card, "a card with a booking");
		await page.click(`${card}.querySelector(${JSON.stringify(REVEAL)})`, "its calendar button");
		await page.waitFor(`Boolean(${q('button[aria-label^="Renunță la selecție"]')})`, "the selection to show in the header");
		await page.hover(q("h1"), "the page title");
		const away = await state();
		expect(away.litBlocks === 1, `with the pointer away, ${away.litBlocks} bookings are lit (expected the selected one)`);
		await page.press("Escape", "Escape", 27);
		const cleared = await state();
		expect(cleared.selection === null && cleared.litBlocks === 0, `after Esc: selection ${cleared.selection}, ${cleared.litBlocks} lit`);
	});
}

async function checkPhone(page) {
	await check("phone: nothing is wider than the screen", async () => {
		const now = await page.eval(STATE);
		expect(now.overflow <= 0, `the page is ${now.overflow}px wider than the screen`);
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
