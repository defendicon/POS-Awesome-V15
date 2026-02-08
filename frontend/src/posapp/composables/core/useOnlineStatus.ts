import { ref, onUnmounted, getCurrentInstance, warn } from "vue";
import type { Ref } from "vue";

// Singleton state
const isOnline: Ref<boolean> = ref(navigator.onLine);
let listenersCount = 0;

const updateOnlineStatus = () => {
	isOnline.value = navigator.onLine;
};

export function useOnlineStatus() {
	if (getCurrentInstance()) {
		if (listenersCount === 0) {
			window.addEventListener("online", updateOnlineStatus);
			window.addEventListener("offline", updateOnlineStatus);
		}
		listenersCount++;

		onUnmounted(() => {
			listenersCount = Math.max(0, listenersCount - 1);
			if (listenersCount === 0) {
				window.removeEventListener("online", updateOnlineStatus);
				window.removeEventListener("offline", updateOnlineStatus);
			}
		});
	} else {
		warn(
			"useOnlineStatus must be called inside a component's setup function.",
		);
	}

	return {
		isOnline,
	};
}
