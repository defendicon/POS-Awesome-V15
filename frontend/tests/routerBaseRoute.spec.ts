import { describe, expect, it } from "vitest";
import { routes } from "../src/posapp/router";

describe("POS router base route", () => {
	it("redirects the base path to the POS shell route", () => {
		const baseRoute = routes.find((route) => route.path === "/");

		expect(baseRoute).toBeDefined();
		expect(baseRoute?.redirect).toBe("/pos");
	});
});
