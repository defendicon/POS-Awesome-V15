import type { Ref } from "vue";

export function resetNewItemDialogState(
	scannedBarcode: Ref<string>,
	awaitingScan: Ref<boolean>,
) {
	scannedBarcode.value = "";
	awaitingScan.value = false;
}
