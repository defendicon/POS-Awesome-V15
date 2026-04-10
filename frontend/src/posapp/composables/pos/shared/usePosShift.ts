import { getCurrentInstance, inject } from "vue";

import { clearOpeningStorage, getOpeningStorage } from "../../../../offline/index";
import { createClosePosSession } from "../../../domain/session/closePosSession";
import { useToastStore } from "../../../stores/toastStore.js";
import { useUIStore } from "../../../stores/uiStore.js";

export function usePosShift(
	options: {
		onSessionClosed?: () => void | Promise<void>;
	} = {},
) {
	const instance = getCurrentInstance();
	const proxy: any = instance?.proxy;
	const eventBus: any = proxy?.eventBus || inject("eventBus");
	const toastStore = useToastStore();
	const uiStore = useUIStore();

	const closePosSession = createClosePosSession({
		getCurrentOpeningShift: () =>
			uiStore.posOpeningShift ||
			(getOpeningStorage() as any)?.pos_opening_shift ||
			null,
		openClosingDialog: (closingShift) => {
			eventBus?.emit("open_ClosingDialog", closingShift);
		},
		clearSession: () => {
			uiStore.clearRegisterData();
			clearOpeningStorage();
		},
		showToast: (payload) => toastStore.show(payload),
		onSessionClosed: options.onSessionClosed,
		translate: (value) =>
			typeof window !== "undefined" && window.__ ? window.__(value) : value,
	});

	return {
		get_closing_data: closePosSession.getClosingData,
		submit_closing_pos: closePosSession.submitClosingPos,
	};
}
