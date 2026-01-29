const SETTINGS_KEY = "posawesome_item_selector_settings";

export const loadItemSelectorSettings = () => {
	try {
		const saved = localStorage.getItem(SETTINGS_KEY);
		if (!saved) {
			return null;
		}
		const parsed = JSON.parse(saved);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch (error) {
		console.error("Failed to load item selector settings:", error);
		return null;
	}
};

export const saveItemSelectorSettings = (settings) => {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		return true;
	} catch (error) {
		console.error("Failed to save item selector settings:", error);
		return false;
	}
};
