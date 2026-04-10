import { describe, expect, it } from "vitest";

import { createPosSessionStore } from "../src/posapp/domain/session/posSessionStore";

describe("createPosSessionStore", () => {
	it("stores a ready session with profile and opening shift", () => {
		const session = createPosSessionStore();

		session.setReadySession({
			posProfile: { name: "Main POS" } as any,
			posOpeningShift: { name: "POS-OPEN-1" },
			source: "cache",
		});

		expect(session.state.value.stage).toBe("ready");
		expect(session.state.value.source).toBe("cache");
		expect(session.state.value.posProfile).toEqual({ name: "Main POS" });
		expect(session.state.value.posOpeningShift).toEqual({ name: "POS-OPEN-1" });
	});

	it("moves to needs_register_setup when no session is available", () => {
		const session = createPosSessionStore();

		session.setNeedsRegisterSetup("No opening shift found.");

		expect(session.state.value.stage).toBe("needs_register_setup");
		expect(session.state.value.message).toBe("No opening shift found.");
		expect(session.state.value.posProfile).toBeNull();
		expect(session.state.value.posOpeningShift).toBeNull();
	});
});
