import { ref } from "vue";

const settings = ref({
	allowUserToEditRate: false,
});

export function useSettings() {
	function loadSettings() {
		try {
			const stored = localStorage.getItem("pos_settings");
			if (stored) {
				settings.value = { ...settings.value, ...JSON.parse(stored) };
			}
		} catch (e) {
			console.error("Failed to load local settings", e);
		}
	}

	function saveSettings() {
		try {
			localStorage.setItem("pos_settings", JSON.stringify(settings.value));
		} catch (e) {
			console.error("Failed to save local settings", e);
		}
	}

	function updateSetting(key, value) {
		settings.value[key] = value;
		saveSettings();
	}

	return {
		settings,
		loadSettings,
		saveSettings,
		updateSetting,
	};
}
