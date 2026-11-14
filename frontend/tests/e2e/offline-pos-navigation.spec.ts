import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, expect, test } from "@playwright/test";

const serviceWorker = readFileSync(
	new URL("../../../posawesome/www/sw.js", import.meta.url),
	"utf8",
);
const offlineDeskBoot = readFileSync(
	new URL("../../../posawesome/public/js/offline-desk-boot.js", import.meta.url),
	"utf8",
);
const manifest = {
	version: "test",
	assets: {
		loader: "/assets/posawesome/loader-hash.js?v=test",
		posawesome: "/assets/posawesome/pos-hash.js?v=test",
		css: "/assets/posawesome/style-hash.css?v=test",
		offlineIndex: "/assets/posawesome/offline-hash.js",
		chunks: ["/assets/posawesome/vendor-hash.js"],
	},
};

test("opens the POS in a fresh tab and reloads with the network offline", async () => {
	const server = createServer((request, response) => {
		const url = new URL(request.url || "/", "http://localhost");
		const send = (type: string, body: string) => {
			response.setHeader("Content-Type", type);
			response.end(body);
		};
		if (url.pathname.startsWith("/app/posapp")) {
			response.writeHead(302, { Location: request.url!.replace("/app/", "/desk/") });
			response.end();
		} else if (url.pathname.startsWith("/desk/posapp")) {
			send("text/html", `<!doctype html><head><link rel="stylesheet" href="/assets/frappe/desk.css">
				<script>window.frappe = {}; frappe.boot = {};</script>
				</head><body><h1>Starting POS</h1><span id="icon"></span><script src="/assets/frappe/desk.js"></script></body>`);
		} else if (url.pathname === "/assets/frappe/desk.css") {
			send("text/css", '#icon::before { content: "\u{F0349}"; }');
		} else if (url.pathname === "/sw.js") {
			send("text/javascript", serviceWorker);
		} else if (url.pathname.endsWith("/version.json")) {
			send("application/json", JSON.stringify(manifest));
		} else if (url.pathname === "/api/method/frappe.desk.form.load.getdoctype") {
			send("application/json", JSON.stringify({ docs: [{ doctype: "DocType", name: "Page" }] }));
		} else if (url.pathname === "/api/method/frappe.desk.desk_page.getpage") {
			send("application/json", JSON.stringify({ docs: [{ doctype: "Page", name: "posapp", __script: "boot();" }] }));
		} else if (url.pathname === "/assets/posawesome/js/offline-desk-boot.js") {
			send("text/javascript", offlineDeskBoot);
		} else if (url.pathname === "/assets/frappe/desk.js") {
			send("text/javascript", `
				const locals = {};
				frappe.model = { sync: (docs) => {
					for (const doc of docs) locals[doc.doctype + ":" + doc.name] = doc;
				}};
				document.addEventListener("DOMContentLoaded", async () => {
					if (!navigator.onLine && (!locals["DocType:Page"] || !locals["Page:posapp"]?.script)) {
						throw new Error("Desk cannot fetch missing Page metadata while offline");
					}
					const manifest = await fetch("/assets/posawesome/dist/js/version.json?t=" + Date.now());
					await import((await manifest.json()).assets.loader);
				});
			`);
		} else if (url.pathname === "/assets/posawesome/loader-hash.js") {
			send("text/javascript", `
				import { title } from "./vendor-hash.js";
				document.querySelector("h1").textContent = title;
			`);
		} else if (url.pathname === "/assets/posawesome/vendor-hash.js") {
			send("text/javascript", 'export const title = "POS ready";');
		} else {
			send(url.pathname.endsWith(".css") ? "text/css" : "text/plain", "");
		}
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const browser = await chromium.launch({
		channel: process.env.POSA_TEST_CHROMIUM_CHANNEL || undefined,
	});
	try {
		const context = await browser.newContext();
		const online = await context.newPage();
		await online.goto(origin + "/app/posapp/pos");
		await expect(online.getByRole("heading", { name: "POS ready" })).toBeVisible();
		await online.evaluate(async () => {
			await navigator.serviceWorker.register("/sw.js");
			await navigator.serviceWorker.ready;
		});
		await expect.poll(() => online.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
		await context.setOffline(true);
		const offline = await context.newPage();
		const expectCorrectIcon = async (page: typeof offline) => {
			expect(await page.evaluate(() => document.characterSet)).toBe("UTF-8");
			await expect.poll(() => page.locator("#icon").evaluate(
				(element) => getComputedStyle(element, "::before").content,
			)).toBe('"\u{F0349}"');
		};
		await online.reload();
		await expect(online.getByRole("heading", { name: "POS ready" })).toBeVisible();
		await expectCorrectIcon(online);
		const response = await offline.goto(origin + "/app/posapp/pos");
		expect(response?.fromServiceWorker()).toBe(true);
		await expect(offline).toHaveURL(origin + "/desk/posapp/pos");
		await expect(offline.getByRole("heading", { name: "POS ready" })).toBeVisible();
		await expectCorrectIcon(offline);
		await offline.reload();
		await expect(offline.getByRole("heading", { name: "POS ready" })).toBeVisible();
		await expectCorrectIcon(offline);
	} finally {
		await browser.close();
		server.close();
	}
});
