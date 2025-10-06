// Network-related composable functions for Home.vue
import { isManualOffline } from "../../offline/index.js";
/* global frappe */

// Debounce variables for network stability
let consecutiveFailures = 0;
let consecutiveSuccesses = 0;
const FAILURE_THRESHOLD = 2; // Number of failed checks before marking as disconnected
const SUCCESS_THRESHOLD = 1; // Number of successful checks before marking as connected
// Increase timeouts to avoid premature aborts on slower networks
const DESK_TIMEOUT = 8000; // 8 seconds
const STATIC_TIMEOUT = 8000; // 8 seconds
const ORIGIN_TIMEOUT = 8000; // 8 seconds

// Exponential backoff variables
let checkInterval = 15000; // Start with 15s
const MAX_INTERVAL = 120000; // Max 2 minutes
const MIN_INTERVAL = 15000; // Min 15s

// Persist last known good state
function persistStatus(networkOnline, serverOnline) {
	localStorage.setItem("networkOnline", JSON.stringify(networkOnline));
	localStorage.setItem("serverOnline", JSON.stringify(serverOnline));
}

function getPersistedStatus() {
	return {
		networkOnline: JSON.parse(localStorage.getItem("networkOnline") || "true"),
		serverOnline: JSON.parse(localStorage.getItem("serverOnline") || "true"),
	};
}

// Manual retry function (to be called from UI)
export function manualNetworkRetry(vm) {
	if (typeof vm.checkNetworkConnectivity === "function") {
		vm.serverConnecting = true;
		vm.$forceUpdate();
		vm.checkNetworkConnectivity().then(() => {
			vm.serverConnecting = false;
			vm.$forceUpdate();
		});
	}
}

// Enhanced periodic check with exponential backoff
function scheduleNextCheck(vm) {
	setTimeout(async () => {
		if (isManualOffline()) {
			vm.serverConnecting = false;
			vm.networkOnline = false;
			vm.serverOnline = false;
			window.serverOnline = false;
			persistStatus(false, false);
			vm.$forceUpdate();
			scheduleNextCheck(vm);
			return;
		}
		vm.serverConnecting = true;
		vm.$forceUpdate();
		await vm.checkNetworkConnectivity();
		vm.serverConnecting = false;
		vm.$forceUpdate();
		// If failed, increase interval (up to max)
		if (!vm.serverOnline) {
			checkInterval = Math.min(checkInterval * 2, MAX_INTERVAL);
		} else {
			checkInterval = MIN_INTERVAL; // Reset on success
		}
		scheduleNextCheck(vm);
	}, checkInterval);
}

export function setupNetworkListeners() {
	// Listen for network status changes
	window.addEventListener("online", () => {
		if (isManualOffline()) return;
		this.networkOnline = true;
		this.internetReachable = true;
		console.log("Network: Online");
		// Verify actual connectivity
		this.checkNetworkConnectivity();
	});

	window.addEventListener("offline", () => {
		if (isManualOffline()) return;
		this.networkOnline = false;
		this.internetReachable = false;
		this.serverOnline = false;
		window.serverOnline = false;
		console.log("Network: Offline");
		this.$forceUpdate();
	});

	// Initial network status from persisted state
	const persisted = getPersistedStatus();
	this.networkOnline = persisted.networkOnline;
	this.serverOnline = persisted.serverOnline;
	this.internetReachable = false;
	this.serverConnecting = false;
	window.serverOnline = this.serverOnline;

	if (!isManualOffline()) {
		this.networkOnline = navigator.onLine;
		this.serverConnecting = true;
		this.$forceUpdate();
		this.checkNetworkConnectivity().then(() => {
			this.serverConnecting = false;
			this.$forceUpdate();
		});
	} else {
		this.networkOnline = false;
		this.internetReachable = false;
		this.serverOnline = false;
		window.serverOnline = false;
		persistStatus(false, false);
	}

	// Start enhanced periodic check
	scheduleNextCheck(this);
}

