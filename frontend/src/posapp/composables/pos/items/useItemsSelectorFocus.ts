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

	const resolveFocusableElement = (candidate: any): any => {
		if (!candidate) return null;
		if (typeof candidate.focus === "function") return candidate;

		if (candidate?.$el) {
			const input = candidate.$el.querySelector?.("input, textarea");
			if (input && typeof input.focus === "function") return input;
		}

		const inner = candidate?.value;
		if (inner) {
			if (typeof inner.focus === "function") return inner;
			if (inner?.$el) {
				const input = inner.$el.querySelector?.("input, textarea");
				if (input && typeof input.focus === "function") return input;
			}
		}

		return null;
	};

	const getSearchInputField = () => {
		const vm = getVm();
		if (!vm) return null;
		// Benchmark: use exposed ref to avoid DOM querying for focus/blur actions.
		const header = vm.$refs.itemHeader;
		const inputRef = header?.debounce_search;
		return (
			resolveFocusableElement(inputRef) ||
			resolveFocusableElement(header) ||
			null
		);
	};

	const focusItemSearch = () => {
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
			const input = getSearchInputField();
			if (input && typeof input.focus === "function") {
				input.focus();
				if (typeof input.select === "function") {
					input.select();
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
