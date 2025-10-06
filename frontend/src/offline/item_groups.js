import { memory } from "./cache.js";
import { persist } from "./core.js";

export function saveItemGroups(groups) {
	try {
		let clean;
		try {
			clean =
				typeof structuredClone === "function"
					? structuredClone(groups)
					: JSON.parse(JSON.stringify(groups));
		} catch (e) {
			console.error("Failed to serialize item groups", e);
			clean = [];
		}
		memory.item_groups_cache = clean;
		persist("item_groups_cache", memory.item_groups_cache);
	} catch (e) {
		console.error("Failed to cache item groups", e);
	}
}

export function getCachedItemGroups() {
	try {
		return memory.item_groups_cache || [];
	} catch (e) {
		console.error("Failed to get cached item groups", e);
		return [];
	}
}

export function clearItemGroups() {
	try {
		memory.item_groups_cache = [];
		persist("item_groups_cache", memory.item_groups_cache);
	} catch (e) {
		console.error("Failed to clear item groups cache", e);
	}
}
