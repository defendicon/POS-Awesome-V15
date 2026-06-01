#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
	const key = process.argv[index];
	const value = process.argv[index + 1];
	if (key?.startsWith("--")) {
		args.set(key.slice(2), value && !value.startsWith("--") ? value : "1");
		if (value && !value.startsWith("--")) index += 1;
	}
}

const outDir = path.resolve(args.get("out") || "tmp/pos-performance-fixtures");
const itemCount = Number(args.get("items") || 25000);
const customerCount = Number(args.get("customers") || 25000);
const barcodeCount = Number(args.get("barcodes") || Math.min(itemCount * 2, 100000));
const invoiceCount = Number(args.get("queued-invoices") || 1000);

fs.mkdirSync(outDir, { recursive: true });

function writeJsonl(fileName, count, factory) {
	const stream = fs.createWriteStream(path.join(outDir, fileName), { encoding: "utf8" });
	for (let index = 0; index < count; index += 1) {
		stream.write(`${JSON.stringify(factory(index))}\n`);
	}
	stream.end();
}

writeJsonl("items.jsonl", itemCount, (index) => {
	const code = `PERF-ITEM-${String(index + 1).padStart(6, "0")}`;
	return {
		name: code,
		item_code: code,
		item_name: `Performance Item ${index + 1}`,
		item_group: `Perf Group ${index % 50}`,
		stock_uom: "Nos",
		brand: `Brand ${index % 25}`,
		price_list_rate: Number((10 + (index % 500) / 10).toFixed(2)),
		_search_index: `${code} performance item ${index + 1} brand ${index % 25}`.toLowerCase(),
	};
});

writeJsonl("barcodes.jsonl", barcodeCount, (index) => ({
	barcode: `99${String(index + 1).padStart(10, "0")}`,
	item_code: `PERF-ITEM-${String((index % itemCount) + 1).padStart(6, "0")}`,
	uom: "Nos",
}));

writeJsonl("customers.jsonl", customerCount, (index) => ({
	name: `PERF-CUST-${String(index + 1).padStart(6, "0")}`,
	customer_name: `Performance Customer ${index + 1}`,
	mobile_no: `555${String(index).padStart(7, "0")}`,
	email_id: `perf.customer.${index + 1}@example.test`,
	customer_group: `Perf Customers ${index % 20}`,
	territory: "All Territories",
}));

writeJsonl("offline_invoice_outbox.jsonl", invoiceCount, (index) => ({
	client_request_id: `perf-invoice-${String(index + 1).padStart(6, "0")}`,
	status: "pending",
	invoice: {
		customer: `PERF-CUST-${String((index % customerCount) + 1).padStart(6, "0")}`,
		items: Array.from({ length: 5 }, (_, line) => ({
			item_code: `PERF-ITEM-${String(((index + line) % itemCount) + 1).padStart(6, "0")}`,
			qty: 1 + (line % 3),
			rate: 10 + line,
		})),
	},
	data: {
		idempotency_key: `perf-invoice-${String(index + 1).padStart(6, "0")}`,
	},
}));

fs.writeFileSync(
	path.join(outDir, "README.md"),
	[
		"# POS Performance Fixture",
		"",
		`Items: ${itemCount}`,
		`Customers: ${customerCount}`,
		`Barcodes: ${barcodeCount}`,
		`Offline queued invoices: ${invoiceCount}`,
		"",
		"Generated data is synthetic and safe for local benchmark import tools.",
		"",
	].join("\n"),
);

console.log(`Generated POS performance fixture at ${outDir}`);
