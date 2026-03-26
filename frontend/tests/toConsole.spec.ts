import { describe, expect, it, vi } from "vitest";
import { registerConsoleBridge } from "../src/toConsole";

describe("registerConsoleBridge", () => {
	it("skips registration when realtime is unavailable", () => {
		expect(
			registerConsoleBridge({
				realtime: null,
				logger: vi.fn(),
			}),
		).toBe(false);
	});

	it("registers the console bridge when realtime is available", () => {
		const on = vi.fn();
		const logger = vi.fn();

		expect(
			registerConsoleBridge({
				realtime: { on },
				logger,
			}),
		).toBe(true);
		expect(on).toHaveBeenCalledTimes(1);
		expect(on).toHaveBeenCalledWith("toconsole", expect.any(Function));

		const handler = on.mock.calls[0][1];
		handler(["a", "b"]);
		expect(logger).toHaveBeenCalledTimes(2);
		expect(logger).toHaveBeenNthCalledWith(1, "a");
		expect(logger).toHaveBeenNthCalledWith(2, "b");
	});
});
