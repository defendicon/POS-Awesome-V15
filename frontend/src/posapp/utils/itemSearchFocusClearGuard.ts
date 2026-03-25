type ItemSearchFocusClearGuardOptions = {
	scheduleReset?: (_callback: () => void) => number;
	clearScheduledReset?: (_timerId: number) => void;
};

export const createItemSearchFocusClearGuard = ({
	scheduleReset = (callback) => window.setTimeout(callback, 800),
	clearScheduledReset = (timerId) => window.clearTimeout(timerId),
}: ItemSearchFocusClearGuardOptions = {}) => {
	let preserveNextFocusClear = false;
	let resetTimerId: number | null = null;

	const cancelReset = () => {
		if (resetTimerId === null) {
			return;
		}
		clearScheduledReset(resetTimerId);
		resetTimerId = null;
	};

	const armPreserveNextFocusClear = () => {
		preserveNextFocusClear = true;
		cancelReset();
		resetTimerId = scheduleReset(() => {
			preserveNextFocusClear = false;
			resetTimerId = null;
		});
	};

	const shouldClearSearchOnFocus = () => {
		if (!preserveNextFocusClear) {
			return true;
		}
		preserveNextFocusClear = false;
		cancelReset();
		return false;
	};

	const dispose = () => {
		preserveNextFocusClear = false;
		cancelReset();
	};

	return {
		armPreserveNextFocusClear,
		shouldClearSearchOnFocus,
		dispose,
	};
};
