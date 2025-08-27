// Include onscan.js
frappe.pages["posapp"].on_page_load = async function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "POS Awesome",
		single_column: true,
	});

	this.page.$PosApp = new frappe.PosApp.posapp(this.page);

	$("div.navbar-fixed-top").find(".container").css("padding", "0");

	$("head").append(
		"<link href='/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css' rel='stylesheet'>",
	);
	$("head").append(
		"<link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css'>",
	);
	$("head").append("<link rel='preconnect' href='https://fonts.googleapis.com'>");
	$("head").append("<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin>");
	$("head").append(
		"<link rel='preload' href='https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900' as='style'>",
	);
	$("head").append(
		"<link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900'>",
	);

	// Listen for POS Profile registration
	frappe.realtime.on("pos_profile_registered", () => {
		const update_totals_based_on_tax_inclusive = () => {
			console.log("Updating totals based on tax inclusive settings");
			const posProfile = this.page.$PosApp.pos_profile;

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
	});
};
