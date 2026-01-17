import { ref, onMounted, onBeforeUnmount } from "vue";

// Singleton state
const isOnline = ref(navigator.onLine);
const listenersAttached = ref(false);

export function useOnlineStatus() {
    if (!listenersAttached.value) {
        window.addEventListener("online", () => {
            isOnline.value = true;
        });
        window.addEventListener("offline", () => {
            isOnline.value = false;
        });
        listenersAttached.value = true;
    }

    return {
        isOnline,
    };
}
