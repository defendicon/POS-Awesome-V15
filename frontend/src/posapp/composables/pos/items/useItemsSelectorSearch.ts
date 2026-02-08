import _ from "lodash";
import { shouldReloadOnSearchClear } from "../../../utils/searchUtils.js";
import { isOffline } from "../../../../offline/index";

declare const flt: (_value: unknown) => number;

type SearchDeps = {
	getVM?: () => any;
	scannerInput?: any;
	itemSelection?: any;
};

export const useItemsSelectorSearch = ({
	getVM,
	scannerInput,
	itemSelection,
}: SearchDeps) => {
	const getVm = (): any => (typeof getVM === "function" ? getVM() : null);

	const get_search = (first_search: string) => {
		if (!first_search) return "";
		const prefix = scannerInput.getScaleBarcodePrefix();
		const prefix_len = prefix.length;
		if (!scannerInput.scaleBarcodeMatches(first_search)) {
			return first_search;
		}
		// Calculate item code length from total barcode length
		const item_code_len = first_search.length - prefix_len - 6;
		return first_search.substr(0, prefix_len + item_code_len);
	};

	const get_item_qty = (first_search: string) => {
		const vm = getVm();
		if (!vm) return 1;
		const qtyVal = vm.qty != null ? vm.qty : 1;
		let scal_qty: number | string = Math.abs(qtyVal);
		const prefix = scannerInput.getScaleBarcodePrefix();
		const prefix_len = prefix.length;

		if (scannerInput.scaleBarcodeMatches(first_search)) {
			// Determine item code length dynamically based on EAN-13 structure:
			// prefix + item_code + 5 qty digits + 1 check digit
			const item_code_len = first_search.length - prefix_len - 6;
			let pesokg1 = first_search.substr(prefix_len + item_code_len, 5);
			let pesokg;
			if (pesokg1.startsWith("0000")) {
				pesokg = "0.00" + pesokg1.substr(4);
			} else if (pesokg1.startsWith("000")) {
				pesokg = "0.0" + pesokg1.substr(3);
			} else if (pesokg1.startsWith("00")) {
				pesokg = "0." + pesokg1.substr(2);
			} else if (pesokg1.startsWith("0")) {
				pesokg =
					pesokg1.substr(1, 1) +
					"." +
					pesokg1.substr(2, pesokg1.length);
			} else if (!pesokg1.startsWith("0")) {
				pesokg =
					pesokg1.substr(0, 2) +
					"." +
					pesokg1.substr(2, pesokg1.length);
			}
			scal_qty = pesokg;
		}
		if (vm.hide_qty_decimals) {
			scal_qty = Math.trunc(Number(scal_qty));
		}
		return scal_qty;
	};

	const enter_event = async (scannedCode?: string) => {
		const vm = getVm();
		if (!vm) return;

		const searchTerm = scannedCode || vm.first_search;
		await scannerInput.ensureScaleBarcodeSettings();
		if (!vm.displayedItems.length || !searchTerm) {
			return;
		}

		// Derive the searchable code and detect scale barcode
		const search = get_search(searchTerm);
		const isScaleBarcode = scannerInput.scaleBarcodeMatches(searchTerm);
		vm.search = search;

		const qty = Number(get_item_qty(searchTerm));
		const new_item = { ...vm.displayedItems[0] };
		new_item.qty = flt(qty);
		if (isScaleBarcode) {
			new_item._barcode_qty = true;
		}

		let match = false;
		if (Array.isArray(new_item.item_barcode)) {
			new_item.item_barcode.forEach((element) => {
				if (search === element.barcode) {
					new_item.uom = element.posa_uom;
					match = true;
				}
			});
		}
		if (!match && new_item.barcode === search) {
			match = true;
		}
		if (!match && Array.isArray(new_item.barcodes)) {
			match = new_item.barcodes.some((bc) => String(bc) === search);
		}

		if (vm.flags && vm.flags.serial_no) {
			new_item.to_set_serial_no = vm.flags.serial_no;
		}
		if (vm.flags && vm.flags.batch_no) {
			new_item.to_set_batch_no = vm.flags.batch_no;
		}

		if (match) {
			const fromScanner = vm.search_from_scanner;
			if (fromScanner) {
				vm.awaitingScanResult = true;
			}

			try {
				await vm.add_item(new_item, { suppressNegativeWarning: true });
				if (fromScanner) {
					scannerInput.playScanTone("success");
					vm.scannerLocked = false;
					vm.pendingScanCode = "";
				}
			} finally {
				if (fromScanner) {
					vm.awaitingScanResult = false;
				}
			}

			if (vm.flags) {
				vm.flags.serial_no = null;
				vm.flags.batch_no = null;
			}
			vm.qty = 1;

			if (fromScanner) {
				vm.search_from_scanner = false;
			}

			if (!vm.scanErrorDialog) {
				// Clear search field after successfully adding an item
				vm.clearSearch();
				vm.focusItemSearch();
			}
		}
	};

	const _performSearch = async () => {
		const vm = getVm();
		if (!vm) return;

		vm.itemDetailFetcher.cancelItemDetailsRequest();

		// Determine the actual query string and trim whitespace
		const trimmedQuery = (vm.first_search || "").trim();

		// Keep first_search in sync with the value we are about to search for
		vm.first_search = trimmedQuery;

		// If the input is a numeric string 12 characters or longer, treat it as a barcode
		if (/^\d{12,}$/.test(trimmedQuery)) {
			if (typeof vm.onBarcodeScanned === "function") {
				vm.onBarcodeScanned(trimmedQuery);
			} else if (scannerInput.onBarcodeScanned) {
				scannerInput.onBarcodeScanned(trimmedQuery);
			}
			return;
		}

		// Require a minimum of three characters before running a search
		if (!trimmedQuery || trimmedQuery.length < 3) {
			vm.search_from_scanner = false;
			return;
		}

		// If background loading is in progress, defer the search without changing the active query
		if (vm.isBackgroundLoading) {
			vm.pendingItemSearch = trimmedQuery;
			return;
		}

		vm.search = trimmedQuery;

		const fromScanner = vm.search_from_scanner;

		if (vm.usesLimitSearch) {
			const shouldForceServer =
				!vm.pos_profile.posa_local_storage ||
				!vm.storageAvailable ||
				!isOffline();
			await vm.get_items(shouldForceServer);
		} else if (vm.pos_profile && vm.pos_profile.posa_local_storage) {
			if (vm.storageAvailable) {
				await vm.loadVisibleItems(true);
				vm.enter_event();
			} else {
				vm.get_items(true);
			}
		} else {
			// When local storage is disabled, always fetch items
			// from the server so searches aren't limited to the
			// initially loaded set.
			await vm.get_items(true);
			vm.enter_event();

			if (vm.displayedItems && vm.displayedItems.length > 0) {
				setTimeout(() => {
					vm.itemDetailFetcher.update_items_details(
						vm.displayedItems,
					);
				}, 300);
			}
		}

		// Clear the input only when triggered via scanner
		if (fromScanner) {
			vm.clearSearch();
			vm.focusItemSearch();
			vm.search_from_scanner = false;
		}
	};

	const search_onchange = _.debounce(() => {
		_performSearch();
	}, 300);

	const onEnter = (event?: KeyboardEvent) => {
		const vm = getVm();
		if (!vm) return;

		if ((itemSelection || vm.itemSelection).highlightedIndex >= 0) {
			if (event && typeof event.preventDefault === "function") {
				event.preventDefault();
			}
			(itemSelection || vm.itemSelection).selectHighlightedItem();
			return;
		}
		if (search_onchange.cancel) {
			search_onchange.cancel();
		}
		_performSearch();
	};

	const clearSearch = () => {
		const vm = getVm();
		if (!vm) return;

		if (scannerInput.resetKeyboardScanDetection) {
			scannerInput.resetKeyboardScanDetection();
		} else if (typeof vm.resetKeyboardScanDetection === "function") {
			vm.resetKeyboardScanDetection();
		}
		if (vm.clearingSearch) {
			return;
		}

		const shouldReload = shouldReloadOnSearchClear({
			currentSearch: vm.first_search,
			previousSearch: vm.search,
			itemsLoaded: vm.itemsLoaded,
			itemsCount: vm.items.length,
		});

		vm.search_backup = vm.first_search;
		vm.clearingSearch = true;
		vm.search_input = "";
		vm.first_search = "";
		vm.search = "";

		const release = () => {
			vm.$nextTick(() => {
				vm.clearingSearch = false;
			});
		};

		if (vm.usesLimitSearch) {
			const preservedItems =
				vm.clearLimitSearchResults({ preserveItems: true }) ||
				vm.items ||
				[];
			vm.resetBarcodeIndex();

			if (Array.isArray(preservedItems) && preservedItems.length) {
				vm.eventBus.emit("set_all_items", preservedItems);
			} else if (Array.isArray(vm.items) && vm.items.length) {
				vm.eventBus.emit("set_all_items", vm.items);
			}

			if (shouldReload) {
				vm.eventBus.emit("data-load-progress", {
					name: "items",
					progress: 0,
				});
				const reloadPromise = vm.get_items(true);
				if (
					reloadPromise &&
					typeof reloadPromise.finally === "function"
				) {
					reloadPromise.finally(release);
					return reloadPromise;
				}
			}

			release();
			return;
		}

		if (!shouldReload) {
			release();
			return;
		}

		if (vm.pos_profile?.posa_local_storage && vm.storageAvailable) {
			vm.loadVisibleItems(true);
			if (!vm.isBackgroundLoading) {
				vm.verifyServerItemCount();
			}
			release();
			return;
		}

		if (vm.isBackgroundLoading) {
			if (vm.pendingGetItems) {
				vm.pendingGetItems.force_server =
					vm.pendingGetItems.force_server || false;
			} else {
				vm.pendingGetItems = { force_server: false };
			}
			release();
			return;
		}

		if (!vm.itemsLoaded || !vm.items.length) {
			vm.get_items(true);
		} else {
			vm.eventBus.emit("set_all_items", vm.items);
		}

		release();
	};

	const restoreSearch = () => {
		const vm = getVm();
		if (!vm) return;
		if (vm.first_search === "") {
			vm.first_search = vm.search_backup;
			vm.search = vm.search_backup;
			// No need to reload items when focus is lost
		}
	};

	const handleItemSearchFocus = () => {
		const vm = getVm();
		if (!vm) return;
		vm.search_input = "";
	};

	return {
		enter_event,
		onEnter,
		search_onchange,
		_performSearch,
		get_item_qty,
		get_search,
		clearSearch,
		restoreSearch,
		handleItemSearchFocus,
	};
};
