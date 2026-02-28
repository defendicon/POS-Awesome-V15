type FocusDependencies = {
	getVM?: () => any;
	scannerInput?: any;
	itemSelection?: any;
};

export const useItemsSelectorFocus = ({
	getVM,
	scannerInput,
	itemSelection,
}: FocusDependencies) => {
	const getVm = (): any => (typeof getVM === "function" ? getVM() : null);

	const getSearchInputField = () => {
		const vm = getVm();
		if (!vm) return null;
		// Benchmark: use exposed ref to avoid DOM querying for focus/blur actions.
		const header = vm.$refs.itemHeader;
		const inputRef = header?.debounce_search;
		return inputRef?.value ?? inputRef ?? null;
	};

	const getFocusableTarget = () => {
		const input = getSearchInputField();
		if (!input) return null;
		const nestedInput = input?.$el?.querySelector?.("input");
		return nestedInput ?? input;
	};

	const isElementHiddenFromInteraction = (element: Element | null) => {
		let current: Element | null = element;
		while (current) {
			if (current.getAttribute?.("aria-hidden") === "true") {
				return true;
			}
			if ((current as HTMLElement).inert) {
				return true;
			}
			if (typeof window !== "undefined") {
				const style = window.getComputedStyle(current as HTMLElement);
				if (style.display === "none" || style.visibility === "hidden") {
					return true;
				}
			}
			current = current.parentElement;
		}
		return false;
	};

	const releaseInaccessibleFocus = () => {
		if (typeof document === "undefined") {
			return;
		}
		const active = document.activeElement;
		if (!(active instanceof HTMLElement) || active === document.body) {
			return;
		}
		if (isElementHiddenFromInteraction(active)) {
			active.blur();
		}
	};

	const scheduleFocusAttempt = (attempt: number) => {
		if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
			window.requestAnimationFrame(() => {
				focusItemSearch(attempt + 1);
			});
			return;
		}
		setTimeout(() => {
			focusItemSearch(attempt + 1);
		}, 16);
	};

	const focusItemSearch = (attempt = 0) => {
		const vm = getVm();
		if (!vm || vm.cameraScannerActive) {
			return;
		}
		vm.$nextTick(() => {
			if (vm.cameraScannerActive) {
				return;
			}
			if (vm.showManualScanInput) {
				vm.queueManualScanFocus();
				return;
			}
			releaseInaccessibleFocus();
			const input = getFocusableTarget();
			if (input && typeof input.focus === "function") {
				input.focus();
				if (
					typeof document !== "undefined" &&
					document.activeElement !== input &&
					attempt < 3
				) {
					scheduleFocusAttempt(attempt);
				}
			}
		});
	};

	const blurItemSearch = () => {
		const input = getSearchInputField();
		if (input && typeof input.blur === "function") {
			input.blur();
		}
	};

	const clearQty = () => {
		const vm = getVm();
		if (!vm) return;
		vm.qty = null;
	};

	const onScannerOpened = () => {
		const vm = getVm();
		if (!vm) return;
		vm.cameraScannerActive = true;
		blurItemSearch();
	};

	const onScannerClosed = () => {
		const vm = getVm();
		if (!vm) return;
		vm.cameraScannerActive = false;
		focusItemSearch();
	};

	const startCameraScanning = () => {
		const vm = getVm();
		if (!vm) return;
		if (vm.scannerLocked) {
			if (typeof vm.playScanTone === "function") {
				vm.playScanTone("error");
			} else if (scannerInput.playScanTone) {
				scannerInput.playScanTone("error");
			}
			return;
		}
		if (vm.$refs.cameraScanner) {
			vm.$refs.cameraScanner.startScanning();
		}
	};

	const handleSearchPaste = (event: ClipboardEvent) => {
		if (scannerInput.handleSearchPaste) {
			scannerInput.handleSearchPaste(event);
		}
	};

	const handleSearchInput = (_event: Event) => {
		// Handled by composable
	};

	const handleSearchKeydown = (event: KeyboardEvent) => {
		const vm = getVm();
		if (!vm || !event) return;
		if ((itemSelection || vm.itemSelection).handleSearchKeydown(event)) {
			return;
		}

		// Delegate other keys to scanner
		const handled = scannerInput.handleSearchKeydown
			? scannerInput.handleSearchKeydown(event)
			: false;
		if (handled) return;
	};

	return {
		getSearchInputField,
		focusItemSearch,
		blurItemSearch,
		clearQty,
		onScannerOpened,
		onScannerClosed,
		startCameraScanning,
		handleSearchPaste,
		handleSearchInput,
		handleSearchKeydown,
	};
};
