import { db } from "./core.js";
import Dexie from "dexie/dist/dexie.mjs";

let writeChain = Promise.resolve();

export function withWriteLock(fn) {
	writeChain = writeChain
		.then(() => fn())
		.catch((e) => {
			console.error("DB operation failed", e);
		});
	return writeChain;
}

export async function getAllByCursor(store, limit = Infinity) {
	const results = [];
	try {
		await db.transaction("r", db.table(store), async () => {
			let count = 0;
			await db.table(store).each((item) => {
				results.push(item);
				count += 1;
				if (count >= limit) throw Dexie.IterationComplete;
			});
		});
	} catch (e) {
		if (e !== Dexie.IterationComplete) {
			console.error("Cursor read failed", e);
		}
	}
	return results;
}
