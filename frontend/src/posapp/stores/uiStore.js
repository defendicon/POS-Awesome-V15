import { defineStore } from "pinia";
import { ref } from "vue";

export const useUIStore = defineStore("ui", () => {
	// Loading Overlay State
	const isLoading = ref(false);
	const loadingText = ref("Loading...");

	// Freeze Dialog State (Blocking UI)
	const isFrozen = ref(false);
	const freezeTitle = ref("");
	const freezeMessage = ref("");

	function setLoading(active, text = "Loading...") {
		isLoading.value = active;
		loadingText.value = text;
	}

	function freeze(title, message) {
		freezeTitle.value = title || "Processing";
		freezeMessage.value = message || "Please wait...";
		isFrozen.value = true;
	}

	function unfreeze() {
		isFrozen.value = false;
		freezeTitle.value = "";
		freezeMessage.value = "";
	}

	return {
		isLoading,
		loadingText,
		isFrozen,
		freezeTitle,
		freezeMessage,
		setLoading,
		freeze,
		unfreeze,
	};
});
