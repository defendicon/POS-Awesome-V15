/* eslint-env worker */

const CONFIG_DEFAULTS = {
	normalizeUpcToEan13: true,
	enableChecksumValidation: true,
};

let config = { ...CONFIG_DEFAULTS };
let db = null;
let DexieLib = null;
const barcodeCache = new Map();

function normalizeKey(value) {
	if (value === null || value === undefined) {
		return "";
	}
	const trimmed = String(value).trim();
	return trimmed;
}

function cloneItem(item) {
	if (!item || typeof item !== "object") {
		return null;
	}
	try {
		return typeof structuredClone === "function"
			? structuredClone(item)
			: JSON.parse(JSON.stringify(item));
	} catch (error) {
		console.error("scannerWorker: clone failed", error);
		try {
			return JSON.parse(JSON.stringify(item));
		} catch (jsonError) {
			console.error("scannerWorker: JSON clone failed", jsonError);
			return null;
		}
	}
}

function addMapping(code, context) {
	const key = normalizeKey(code);
	if (!key) {
		return;
	}
	let list = barcodeCache.get(key);
	if (!list) {
		list = [];
		barcodeCache.set(key, list);
	}
	if (
		!list.some(
			(entry) =>
				entry.item_code === context.item_code &&
				entry.uom === context.uom &&
				entry.source === context.source,
		)
	) {
		list.push(context);
	}
}

function findConversionFactor(item, uom) {
	if (!uom) {
		return 1;
	}
	if (Array.isArray(item?.item_uoms)) {
		const match = item.item_uoms.find((entry) => {
			const entryUom = entry?.uom || entry?.posa_uom;
			return entryUom && String(entryUom).trim() === String(uom).trim();
		});
		if (match && typeof match.conversion_factor === "number") {
			return match.conversion_factor;
		}
	}
	return 1;
}

function indexItemRecord(item) {
	if (!item || !item.item_code) {
		return;
	}
	const cloned = cloneItem(item);
	if (!cloned) {
		return;
	}
	const base = {
		item_code: cloned.item_code,
		item_name: cloned.item_name,
		item: cloned,
		stock_uom: cloned.stock_uom,
		price_list_rate: cloned.price_list_rate,
		rate: cloned.rate,
		currency: cloned.currency,
	};

	addMapping(cloned.item_code, {
		...base,
		uom: cloned.stock_uom,
		conversion_factor: 1,
		source: "item_code",
		priority: 1,
	});

	if (cloned.barcode) {
		addMapping(cloned.barcode, {
			...base,
			uom: cloned.stock_uom,
			conversion_factor: 1,
			source: "item.barcode",
			priority: 1,
		});
	}

	const barcodeCollections = [];
	if (Array.isArray(cloned.item_barcode)) {
		barcodeCollections.push({ list: cloned.item_barcode, source: "item_barcode" });
	}
	if (Array.isArray(cloned.barcodes)) {
		barcodeCollections.push({ list: cloned.barcodes, source: "barcodes" });
	}

	barcodeCollections.forEach(({ list, source }) => {
		list.forEach((entry) => {
			if (!entry) {
				return;
			}
			const rawCode = entry.barcode || entry;
			const key = normalizeKey(rawCode);
			if (!key) {
				return;
			}
			const barcodeUom = entry.posa_uom || entry.uom || cloned.stock_uom;
			const conversion = findConversionFactor(cloned, barcodeUom);
			const mapping = {
				...base,
				uom: barcodeUom,
				conversion_factor: conversion,
				source,
				barcode_entry: entry,
				priority: barcodeUom ? 3 : 2,
			};
			addMapping(key, mapping);
			if (config.normalizeUpcToEan13 && /^\d{12}$/.test(key)) {
				addMapping(`0${key}`, mapping);
			}
		});
	});
}

async function ensureDexie() {
	if (db) {
		return;
	}
	try {
		if (!DexieLib) {
			try {
				importScripts("/assets/posawesome/dist/js/libs/dexie.min.js?v=1");
				DexieLib = { default: Dexie };
			} catch (error) {
				DexieLib = await import("/assets/posawesome/dist/js/libs/dexie.min.js?v=1");
			}
		}
		db = new DexieLib.default("posawesome_offline");
		db.version(8).stores({
			keyval: "&key",
			queue: "&key",
			cache: "&key",
			items: "&item_code,item_name,item_group,item_code_lower,item_name_lower,item_group_lower,*barcodes,*name_keywords,*serials,*batches",
			item_prices: "&[price_list+item_code],price_list,item_code",
			customers: "&name,customer_name,mobile_no,email_id,tax_id",
		});
		await db.open();
	} catch (error) {
		console.error("scannerWorker: failed to init Dexie", error);
		db = null;
	}
}

