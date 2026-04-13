// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const qzMock = vi.hoisted(() => {
	let websocketActive = false;

	const state = {
		posProfile: { value: null as Record<string, any> | null },
		isActive: vi.fn(() => websocketActive),
		connect: vi.fn(async () => {
			websocketActive = true;
		}),
		disconnect: vi.fn(async () => {
			websocketActive = false;
		}),
		setClosedCallbacks: vi.fn(),
		findPrinters: vi.fn(async () => [] as string[]),
		setCertificatePromise: vi.fn(),
		setSignatureAlgorithm: vi.fn(),
		setSignaturePromise: vi.fn(),
		createConfig: vi.fn((printer: string, options: Record<string, any>) => ({
			printer,
			options,
		})),
		print: vi.fn(async () => undefined),
		setActive(value: boolean) {
			websocketActive = value;
		},
	};

	return state;
});

vi.mock("qz-tray", () => ({
	default: {
		websocket: {
			isActive: qzMock.isActive,
			connect: qzMock.connect,
			disconnect: qzMock.disconnect,
			setClosedCallbacks: qzMock.setClosedCallbacks,
		},
		printers: {
			find: qzMock.findPrinters,
		},
		security: {
			setCertificatePromise: qzMock.setCertificatePromise,
			setSignatureAlgorithm: qzMock.setSignatureAlgorithm,
			setSignaturePromise: qzMock.setSignaturePromise,
		},
		configs: {
			create: qzMock.createConfig,
		},
		print: qzMock.print,
	},
}));

vi.mock("../src/posapp/stores/uiStore", () => ({
	useUIStore: () => ({
		posProfile: qzMock.posProfile,
	}),
}));

describe("qzTray service", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		window.localStorage.clear();
		qzMock.setActive(false);
		qzMock.posProfile.value = null;
		qzMock.findPrinters.mockResolvedValue([]);
		(globalThis as any).frappe = {
			call: vi.fn(),
		};
	});

	it("keeps QZ disconnected until the user manually reconnects", async () => {
		const qzTray = await import("../src/platform/printing/qzTray");
		qzMock.setActive(true);

		await qzTray.disconnectQzTray();

		expect(qzMock.disconnect).toHaveBeenCalledTimes(1);

		const printersWhilePaused = await qzTray.findQzPrinters();

		expect(printersWhilePaused).toEqual([]);
		expect(qzMock.connect).not.toHaveBeenCalled();

		await expect(qzTray.printHtmlViaQz("<p>Receipt</p>")).rejects.toThrow(
			"manually disconnected",
		);
		expect(qzMock.connect).not.toHaveBeenCalled();

		qzMock.findPrinters.mockResolvedValue(["Receipt Printer"]);

		await expect(
			qzTray.connectQzTray({ userInitiated: true }),
		).resolves.toBe(true);

		expect(qzMock.connect).toHaveBeenCalledTimes(1);

		const printersAfterReconnect = await qzTray.findQzPrinters();

		expect(printersAfterReconnect).toEqual(["Receipt Printer"]);
	});

	it("uses the POS Profile default printer until this browser saves a manual override", async () => {
		qzMock.posProfile.value = {
			posa_qz_printer_name: "Profile Printer",
		};
		qzMock.setActive(true);
		qzMock.findPrinters.mockResolvedValue([
			"Profile Printer",
			"Counter Printer",
		]);

		const qzTray = await import("../src/platform/printing/qzTray");

		await qzTray.findQzPrinters();

		expect(qzTray.selectedQzPrinter.value).toBe("Profile Printer");
		expect(window.localStorage.getItem("posa_qz_printer_name")).toBeNull();

		qzTray.setSelectedQzPrinter("Counter Printer");
		expect(window.localStorage.getItem("posa_qz_printer_name")).toBe(
			"Counter Printer",
		);

		await qzTray.findQzPrinters();
		expect(qzTray.selectedQzPrinter.value).toBe("Counter Printer");

		qzTray.setSelectedQzPrinter("");
		expect(window.localStorage.getItem("posa_qz_printer_name")).toBeNull();

		await qzTray.findQzPrinters();
		expect(qzTray.selectedQzPrinter.value).toBe("Profile Printer");
	});

	it("falls back to the first discovered printer when no override or profile default exists", async () => {
		qzMock.setActive(true);
		qzMock.findPrinters.mockResolvedValue(["Printer A", "Printer B"]);

		const qzTray = await import("../src/platform/printing/qzTray");

		await qzTray.findQzPrinters();

		expect(qzTray.selectedQzPrinter.value).toBe("Printer A");
	});
});
