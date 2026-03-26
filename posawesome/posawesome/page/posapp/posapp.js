// Include onscan.js
frappe.pages["posapp"].on_page_load = async function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "POS Awesome",
		single_column: true,
	});
	const pageRef = (wrapper && wrapper.page) || page;
	const BOOT_RETRY_KEY = "posa_boot_retry_once";
	const BOOT_CACHE_RECOVERY_KEY = "posa_boot_cache_recovery_once";
	const detectBootFailureCode = (error) => {
		const message =
			(error && error.message ? String(error.message) : String(error || ""))
				.toLowerCase()
				.trim();

		if (message.includes("timed out waiting for frappe.posapp.posapp")) {
			return "posa_boot_timeout";
		}
		if (
			message.includes("failed to fetch dynamically imported module") ||
			message.includes("loading chunk") ||
			message.includes("chunkloaderror")
		) {
			return "posa_bundle_load_failed";
		}
		if (message.includes("networkerror")) {
			return "posa_network_error";
		}
		return "posa_boot_unknown";
	};
	const isAssetRecoveryFailure = (failureCode) =>
		failureCode === "posa_boot_timeout" ||
		failureCode === "posa_bundle_load_failed";

	const clearBootstrapState = () => {
		try {
			window.sessionStorage.removeItem(BOOT_RETRY_KEY);
			window.sessionStorage.removeItem(BOOT_CACHE_RECOVERY_KEY);
		} catch (err) {
			console.warn("Unable to clear boot recovery state", err);
		}
	};

	const performAssetRecovery = async () => {
		try {
			if (
				typeof navigator !== "undefined" &&
				navigator.serviceWorker &&
				typeof navigator.serviceWorker.getRegistrations === "function"
			) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(
					registrations.map(async (registration) => {
						try {
							registration.active?.postMessage({
								type: "CLIENT_FORCE_UNREGISTER",
							});
						} catch (messageErr) {
							console.warn("Failed to notify active service worker", messageErr);
						}
						try {
							registration.waiting?.postMessage({
								type: "CLIENT_FORCE_UNREGISTER",
							});
						} catch (messageErr) {
							console.warn("Failed to notify waiting service worker", messageErr);
						}
						try {
							registration.installing?.postMessage({
								type: "CLIENT_FORCE_UNREGISTER",
							});
						} catch (messageErr) {
							console.warn("Failed to notify installing service worker", messageErr);
						}
						await registration.unregister();
					}),
				);
			}
		} catch (err) {
			console.warn("POS App recovery failed during service worker cleanup", err);
		}

		try {
			if (typeof caches !== "undefined") {
				const cacheKeys = await caches.keys();
				await Promise.all(cacheKeys.map((key) => caches.delete(key)));
			}
		} catch (err) {
			console.warn("POS App recovery failed during Cache API cleanup", err);
		}

		try {
			window.localStorage.removeItem("posawesome_version");
			window.localStorage.removeItem("posawesome_update_dismissed");
			window.localStorage.removeItem("posawesome_update_last_check");
			window.sessionStorage.removeItem("posawesome_update_snooze_until");
		} catch (err) {
			console.warn("POS App recovery failed during storage cleanup", err);
		}
	};

	const waitForPosApp = (timeoutMs = 30000) => {
		return new Promise((resolve, reject) => {
			const startedAt = Date.now();
			let awaitingBundle = false;

			const finishWithError = (error) => {
				clearInterval(interval);
				reject(error);
			};

			const interval = setInterval(async () => {
				if (frappe.PosApp && frappe.PosApp.posapp) {
					clearInterval(interval);
					resolve();
					return;
				}

				const bundlePromise =
					typeof window !== "undefined"
						? window.__posawesomeBundlePromise
						: null;
				if (
					!awaitingBundle &&
					bundlePromise &&
					typeof bundlePromise.then === "function"
				) {
					awaitingBundle = true;
					try {
						await bundlePromise;
					} catch (bundleError) {
						finishWithError(bundleError);
						return;
					}

					if (frappe.PosApp && frappe.PosApp.posapp) {
						clearInterval(interval);
						resolve();
						return;
					}
				}

				if (Date.now() - startedAt >= timeoutMs) {
					clearInterval(interval);
					reject(
						new Error(
							awaitingBundle
								? "Timed out waiting for frappe.PosApp.posapp after POS bundle load"
								: "Timed out waiting for POS bundle bootstrap",
						),
					);
				}
			}, 100);
		});
	};

	const handleBootstrapFailure = async (error) => {
		const failureCode = detectBootFailureCode(error);
		const failureDetail =
			error && error.message ? String(error.message) : String(error || "");
		console.error("POS App bootstrap failed", {
			failureCode,
			failureDetail,
			error,
			pathname: window.location.pathname,
			search: window.location.search,
		});
		let alreadyRetried = false;
		try {
			alreadyRetried = window.sessionStorage.getItem(BOOT_RETRY_KEY) === "1";
		} catch (err) {
			console.warn("Unable to read boot retry state", err);
		}
		let alreadyRecovered = false;
		try {
			alreadyRecovered =
				window.sessionStorage.getItem(BOOT_CACHE_RECOVERY_KEY) === "1";
		} catch (err) {
			console.warn("Unable to read boot recovery state", err);
		}

		if (!alreadyRetried) {
			try {
				window.sessionStorage.setItem(BOOT_RETRY_KEY, "1");
			} catch (err) {
				console.warn("Unable to persist boot retry state", err);
			}
			window.location.replace(`/app/posapp?_posa_boot_retry=${Date.now()}`);
			return;
		}

		if (isAssetRecoveryFailure(failureCode) && !alreadyRecovered) {
			try {
				window.sessionStorage.setItem(BOOT_CACHE_RECOVERY_KEY, "1");
			} catch (err) {
				console.warn("Unable to persist boot recovery state", err);
			}
			await performAssetRecovery();
			window.location.replace(`/app/posapp?_posa_asset_recovery=${Date.now()}`);
			return;
		}

		clearBootstrapState();

		frappe.msgprint({
			title: "POS Awesome",
			indicator: "red",
			message:
				`POS app failed to start (${failureCode}). Automatic cache recovery was attempted. If the problem persists, reload /app/posapp or use the in-app cache clear shortcut.`,
		});
	};

	try {
		if (
			typeof window !== "undefined" &&
			window.__posawesomeBundlePromise &&
			typeof window.__posawesomeBundlePromise.then === "function"
		) {
			await window.__posawesomeBundlePromise;
		}

		await waitForPosApp();
	} catch (error) {
		await handleBootstrapFailure(error);
		return;
	}

	clearBootstrapState();

	if (!pageRef.$PosApp) {
		pageRef.$PosApp = new frappe.PosApp.posapp(pageRef);
	}

	$("div.navbar-fixed-top").find(".container").css("padding", "0");

	$("head").append(
		"<link href='/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css' rel='stylesheet'>",
	);

	if (
		pageRef._posaTaxInclusiveHandler &&
		frappe.realtime &&
		typeof frappe.realtime.off === "function"
	) {
		frappe.realtime.off("pos_profile_registered", pageRef._posaTaxInclusiveHandler);
	}

	// Listen for POS Profile registration
	pageRef._posaTaxInclusiveHandler = () => {
		const update_totals_based_on_tax_inclusive = () => {
			console.log("Updating totals based on tax inclusive settings");
			const posProfile = pageRef.$PosApp && pageRef.$PosApp.pos_profile;

			if (!posProfile) {
				console.error("POS Profile is not set.");
				return;
			}

			const cacheKey = "posa_tax_inclusive";
			const cachedValue = localStorage.getItem(cacheKey);

			const applySetting = (taxInclusive) => {
				const totalAmountField = document.getElementById("input-v-25");
				const grandTotalField = document.getElementById("input-v-29");

				if (totalAmountField && grandTotalField) {
					if (taxInclusive) {
						totalAmountField.value = grandTotalField.value;
						console.log("Total amount copied from grand total:", grandTotalField.value);
					} else {
						totalAmountField.value = "";
						console.log("Total amount cleared because checkbox is unchecked.");
					}
				} else {
					console.error("Could not find total amount or grand total field by ID.");
				}
			};

			const fetchAndCache = () => {
				frappe.call({
					method: "posawesome.posawesome.api.utilities.get_pos_profile_tax_inclusive",
					args: {
						pos_profile: posProfile,
					},
					callback: function (response) {
						if (response.message !== undefined) {
							const posa_tax_inclusive = response.message;
							try {
								localStorage.setItem(cacheKey, JSON.stringify(posa_tax_inclusive));
							} catch (err) {
								console.warn("Failed to cache tax inclusive setting", err);
							}
							applySetting(posa_tax_inclusive);
							import("/assets/posawesome/dist/js/offline/index.js")
								.then((m) => {
									if (m && m.setTaxInclusiveSetting) {
										m.setTaxInclusiveSetting(posa_tax_inclusive);
									}
								})
								.catch(() => {});
						} else {
							console.error("Error fetching POS Profile or POS Profile not found.");
						}
					},
				});
			};

			if (navigator.onLine) {
				fetchAndCache();
				return;
			}

			if (cachedValue !== null) {
				try {
					const val = JSON.parse(cachedValue);
					applySetting(val);
					import("/assets/posawesome/dist/js/offline/index.js")
						.then((m) => {
							if (m && m.setTaxInclusiveSetting) {
								m.setTaxInclusiveSetting(val);
							}
						})
						.catch(() => {});
				} catch (e) {
					console.warn("Failed to parse cached tax inclusive value", e);
				}
				return;
			}

			fetchAndCache();
		};

		update_totals_based_on_tax_inclusive();
	};
	frappe.realtime.on("pos_profile_registered", pageRef._posaTaxInclusiveHandler);
};

frappe.pages["posapp"].on_page_unload = function (wrapper) {
	if (
		wrapper &&
		wrapper.page &&
		wrapper.page._posaTaxInclusiveHandler &&
		frappe.realtime &&
		typeof frappe.realtime.off === "function"
	) {
		frappe.realtime.off("pos_profile_registered", wrapper.page._posaTaxInclusiveHandler);
		wrapper.page._posaTaxInclusiveHandler = null;
	}

	// Only unmount if this specific page's app instance exists
	// This prevents interference when navigating within ERPNext outside POS
	if (wrapper && wrapper.page && wrapper.page.$PosApp && typeof wrapper.page.$PosApp.unmount === "function") {
		wrapper.page.$PosApp.unmount();
		wrapper.page.$PosApp = null;
	}
};