async function lookupInDexie(code) {
	await ensureDexie();
	if (!db) {
		return [];
	}
	try {
		const record = await db.table("items").where("barcodes").equals(code).toArray();
		const matches = [];
		record.forEach((item) => {
			indexItemRecord(item);
			const mapping = barcodeCache.get(code);
			if (mapping) {
				matches.push(...mapping);
			}
		});
		return matches;
	} catch (error) {
		console.error("scannerWorker: Dexie lookup failed", error);
		return [];
	}
}

function greedyNumericCandidates(raw) {
	const digitsOnly = /^\d+$/.test(raw) ? raw : raw.replace(/\D+/g, "");
	if (!digitsOnly) {
		return [];
	}
	const lengths = [14, 13, 12, 8];
	const candidates = [];
	lengths.forEach((len) => {
		if (digitsOnly.length >= len) {
			const candidate = digitsOnly.slice(0, len);
			let symbology = "Code-128";
			if (len === 14) symbology = "ITF-14";
			else if (len === 13) symbology = "EAN-13";
			else if (len === 12) symbology = "UPC-A";
			else if (len === 8) symbology = "EAN-8";
			candidates.push({ value: candidate, symbology, reason: "length" });
			if (len === 12 && config.normalizeUpcToEan13) {
				candidates.push({ value: `0${candidate}`, symbology: "EAN-13", reason: "normalized_upc" });
			}
		}
	});
	return candidates;
}

function parseGs1Segments(raw) {
	const segments = [];
	if (!raw || typeof raw !== "string") {
		return segments;
	}
	const sanitized = raw.replace(/\u001d/g, "");
	const regex = /\((\d{2,4})\)([^()]*)/g;
	let match;
	while ((match = regex.exec(sanitized))) {
		segments.push({ ai: match[1], data: match[2] });
	}
	return segments;
}

function generateCandidates(frame) {
	const candidates = [];
	const seen = new Set();
	const primary = normalizeKey(frame.code || frame.raw);
	if (!primary) {
		return { candidates, segments: [] };
	}
	const push = (candidate) => {
		const key = normalizeKey(candidate.value);
		if (!key || seen.has(key)) {
			return;
		}
		seen.add(key);
		candidates.push({ ...candidate, value: key });
	};

	push({
		value: primary,
		symbology: frame.meta?.symbology || "unknown",
		reason: frame.meta?.reason || "direct",
	});
	greedyNumericCandidates(primary).forEach((candidate) => push(candidate));

	const segments = parseGs1Segments(frame.raw || frame.code || "");
	segments.forEach((segment) => {
		if (segment.ai === "01" || segment.ai === "02") {
			push({ value: segment.data.slice(0, 14), symbology: "GS1-128", reason: `AI${segment.ai}` });
		}
	});

	return { candidates, segments };
}

async function resolveCandidate(candidate) {
	const key = normalizeKey(candidate.value);
	if (!key) {
		return [];
	}
	let mappings = barcodeCache.get(key);
	if (!mappings) {
		mappings = await lookupInDexie(key);
	}
	if (!mappings || !mappings.length) {
		return [];
	}
	return mappings.map((mapping) => ({
		...mapping,
		candidate,
	}));
}

async function processFrame(frame) {
	const { candidates, segments } = generateCandidates(frame);
	const resolved = [];
	for (const candidate of candidates) {
		// eslint-disable-next-line no-await-in-loop
		const matches = await resolveCandidate(candidate);
		matches.forEach((match) => {
			resolved.push({
				item_code: match.item_code,
				item_name: match.item_name,
				uom: match.uom,
				conversion_factor: match.conversion_factor,
				source: match.source,
				priority: match.priority,
				price_list_rate: match.price_list_rate,
				rate: match.rate,
				currency: match.currency,
				candidate,
				item: match.item,
			});
		});
	}

	resolved.sort((a, b) => (b.priority || 0) - (a.priority || 0));

	return {
		frameId: frame.id,
		input: frame.code,
		candidates,
		segments,
		resolved,
	};
}

function applyConfig(update = {}) {
	config = { ...config, ...update };
}

self.onmessage = async (event) => {
	const data = event.data || {};
	if (data.type === "configure") {
		applyConfig(data.config || {});
		return;
	}
	if (data.type === "seed") {
		const items = Array.isArray(data.items) ? data.items : [];
		items.forEach((item) => indexItemRecord(item));
		return;
	}
	if (data.type === "clear") {
		barcodeCache.clear();
		return;
	}
	if (data.type === "parse") {
		const frame = data.frame || {};
		if (data.config) {
			applyConfig(data.config);
		}
		try {
			const result = await processFrame(frame);
			self.postMessage({ type: "resolved", frameId: frame.id, result });
		} catch (error) {
			console.error("scannerWorker: frame processing failed", error);
			self.postMessage({
				type: "resolved",
				frameId: frame.id,
				error: error.message,
				result: { frameId: frame.id, input: frame.code, candidates: [], segments: [], resolved: [] },
			});
		}
	}
};
