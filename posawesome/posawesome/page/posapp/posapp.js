// Include onscan.js
frappe.pages["posapp"].on_page_load = async function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "POS Awesome",
		single_column: true,
	});
	const pageRef = (wrapper && wrapper.page) || page;
	const BOOT_RETRY_KEY = "posa_boot_retry_once";
	const detectBootFailureCode = (error) => {
		const message = (error && error.message ? String(error.message) : String(error || ""))
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

	const waitForPosApp = (timeoutMs = 15000) => {
		return new Promise((resolve, reject) => {
			const startedAt = Date.now();
			const interval = setInterval(() => {
				if (frappe.PosApp && frappe.PosApp.posapp) {
					clearInterval(interval);
					resolve();
					return;
				}

				if (Date.now() - startedAt >= timeoutMs) {
					clearInterval(interval);
					reject(new Error("Timed out waiting for frappe.PosApp.posapp"));
				}
			}, 100);
		});
	};

	const handleBootstrapFailure = (error) => {
		const failureCode = detectBootFailureCode(error);
		const failureDetail = error && error.message ? String(error.message) : String(error || "");
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

		if (!alreadyRetried) {
			try {
				window.sessionStorage.setItem(BOOT_RETRY_KEY, "1");
			} catch (err) {
				console.warn("Unable to persist boot retry state", err);
			}
			window.location.replace(`/app/posapp?_posa_boot_retry=${Date.now()}`);
			return;
		}

		try {
			window.sessionStorage.removeItem(BOOT_RETRY_KEY);
		} catch (err) {
			console.warn("Unable to clear boot retry state", err);
		}

		frappe.msgprint({
			title: "POS Awesome",
			indicator: "red",
			message: `POS app failed to start (${failureCode}). Please clear browser cache or refresh assets, then reload /app/posapp.`,
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
		handleBootstrapFailure(error);
		return;
	}

	try {
		window.sessionStorage.removeItem(BOOT_RETRY_KEY);
	} catch (err) {
		console.warn("Unable to clear boot retry state", err);
	}

	if (!pageRef.$PosApp) {
		pageRef.$PosApp = new frappe.PosApp.posapp(pageRef);
	}

	$("div.navbar-fixed-top").find(".container").css("padding", "0");

	$("head").append(
		"<link href='/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css' rel='stylesheet'>",
	);

	if (pageRef._posaTaxInclusiveHandler && frappe.realtime && typeof frappe.realtime.off === "function") {
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
	if (
		wrapper &&
		wrapper.page &&
		wrapper.page.$PosApp &&
		typeof wrapper.page.$PosApp.unmount === "function"
	) {
		wrapper.page.$PosApp.unmount();
		wrapper.page.$PosApp = null;
	}
};
