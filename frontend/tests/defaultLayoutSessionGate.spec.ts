import { describe, expect, it, vi } from "vitest";

import { createDefaultLayoutSessionGate } from "../src/posapp/domain/session/defaultLayoutSessionGate";

describe("createDefaultLayoutSessionGate", () => {
	it("redirects to /register when no recoverable POS session exists", async () => {
		const routeToRegister = vi.fn();
		const runPosStartupFlow = vi.fn();
		const gate = createDefaultLayoutSessionGate({
			recoverSession: vi.fn(async () => ({
				status: "needs_register_setup",
				source: null,
				session: null,
				registerData: null,
				bootstrapSnapshot: null,
				warningCodes: [],
				message: "No opening shift found.",
			})),
			applyReadySession: vi.fn(),
			runPosStartupFlow,
			currentPath: () => "/pos",
			routeToRegister,
			routeToPos: vi.fn(),
		});

		await gate.start();

		expect(gate.state.value.stage).toBe("needs_register_setup");
		expect(routeToRegister).toHaveBeenCalledTimes(1);
		expect(runPosStartupFlow).not.toHaveBeenCalled();
	});

	it("continues startup and leaves /register when a POS session is ready", async () => {
		const applyReadySession = vi.fn();
		const runPosStartupFlow = vi.fn(async () => ({
			stage: "ready",
		}));
		const routeToPos = vi.fn();
		const gate = createDefaultLayoutSessionGate({
			recoverSession: vi.fn(async () => ({
				status: "ready",
				source: "cache",
				session: {
					posProfile: { name: "Main POS" } as any,
					posOpeningShift: { name: "POS-OPEN-1" },
					source: "cache",
				},
				registerData: {
					pos_profile: { name: "Main POS" },
					pos_opening_shift: { name: "POS-OPEN-1", user: "cashier@example.com" },
				},
				bootstrapSnapshot: null,
				warningCodes: [],
			})),
			applyReadySession,
			runPosStartupFlow,
			currentPath: () => "/register",
			routeToRegister: vi.fn(),
			routeToPos,
		});

		await gate.start();

		expect(gate.state.value.stage).toBe("ready");
		expect(applyReadySession).toHaveBeenCalledWith({
			pos_profile: { name: "Main POS" },
			pos_opening_shift: { name: "POS-OPEN-1", user: "cashier@example.com" },
		});
		expect(runPosStartupFlow).toHaveBeenCalledTimes(1);
		expect(routeToPos).toHaveBeenCalledTimes(1);
	});
});
