import { describe, expect, it } from "vitest";
import { routes } from "../src/posapp/router";

describe("POS router base route", () => {
	it("serves the POS shell directly from the base path", () => {
		const baseRoute = routes.find((route) => route.path === "/");

		expect(baseRoute).toBeDefined();
		expect(baseRoute?.redirect).toBeUndefined();
		expect(baseRoute?.alias).toBe("/pos");
		expect(typeof baseRoute?.component).toBe("function");
	});
});
