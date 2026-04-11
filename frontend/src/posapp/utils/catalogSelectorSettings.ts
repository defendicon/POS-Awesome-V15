const SETTINGS_KEY = "posawesome_item_selector_settings";

/**
 * Interface for item selector settings.
 */
export interface ItemSelectorSettings {
    display_mode?: "list" | "card";
    show_images?: boolean;
    [key: string]: any;
}

/**
 * Loads item selector settings from localStorage.
 */
export const loadItemSelectorSettings = (): ItemSelectorSettings | null => {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (!saved) {
            return null;
        }
        const parsed = JSON.parse(saved);
        return parsed && typeof parsed === "object" ? (parsed as ItemSelectorSettings) : null;
    } catch (error) {
        console.error("Failed to load item selector settings:", error);
        return null;
    }
};

/**
 * Saves item selector settings to localStorage.
 */
export const saveItemSelectorSettings = (settings: ItemSelectorSettings): boolean => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        return true;
    } catch (error) {
        console.error("Failed to save item selector settings:", error);
        return false;
    }
};
