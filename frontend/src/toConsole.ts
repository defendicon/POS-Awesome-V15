declare const $: any;
declare const frappe: any;

type ConsoleBridgeOptions = {
	realtime?: { on?: (_event: string, _handler: (_payload: unknown[]) => void) => void } | null;
	logger?: (_value: unknown) => void;
};

export function registerConsoleBridge(
	options: ConsoleBridgeOptions = {},
): boolean {
	const realtime =
		options.realtime ??
		(typeof frappe !== "undefined" ? frappe?.realtime : null);
	const logger = options.logger || console.log;

	if (!realtime || typeof realtime.on !== "function") {
		return false;
	}

	realtime.on("toconsole", function (data: unknown[]) {
		if (!Array.isArray(data)) {
			return;
		}

		data.forEach((element) => {
			logger(element);
		});
	});

	return true;
}

if (typeof $ === "function") {
	$(function () {
		registerConsoleBridge();
	});
} else {
	registerConsoleBridge();
}