export async function checkNetworkConnectivity() {
	try {
		let isConnected = false;
		let isInternetReachable = false;

		const deskRequest = fetch("/app", {
			method: "HEAD",
			cache: "no-cache",
			signal: AbortSignal.timeout(DESK_TIMEOUT),
		}).then((r) => r.status < 500);

		const staticRequest = fetch("/assets/frappe/images/frappe-logo.png", {
			method: "HEAD",
			cache: "no-cache",
			signal: AbortSignal.timeout(STATIC_TIMEOUT),
		}).then((r) => r.status < 500);

		const originRequest = fetch(window.location.origin, {
			method: "HEAD",
			cache: "no-cache",
			signal: AbortSignal.timeout(ORIGIN_TIMEOUT),
		}).then((r) => r.status < 500);

		const localCheck = Promise.any([deskRequest, staticRequest, originRequest]).catch(() => false);

		const externalCheck = (async () => {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), 5000);
				await fetch("https://www.google.com/generate_204", {
					method: "GET",
					mode: "no-cors",
					cache: "no-cache",
					signal: controller.signal,
				});
				clearTimeout(timeoutId);
				return true;
			} catch {
				return false;
			}
		})();

		const [localResult, internetResult] = await Promise.all([localCheck, externalCheck]);
		isConnected = localResult;
		isInternetReachable = internetResult;

		// Debounce logic for network/server status
		if (isConnected) {
			consecutiveSuccesses++;
			consecutiveFailures = 0;
			if (consecutiveSuccesses >= SUCCESS_THRESHOLD) {
				if (!this.networkOnline || !this.serverOnline) {
					this.networkOnline = isConnected;
					this.internetReachable = isInternetReachable;
					this.serverOnline = true;
					window.serverOnline = true;
					persistStatus(this.networkOnline, true);
					console.log("Network: Connected");
					this.$forceUpdate();
				}
			}
		} else {
			consecutiveFailures++;
			consecutiveSuccesses = 0;
			if (consecutiveFailures >= FAILURE_THRESHOLD) {
				if (this.networkOnline || this.serverOnline) {
					this.networkOnline = isConnected;
					this.internetReachable = isInternetReachable;
					this.serverOnline = false;
					window.serverOnline = false;
					persistStatus(this.networkOnline, false);
					console.log("Network: Disconnected");
					this.$forceUpdate();
				}
			}
		}
	} catch (error) {
		console.warn("Network connectivity check failed:", error);
		consecutiveFailures++;
		consecutiveSuccesses = 0;
		if (consecutiveFailures >= FAILURE_THRESHOLD) {
			this.networkOnline = navigator.onLine;
			this.internetReachable = false;
			this.serverOnline = false;
			window.serverOnline = false;
			persistStatus(this.networkOnline, false);
			this.$forceUpdate();
		}
	}
}

export function detectHostType(hostname) {
	const ipv4Regex =
		/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
	const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::/;
	const localhostVariants = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
	return (
		ipv4Regex.test(hostname) ||
		ipv6Regex.test(hostname) ||
		localhostVariants.includes(hostname.toLowerCase())
	);
}

export async function performConnectivityChecks(hostname, protocol, port) {
	const checks = [];
	checks.push(this.checkFrappePing());
	checks.push(this.checkCurrentOrigin(protocol, hostname, port));

	if (!this.isIpHost) {
		checks.push(this.checkExternalConnectivity());
	}

	if (frappe.realtime && frappe.realtime.socket) {
		checks.push(this.checkWebSocketConnectivity());
	}

	try {
		const results = await Promise.allSettled(checks);
		return results.some((result) => result.status === "fulfilled" && result.value === true);
	} catch (error) {
		console.warn("All connectivity checks failed:", error);
		return false;
	}
}

export async function checkFrappePing() {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		const response = await fetch("/api/method/ping", {
			method: "HEAD",
			cache: "no-cache",
			signal: controller.signal,
			headers: {
				"Cache-Control": "no-cache, no-store, must-revalidate",
				Pragma: "no-cache",
				Expires: "0",
			},
		});

		clearTimeout(timeoutId);
		return response.ok;
	} catch (error) {
		if (error.name !== "AbortError") {
			console.warn("Frappe ping check failed:", error);
		}
		return false;
	}
}

export async function checkCurrentOrigin(protocol, hostname, port) {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);
		const baseUrl = `${protocol}//${hostname}${port ? ":" + port : ""}`;
		const response = await fetch(`${baseUrl}/api/method/frappe.auth.get_logged_user`, {
			method: "HEAD",
			cache: "no-cache",
			signal: controller.signal,
			headers: {
				"Cache-Control": "no-cache, no-store, must-revalidate",
			},
		});
		clearTimeout(timeoutId);
		return response.status < 500;
	} catch (error) {
		if (error.name !== "AbortError") {
			console.warn("Current origin check failed:", error);
		}
		return false;
	}
}

export async function checkExternalConnectivity() {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 3000);
		await fetch("https://httpbin.org/status/200", {
			method: "HEAD",
			mode: "no-cors",
			cache: "no-cache",
			signal: controller.signal,
		});
		clearTimeout(timeoutId);
		return true;
	} catch (error) {
		if (error.name !== "AbortError") {
			console.warn("External connectivity check failed:", error);
		}
		return false;
	}
}

export async function checkWebSocketConnectivity() {
	try {
		if (frappe.realtime && frappe.realtime.socket) {
			const socketState = frappe.realtime.socket.readyState;
			return socketState === 1; // WebSocket.OPEN
		}
		return false;
	} catch (error) {
		console.warn("WebSocket connectivity check failed:", error);
		return false;
	}
}
