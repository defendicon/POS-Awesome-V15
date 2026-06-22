// Run: k6 run --vus 10 --duration 30s tests/performance/k6-load-test.js
// Requires: k6 v0.49+, POSA_SMOKE_BASE_URL, POSA_API_KEY, POSA_API_SECRET (or cookie)

import { check, group, sleep } from "k6";
import http from "k6/http";

// Environments
const BASE = __ENV.POSA_SMOKE_BASE_URL || "http://localhost:8000";
const COOKIE = __ENV.POSA_COOKIE || "";

const METHODS = [
	"posawesome.api.invoice_processing.get_items",
	"posawesome.api.invoice_processing.get_customers",
	"posawesome.api.invoice_processing.get_pricing_rules",
];

function frappePost(method: string, args: Record<string, any> = {}) {
	const url = `${BASE}/api/method/${method}`;
	const payload = JSON.stringify({ args, method });
	const params: Record<string, any> = {
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
	};
	if (COOKIE) {
		params.headers.Cookie = COOKIE;
	}
	return http.post(url, payload, params);
}

export default function () {
	group("catalog load - paginated get_items", () => {
		const pages = [0, 1, 2, 3, 4];
		for (const page of pages) {
			const res = frappePost(METHODS[0], { offset: page * 200, limit: 200 });
			check(res, {
				"status is 200": (r) => r.status === 200,
				"response time < 2000ms": (r) => r.timings.duration < 2000,
				"has message array": (r) => {
					try {
						return Array.isArray(JSON.parse(r.body as string).message);
					} catch {
						return false;
					}
				},
			});
		}
	});

	group("customer fetch", () => {
		const res = frappePost(METHODS[1], { offset: 0, limit: 1000 });
		check(res, {
			"status is 200": (r) => r.status === 200,
			"response time < 3000ms": (r) => r.timings.duration < 3000,
		});
	});

	group("pricing rules fetch", () => {
		const res = frappePost(METHODS[2], { customer: "Guest" });
		check(res, {
			"status is 200": (r) => r.status === 200,
			"response time < 2000ms": (r) => r.timings.duration < 2000,
		});
	});

	sleep(1);
}

export function setup() {
	if (!COOKIE) {
		console.warn("POSA_COOKIE not set - auth-less requests may fail");
	}
}

export function teardown() {
	console.log("k6 load test complete");
}
