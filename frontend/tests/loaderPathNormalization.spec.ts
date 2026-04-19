import { describe, expect, it } from "vitest";
import {
	buildPosAppRecoveryLocation,
	resolvePosAppNormalizedPath,
	resolvePosAppRouteFullPath,
} from "../src/loader-utils";

describe("resolvePosAppNormalizedPath", () => {
	it("does not rewrite canonical base path", () => {
		expect(resolvePosAppNormalizedPath("/app/posapp")).toBeNull();
	});

	it("rewrites trailing slash path", () => {
		expect(resolvePosAppNormalizedPath("/app/posapp/")).toBe("/app/posapp");
	});

	it("preserves deep POS route path", () => {
		expect(resolvePosAppNormalizedPath("/app/posapp/pos")).toBeNull();
	});

	it("does not rewrite non-posapp path", () => {
		expect(resolvePosAppNormalizedPath("/app/sales-order")).toBeNull();
	});

	it("matches path case-insensitively", () => {
		expect(resolvePosAppNormalizedPath("/APP/POSAPP/pos")).toBe(
			"/app/posapp/pos",
		);
	});

	it("normalizes trailing slash in basePath before comparison", () => {
		expect(
			resolvePosAppNormalizedPath("/app/posapp/pos", "/app/posapp/"),
		).toBeNull();
	});

	it("resolves the current router full path from a browser POS URL", () => {
		expect(
			resolvePosAppRouteFullPath({
				pathname: "/app/posapp/payments",
				search: "?draft=1",
				hash: "#summary",
			}),
		).toBe("/payments?draft=1#summary");
	});

	it("builds recovery URLs without losing the active sub-route", () => {
		expect(
			buildPosAppRecoveryLocation(
				{
					pathname: "/app/posapp/orders",
					search: "?draft=1",
					hash: "#items",
				},
				"_posa_loader_recovery",
				123,
			),
		).toBe(
			"/app/posapp/orders?draft=1&_posa_loader_recovery=123#items",
		);
	});
});
