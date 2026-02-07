import { defineStore } from "pinia";
import { ref } from "vue";

const DEFAULT_SNACK_TIMEOUT = 3000;

export interface NotificationData {
	title?: string;
	message?: string;
	color?: string;
	timeout?: number;
	summary?: string;
	detail?: string;
	text?: string;
	count?: number;
	key?: string;
}

export interface Notification extends Required<
	Pick<NotificationData, "title" | "color" | "timeout" | "count" | "key">
> {
	summary: string;
	latestDetail: string;
}

export interface HistoryEntry {
	id: string;
	title: string;
	detail: string;
	color: string;
	timestamp: number;
}

export const useToastStore = defineStore("toast", () => {
	// Snackbar State
	const visible = ref(false);
	const text = ref("");
	const color = ref("success");
	const timeout = ref(DEFAULT_SNACK_TIMEOUT);

	// Queue State
	const queue = ref<Notification[]>([]);
	const currentNotification = ref<Notification | null>(null);

	// History (Bell) State
	const history = ref<HistoryEntry[]>([]);
	const unreadCount = ref(0);

	function show(data: string | NotificationData) {
		const notification = normalizeNotification(data);
		if (!notification.title) return;

		// Add to History (Bell)
		addToHistory(notification);

		// Handle Snackbar Queue
		if (shouldThrottleNotification(notification)) return;

		if (
			currentNotification.value &&
			currentNotification.value.key === notification.key
		) {
			mergeNotifications(currentNotification.value, notification);
			updateActiveState();
			return;
		}

		const existingQueued = queue.value.find(
			(item) => item.key === notification.key,
		);
		if (existingQueued) {
			mergeNotifications(existingQueued, notification);
		} else {
			queue.value.push(notification);
		}

		if (!visible.value) {
			processNext();
		}
	}

	function processNext() {
		if (queue.value.length === 0) {
			currentNotification.value = null;
			return;
		}

		const next = queue.value.shift()!;
		currentNotification.value = next;

		text.value = formatNotificationMessage(next);
		color.value = next.color;
		timeout.value = next.timeout;
		visible.value = true;
	}

	function onSnackbarClosed() {
		visible.value = false;
		currentNotification.value = null;
		// Small delay to allow animation to finish before showing next
		setTimeout(() => {
			processNext();
		}, 300);
	}

	function addToHistory(notification: Notification) {
		const entry: HistoryEntry = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			title: notification.title,
			detail: notification.latestDetail || notification.summary,
			color: notification.color,
			timestamp: Date.now(),
		};
		history.value = [entry, ...history.value].slice(0, 20);
		unreadCount.value++;
	}

	function markRead() {
		unreadCount.value = 0;
	}

	function clearHistory() {
		history.value = [];
		unreadCount.value = 0;
	}

	function normalizeNotification(
		data: string | NotificationData = {},
	): Notification {
		// Handle simple string input
		if (typeof data === "string") {
			return normalizeNotification({ title: data });
		}

		const title =
			typeof data.title === "string"
				? data.title.trim()
				: data.message || "";
		const color = data.color || "success";
		const timeout =
			typeof data.timeout === "number" && data.timeout >= 0
				? data.timeout
				: DEFAULT_SNACK_TIMEOUT;
		const summary =
			typeof data.summary === "string" ? data.summary.trim() : "";
		const detail =
			typeof data.detail === "string"
				? data.detail.trim()
				: data.text || "";
		const count =
			Number.isFinite(data.count) && (data.count ?? 0) > 0
				? Math.floor(data.count!)
				: 1;

		// Key generation logic
		const baseKey = `${color}::${summary || title}`;

		return {
			title,
			color,
			timeout,
			count,
			key: baseKey,
			summary,
			latestDetail: detail,
		};
	}

	function shouldThrottleNotification(_notification: Notification) {
		return false;
	}

	function mergeNotifications(target: Notification, incoming: Notification) {
		target.count += incoming.count;
		target.timeout = Math.max(target.timeout, incoming.timeout);
		if (incoming.latestDetail) {
			target.latestDetail = incoming.latestDetail;
		}
	}

	function formatNotificationMessage(notification: Notification) {
		const baseText = notification.summary || notification.title;
		const multiplier =
			notification.count > 1 ? ` (${notification.count}×)` : "";
		const detail = notification.latestDetail;

		if (notification.summary && detail) {
			return `${baseText}${multiplier} – ${detail}`;
		}
		if (detail && !notification.summary) {
			return `${baseText}${multiplier}: ${detail}`;
		}

		return `${baseText}${multiplier}`;
	}

	function updateActiveState() {
		if (currentNotification.value) {
			text.value = formatNotificationMessage(currentNotification.value);
			timeout.value = currentNotification.value.timeout;
		}
	}

	return {
		visible,
		text,
		color,
		timeout,
		history,
		unreadCount,
		show,
		onSnackbarClosed,
		markRead,
		clearHistory,
	};
});
