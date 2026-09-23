import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/services/api", () => ({
	default: {
		callEnvelope: vi.fn(),
	},
	unwrapApiResult: (result: any) => (result?.ok ? result.data : result),
}));

import api from "../src/posapp/services/api";
import invoiceService from "../src/posapp/services/invoiceService";

describe("invoiceService exchange recovery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("looks up a completed exchange by its stable client request id", async () => {
		(api.callEnvelope as any).mockResolvedValue({
			ok: true,
			data: {
				exchange_reference: "POS-EXCH-00001",
				exchange_status: "Completed",
				replacement_invoice: "SINV-NEW",
			},
			error: null,
			requestId: "api-request-1",
			serverTime: null,
		});

		const result = await invoiceService.getExchangeByRequestId(
			"exchange-request-1",
			{ name: "Main POS" } as any,
		);

		expect(api.callEnvelope).toHaveBeenCalledWith(
			"posawesome.posawesome.api.exchange.get_item_exchange",
			{
				client_request_id: "exchange-request-1",
				pos_profile: "Main POS",
			},
		);
		expect(result).toMatchObject({
			exchange_status: "Completed",
			replacement_invoice: "SINV-NEW",
		});
	});
});
