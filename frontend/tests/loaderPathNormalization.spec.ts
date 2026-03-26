import { describe, expect, it } from "vitest";
import {
	isPosAppPath,
	resolvePosAppNormalizedPath,
} from "../src/loader-utils";

describe("resolvePosAppNormalizedPath", () => {
	it("does not rewrite canonical base path", () => {
		expect(resolvePosAppNormalizedPath("/app/posapp")).toBeNull();
	});

	it("rewrites trailing slash path", () => {
		expect(resolvePosAppNormalizedPath("/app/posapp/")).toBe("/app/posapp");
	});

	it("rewrites deep POS route path", () => {
		expect(resolvePosAppNormalizedPath("/app/posapp/pos")).toBe("/app/posapp");
	});

	it("does not rewrite non-posapp path", () => {
		expect(resolvePosAppNormalizedPath("/app/sales-order")).toBeNull();
	});

	it("only boots on the POS route family", () => {
		expect(isPosAppPath("/app/posapp")).toBe(true);
		expect(isPosAppPath("/app/posapp/pos")).toBe(true);
		expect(isPosAppPath("/app")).toBe(false);
		expect(isPosAppPath("/app/sales-order")).toBe(false);
	});

	it("matches path case-insensitively", () => {
		expect(resolvePosAppNormalizedPath("/APP/POSAPP/pos")).toBe("/app/posapp");
	});

	it("normalizes trailing slash in basePath before comparison", () => {
		expect(
			resolvePosAppNormalizedPath("/app/posapp/pos", "/app/posapp/"),
		).toBe("/app/posapp");
	});
});
