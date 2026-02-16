import { parseBooleanSetting } from "./stock";

export const CUSTOMER_DISPLAY_ROUTE = "/app/posapp/customer-display";
export const CUSTOMER_DISPLAY_CHANNEL_SESSION_KEY =
	"posa_customer_display_channel_id";
export const CUSTOMER_DISPLAY_AUTO_OPEN_PREFIX =
	"posa_customer_display_auto_opened";

const CHANNEL_NAMESPACE = "posa_customer_display_channel";
const STORAGE_NAMESPACE = "posa_customer_display_snapshot";

export interface CustomerDisplayLineItem {
	id: string;
	item_code: string;
	item_name: string;
	qty: number;
	rate: number;
	amount: number;
	uom: string;
}

export interface CustomerDisplaySnapshot {
	channel_id: string;
	currency: string;
	customer_name: string;
	items: CustomerDisplayLineItem[];
	total_qty: number;
	total_amount: number;
	updated_at: string;
}

type SnapshotEnvelope = {
	type: "snapshot";
	payload: CustomerDisplaySnapshot;
	sent_at: string;
};

export interface CustomerDisplayTransport {
	publish: (_snapshot: CustomerDisplaySnapshot) => void;
	subscribe: (
		_handler: (_snapshot: CustomerDisplaySnapshot) => void,
		_emitInitial?: boolean,
	) => () => void;
	getLastSnapshot: () => CustomerDisplaySnapshot | null;
	close: () => void;
}

const canUseSessionStorage = () =>
	typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const canUseLocalStorage = () =>
	typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const createRandomChannelId = () =>
	`cd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const getBroadcastTopic = (channelId: string) =>
	`${CHANNEL_NAMESPACE}:${channelId}`;

export const getCustomerDisplayStorageKey = (channelId: string) =>
	`${STORAGE_NAMESPACE}:${channelId}`;

const parseSnapshotEnvelope = (value: string | null) => {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value);
		if (!parsed || typeof parsed !== "object") return null;
		if (parsed.type === "snapshot" && parsed.payload) {
			return parsed as SnapshotEnvelope;
		}
		if (parsed.payload) {
			return {
				type: "snapshot",
				payload: parsed.payload,
				sent_at: parsed.sent_at || new Date().toISOString(),
			} as SnapshotEnvelope;
		}
		return {
			type: "snapshot",
			payload: parsed as CustomerDisplaySnapshot,
			sent_at: new Date().toISOString(),
		} as SnapshotEnvelope;
	} catch {
		return null;
	}
};

export const getOrCreateCustomerDisplayChannelId = () => {
	if (!canUseSessionStorage()) {
		return createRandomChannelId();
	}

	const current = window.sessionStorage.getItem(
		CUSTOMER_DISPLAY_CHANNEL_SESSION_KEY,
	);
	if (current) {
		return current;
	}

	const next = createRandomChannelId();
	window.sessionStorage.setItem(CUSTOMER_DISPLAY_CHANNEL_SESSION_KEY, next);
	return next;
};

export const buildCustomerDisplayUrl = (channelId: string) => {
	if (typeof window === "undefined") {
		return `${CUSTOMER_DISPLAY_ROUTE}?channel=${encodeURIComponent(channelId)}`;
	}
	const url = new URL(CUSTOMER_DISPLAY_ROUTE, window.location.origin);
	url.searchParams.set("channel", channelId);
	return url.toString();
};

export const isCustomerDisplayEnabled = (posProfile: any) =>
	parseBooleanSetting(posProfile?.posa_enable_customer_display);

export const shouldAutoOpenCustomerDisplay = (posProfile: any) =>
	parseBooleanSetting(posProfile?.posa_auto_open_customer_display);

export const getAutoOpenMarkerKey = (channelId: string) =>
	`${CUSTOMER_DISPLAY_AUTO_OPEN_PREFIX}:${channelId}`;

export const createCustomerDisplayTransport = (
	channelId: string,
): CustomerDisplayTransport => {
	const topic = getBroadcastTopic(channelId);
	const storageKey = getCustomerDisplayStorageKey(channelId);
	const BroadcastChannelClass =
		typeof window !== "undefined" ? (window as any).BroadcastChannel : null;
	const channel: BroadcastChannel | null = BroadcastChannelClass
		? new BroadcastChannelClass(topic)
		: null;

	const getLastSnapshot = () => {
		if (!canUseLocalStorage()) {
			return null;
		}
		const envelope = parseSnapshotEnvelope(
			window.localStorage.getItem(storageKey),
		);
		return envelope?.payload || null;
	};

	const publish = (snapshot: CustomerDisplaySnapshot) => {
		const envelope: SnapshotEnvelope = {
			type: "snapshot",
			payload: snapshot,
			sent_at: new Date().toISOString(),
		};

		if (channel) {
			try {
				channel.postMessage(envelope);
			} catch (error) {
				console.warn("Customer display broadcast failed", error);
			}
		}

		if (canUseLocalStorage()) {
			try {
				window.localStorage.setItem(storageKey, JSON.stringify(envelope));
			} catch (error) {
				console.warn("Customer display local cache write failed", error);
			}
		}
	};

	const subscribe = (
		handler: (_snapshot: CustomerDisplaySnapshot) => void,
		emitInitial = true,
	) => {
		const onMessage = (event: MessageEvent) => {
			const envelope = event?.data as SnapshotEnvelope;
			if (envelope?.type === "snapshot" && envelope.payload) {
				handler(envelope.payload);
			}
		};

		const onStorage = (event: StorageEvent) => {
			if (event.key !== storageKey || !event.newValue) return;
			const envelope = parseSnapshotEnvelope(event.newValue);
			if (envelope?.payload) {
				handler(envelope.payload);
			}
		};

		if (channel) {
			channel.addEventListener("message", onMessage as EventListener);
		}

		if (typeof window !== "undefined") {
			window.addEventListener("storage", onStorage);
		}

		if (emitInitial) {
			const initial = getLastSnapshot();
			if (initial) {
				handler(initial);
			}
		}

		return () => {
			if (channel) {
				channel.removeEventListener("message", onMessage as EventListener);
			}
			if (typeof window !== "undefined") {
				window.removeEventListener("storage", onStorage);
			}
		};
	};

	const close = () => {
		if (channel) {
			channel.close();
		}
	};

	return {
		publish,
		subscribe,
		getLastSnapshot,
		close,
	};
};
