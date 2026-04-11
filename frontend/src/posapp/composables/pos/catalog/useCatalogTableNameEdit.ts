import { ref } from "vue";
import type { CartItem } from "../../../types/models";

export function useItemsTableNameEdit() {
	const editNameDialog = ref(false);
	const editNameTarget = ref<CartItem | null>(null);
	const editedName = ref("");

	const openNameDialog = (item: CartItem) => {
		editNameTarget.value = item;
		editedName.value = item.item_name;
		editNameDialog.value = true;
	};

	const saveItemName = () => {
		if (editNameTarget.value && editedName.value) {
			editNameTarget.value.item_name = editedName.value.trim();
			editNameTarget.value.name_overridden = true;
			editNameDialog.value = false;
		}
	};

	const resetItemName = (item: CartItem) => {
		if (item && item.raw_item_name) {
			item.item_name = item.raw_item_name;
			item.name_overridden = false;
			editNameDialog.value = false;
		}
	};

	return {
		editNameDialog,
		editNameTarget,
		editedName,
		openNameDialog,
		saveItemName,
		resetItemName,
	};
}
