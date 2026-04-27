const BOOTSTRAP_SNAPSHOT_UPDATED_EVENT =
	"posa:bootstrap-snapshot-updated";

export function emitBootstrapSnapshotUpdated(snapshot: unknown) {
	if (
		typeof window === "undefined" ||
		typeof window.dispatchEvent !== "function" ||
		typeof CustomEvent === "undefined"
	) {
		return;
	}

	window.dispatchEvent(
		new CustomEvent(BOOTSTRAP_SNAPSHOT_UPDATED_EVENT, {
			detail: snapshot ?? null,
		}),
	);
}

export function listenForBootstrapSnapshotUpdates(listener: () => void) {
	if (
		typeof window === "undefined" ||
		typeof window.addEventListener !== "function"
	) {
		return () => undefined;
	}

	const handler = () => {
		listener();
	};

	window.addEventListener(BOOTSTRAP_SNAPSHOT_UPDATED_EVENT, handler);
	return () => {
		window.removeEventListener(BOOTSTRAP_SNAPSHOT_UPDATED_EVENT, handler);
	};
}
