const STORAGE_KEY = "posapp_suppress_notifications";

function readStoredPreference() {
        if (typeof window === "undefined") {
                return false;
        }

        try {
                const stored = window.localStorage.getItem(STORAGE_KEY);
                if (stored === null) {
                        return false;
                }

                return ["1", "true", "yes"].includes(stored.toLowerCase());
        } catch (error) {
                console.warn("Unable to read notification suppression preference", error);
                return false;
        }
}

function writeStoredPreference(enabled) {
        if (typeof window === "undefined") {
                return;
        }

        try {
                window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
        } catch (error) {
                console.warn("Unable to persist notification suppression preference", error);
        }
}

function patchShowAlert(win) {
        if (!win || win.__posShowAlertPatched) {
                return;
        }

        const showAlert = win?.frappe?.show_alert;
        if (typeof showAlert !== "function") {
                return;
        }

        const original = showAlert.bind(win.frappe);
        win.__posOriginalShowAlert = original;
        win.frappe.show_alert = (...args) => {
                if (win.__posSuppressNotifications) {
                        return Promise.resolve();
                }
                return original(...args);
        };
        win.__posShowAlertPatched = true;
}

function applyNotificationSuppression(enabled) {
        if (typeof window === "undefined") {
                return;
        }

        const win = window;
        win.__posSuppressNotifications = Boolean(enabled);
        patchShowAlert(win);

        if (!win.__posShowAlertPatched) {
                // Retry after the current call stack in case frappe.show_alert becomes available later.
                setTimeout(() => {
                        patchShowAlert(win);
                }, 0);
        }
}

export function getStoredNotificationSuppression() {
        return readStoredPreference();
}

export function storeNotificationSuppression(enabled) {
        writeStoredPreference(enabled);
}

export function setNotificationSuppression(enabled) {
        storeNotificationSuppression(enabled);
        applyNotificationSuppression(enabled);
}

export function initializeNotificationSuppression(initialEnabled) {
        applyNotificationSuppression(initialEnabled);
}

