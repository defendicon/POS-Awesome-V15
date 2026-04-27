import { ref, type Ref } from "vue";

import { resetNewItemDialogState } from "../../../components/pos/items/newItemDialogState";

type UseItemsSelectorScannerBridgeArgs = {
	cameraScannerActive: Ref<boolean>;
	startCameraScanning: () => void;
	requestForegroundItemSearchFocus: () => void;
	onBarcodeScannedFromScannerInput?: ((_code: string) => void) | null;
	reloadItems: () => Promise<unknown> | unknown;
};

export function useItemsSelectorScannerBridge({
	cameraScannerActive,
	startCameraScanning,
	requestForegroundItemSearchFocus,
	onBarcodeScannedFromScannerInput,
	reloadItems,
}: UseItemsSelectorScannerBridgeArgs) {
	const newItemDialog = ref(false);
	const newItemDialogScannedBarcode = ref("");
	const newItemDialogAwaitingScan = ref(false);

	const openNewItemDialog = () => {
		resetNewItemDialogState(newItemDialogScannedBarcode, newItemDialogAwaitingScan);
		newItemDialog.value = true;
	};

	const startNewItemBarcodeScan = () => {
		newItemDialogScannedBarcode.value = "";
		newItemDialogAwaitingScan.value = true;
		startCameraScanning();
	};

	const onBarcodeScanned = async (code: string) => {
		if (newItemDialog.value && newItemDialogAwaitingScan.value) {
			newItemDialogScannedBarcode.value = code;
			newItemDialogAwaitingScan.value = false;
			return;
		}

		requestForegroundItemSearchFocus();
		onBarcodeScannedFromScannerInput?.(code);
	};

	const onScannerOpened = () => {
		cameraScannerActive.value = true;
	};

	const onScannerClosed = () => {
		cameraScannerActive.value = false;
		newItemDialogAwaitingScan.value = false;
	};

	const handleItemCreated = (_item: unknown) => {
		newItemDialog.value = false;
		resetNewItemDialogState(newItemDialogScannedBarcode, newItemDialogAwaitingScan);
		void reloadItems();
	};

	return {
		newItemDialog,
		newItemDialogScannedBarcode,
		newItemDialogAwaitingScan,
		openNewItemDialog,
		startNewItemBarcodeScan,
		onBarcodeScanned,
		onScannerOpened,
		onScannerClosed,
		handleItemCreated,
	};
}
