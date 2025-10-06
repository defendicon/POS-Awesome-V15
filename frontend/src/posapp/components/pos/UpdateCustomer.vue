<template>
	<v-row justify="center">
		<v-dialog v-model="customerDialog" max-width="600px" persistent>
			<v-card>
				<v-card-title class="d-flex align-center">
					<span v-if="customer_id" class="text-h5 text-primary">{{ __("Update Customer") }}</span>
					<span v-else class="text-h5 text-primary">{{ __("Create Customer") }}</span>
					<v-spacer></v-spacer>
					<v-switch
						v-model="hideNonEssential"
						density="compact"
						inset
						hide-details
						color="primary"
						:label="__('Hide Non Essential Fields')"
					></v-switch>
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
						<v-row>
							<v-col cols="12">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Customer Name') + ' *'"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									class="dark-field"
									v-model="customer_name"
								></v-text-field>
							</v-col>
							<v-col cols="6">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Tax ID')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="tax_id"
								></v-text-field>
							</v-col>
							<v-col cols="6">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Mobile No')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="mobile_no"
								></v-text-field>
							</v-col>
							<v-col cols="12" v-if="!hideNonEssential">
								<v-text-field
									density="compact"
									color="primary"
									:label="__('Address Line 1')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									hide-details
									class="dark-field"
									v-model="address_line1"
								></v-text-field>
							</v-col>

							<v-col cols="12" sm="6" v-if="!hideNonEssential">
								<v-text-field
									v-model="city"
									variant="outlined"
									density="compact"
									:label="__('City')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
								></v-text-field>
							</v-col>

							<v-col cols="12" sm="6" v-if="!hideNonEssential">
								<v-select
									v-model="country"
									:items="countries"
									variant="outlined"
									density="compact"
									:label="__('Country')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
								></v-select>
							</v-col>

							<v-col cols="6">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Email Id')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="email_id"
								></v-text-field>
							</v-col>
							<v-col cols="6">
								<v-select
									density="compact"
									label="Gender"
									:items="genders"
									v-model="gender"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
								></v-select>
							</v-col>
							<v-col cols="6">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Referral Code')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="referral_code"
								></v-text-field>
							</v-col>
							<v-col cols="6">
								<v-text-field
									v-model="birthday"
									:label="frappe._('Birthday (DD-MM-YYYY)')"
									density="compact"
									clearable
									hide-details
									color="primary"
									placeholder="DD-MM-YYYY"
									@update:model-value="formatBirthdayOnInput"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
								></v-text-field>
							</v-col>
							<v-col cols="6" v-if="!hideNonEssential">
								<v-autocomplete
									clearable
									density="compact"
									auto-select-first
									color="primary"
									:label="frappe._('Customer Group') + ' *'"
									v-model="group"
									:items="groups"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									:no-data-text="__('Group not found')"
									hide-details
									required
								>
								</v-autocomplete>
							</v-col>
							<v-col cols="6" v-if="!hideNonEssential">
								<v-autocomplete
									clearable
									density="compact"
									auto-select-first
									color="primary"
									:label="frappe._('Territory') + ' *'"
									v-model="territory"
									:items="territorys"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									:no-data-text="__('Territory not found')"
									hide-details
									required
								>
								</v-autocomplete>
							</v-col>
							<v-col cols="6" v-if="loyalty_program">
								<v-text-field
									v-model="loyalty_program"
									:label="frappe._('Loyalty Program')"
									density="compact"
									readonly
									hide-details
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
								></v-text-field>
							</v-col>
							<v-col cols="6" v-if="loyalty_points">
								<v-text-field
									v-model="loyalty_points"
									:label="frappe._('Loyalty Points')"
									density="compact"
									readonly
									hide-details
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
								></v-text-field>
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="confirm_close">{{ __("Close") }}</v-btn>
					<v-btn color="success" theme="dark" @click="submit_dialog">{{ __("Submit") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Confirmation Dialog -->
		<v-dialog v-model="confirmDialog" max-width="400px">
			<v-card>
				<v-card-title class="text-h5 text-primary">
					{{ __("Confirm Close") }}
				</v-card-title>
				<v-card-text>
					{{ __("Are you sure you want to close? All entered data will be lost.") }}
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="primary" @click="confirmDialog = false">
						{{ __("Continue Editing") }}
					</v-btn>
					<v-btn color="error" @click="confirmClose">
						{{ __("Yes, Close") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
import { isOffline, saveOfflineCustomer } from "../../../offline/index.js";

export default {
	data: () => ({
		customerDialog: false,
		confirmDialog: false,
		pos_profile: "",
		customer_id: "",
		customer_name: "",
		tax_id: "",
		mobile_no: "",
		address_line1: "",
		city: "",
		country: "Pakistan",
		email_id: "",
		referral_code: "",
		birthday: "",
		birthday_menu: false,
		group: "",
		groups: [],
		territory: "",
		territorys: [],
		genders: [],
		customer_type: "Individual",
		gender: "",
		loyalty_points: null,
		loyalty_program: null,
		hideNonEssential: false,
		countries: [
			"Afghanistan",
			"Australia",
			"Bahrain",
			"Bangladesh",
			"Canada",
			"China",
			"Denmark",
			"France",
			"Germany",
			"India",
			"Indonesia",
			"Italy",
			"Japan",
			"Kuwait",
			"Malaysia",
			"Nepal",
			"Netherlands",
			"New Zealand",
			"Norway",
			"Oman",
			"Pakistan",
			"Philippines",
			"Qatar",
			"Saudi Arabia",
			"Singapore",
			"South Korea",
			"Spain",
			"Sri Lanka",
			"Sweden",
			"Switzerland",
			"Syria",
			"Thailand",
			"United Arab Emirates",
			"United Kingdom",
			"United States",
			"Vietnam",
			"Yemen",
		],
	}),
	watch: {
		hideNonEssential(val) {
			if (typeof localStorage !== "undefined") {
				localStorage.setItem("posawesome_hide_non_essential_fields", JSON.stringify(val));
			}
		},
		birthday(newVal) {
			// Check if the user has entered 8 digits without separators (e.g., 04111994)
			if (newVal && /^\d{8}$/.test(newVal)) {
				try {
					const day = newVal.substring(0, 2);
					const month = newVal.substring(2, 4);
					const year = newVal.substring(4);

					// Format it as a hyphenated date for display
					this.birthday = `${day}-${month}-${year}`;

					// Update calendar (implemented below)
					this.updateCalendarDate(day, month, year);
				} catch (error) {
					console.error("Error processing 8-digit date:", error);
				}
			}
			// Check if the date is already in DD-MM-YYYY format
			else if (newVal && /^\d{2}-\d{2}-\d{4}$/.test(newVal)) {
				try {
					const parts = newVal.split("-");
					const day = parts[0];
					const month = parts[1];
					const year = parts[2];

					// Update calendar to show the correct month
					this.updateCalendarDate(day, month, year);
				} catch (error) {
					console.error("Error processing formatted date:", error);
				}
			}
		},

		// Add a watcher for the calendar menu to ensure it shows the right date when opened
		birthday_menu(isOpen) {
			if (isOpen && this.birthday && /^\d{2}-\d{2}-\d{4}$/.test(this.birthday)) {
				try {
					const parts = this.birthday.split("-");
					const day = parts[0];
					const month = parts[1];
					const year = parts[2];

					// Update calendar date when menu opens
					this.$nextTick(() => {
						this.updateCalendarDate(day, month, year);
					});
				} catch (error) {
					console.error("Error updating calendar on menu open:", error);
				}
			}
		},
	},
	computed: {
		isDarkTheme() {
			return this.$theme.current === "dark";
		},
	},
	methods: {
		// Add a new method to update calendar date
		updateCalendarDate(day, month, year) {
			// First close the date picker if it's open
			const wasOpen = this.birthday_menu;
			this.birthday_menu = false;

			// Use nextTick to ensure DOM updates
			this.$nextTick(() => {
				// Format date in YYYY-MM-DD format for Vuetify
				const tempDate = `${year}-${month}-${day}`;

				// Try to directly set the calendar's date
				setTimeout(() => {
					if (this.$refs.birthday_menu) {
						this.$refs.birthday_menu.date = tempDate;
						// Optionally reopen menu if it was open
						if (wasOpen) {
							this.birthday_menu = true;
						}
					}
				}, 50);
			});
		},
		confirm_close() {
			// Check if any data has been entered
			if (
				this.customer_name ||
				this.tax_id ||
				this.mobile_no ||
				this.address_line1 ||
				this.email_id ||
				this.referral_code ||
				this.birthday
			) {
				this.confirmDialog = true;
			} else {
				// If no data entered, just close
				this.close_dialog();
			}
		},
		confirmClose() {
			this.confirmDialog = false;
			this.close_dialog();
		},
		close_dialog() {
			this.customerDialog = false;
			this.clear_customer();
		},
		clear_customer() {
			this.customer_name = "";
			this.tax_id = "";
			this.mobile_no = "";
			this.address_line1 = "";
			this.city = "";
			this.country = (this.pos_profile && this.pos_profile.posa_default_country) || "Pakistan";
			this.email_id = "";
			this.referral_code = "";
			this.birthday = "";
			this.group = frappe.defaults.get_user_default("Customer Group");
			this.territory = frappe.defaults.get_user_default("Territory");
			this.customer_id = "";
			this.customer_type = "Individual";
			this.gender = "";
			this.loyalty_points = null;
			this.loyalty_program = null;
		},
		getCustomerGroups() {
			if (this.groups.length > 0) return;
			const vm = this;
			frappe.db
				.get_list("Customer Group", {
					fields: ["name"],
					filters: { is_group: 0 },
					limit: 1000,
					order_by: "name",
				})
				.then((data) => {
					if (data.length > 0) {
						data.forEach((el) => {
							vm.groups.push(el.name);
						});
					}
				});
		},
		getCustomerTerritorys() {
			if (this.territorys.length > 0) return;
			const vm = this;
			frappe.db
				.get_list("Territory", {
					fields: ["name"],
					filters: { is_group: 0 },
					limit: 5000,
					order_by: "name",
				})
				.then((data) => {
					if (data.length > 0) {
						data.forEach((el) => {
							vm.territorys.push(el.name);
						});
					}
				});
		},
		getGenders() {
			const vm = this;
			frappe.db
				.get_list("Gender", {
					fields: ["name"],
					page_length: 10,
				})
				.then((data) => {
					if (data.length > 0) {
						data.forEach((el) => {
							vm.genders.push(el.name);
						});
					}
				});
		},
		formatBirthdayOnInput() {
			// Handle 8-digit format (DDMMYYYY)
			if (this.birthday && /^\d{8}$/.test(this.birthday)) {
				try {
					const day = this.birthday.substring(0, 2);
					const month = this.birthday.substring(2, 4);
					const year = this.birthday.substring(4);
					this.birthday = `${day}-${month}-${year}`;
				} catch (error) {
					console.error("Error formatting date:", error);
				}
			}
		},
		submit_dialog() {
			const vm = this;
			if (!this.customer_name) {
				frappe.throw(__("Customer Name is required"));
				return;
			}

			if (!this.group) {
				frappe.throw(__("Customer group is required"));
				return;
			}

			if (!this.territory) {
				frappe.throw(__("Customer territory is required"));
				return;
			}

			// Format birthday to YYYY-MM-DD if it exists and is in another format
			let formatted_birthday = null;
			if (this.birthday) {
				try {
					// First check if it's a date without separators (e.g., 04111994 for 04-11-1994)
					if (/^\d{8}$/.test(this.birthday)) {
						const day = this.birthday.substring(0, 2);
						const month = this.birthday.substring(2, 4);
						const year = this.birthday.substring(4);
						formatted_birthday = `${year}-${month}-${day}`;
					}
					// Check if it's in DD-MM-YYYY format
					else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(this.birthday)) {
						const parts = this.birthday.split("-");
						if (parts.length === 3) {
							const day = parts[0].padStart(2, "0");
							const month = parts[1].padStart(2, "0");
							const year = parts[2];
							formatted_birthday = `${year}-${month}-${day}`;
						}
					}
					// Handle DD/MM/YYYY format
					else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(this.birthday)) {
						const parts = this.birthday.split("/");
						if (parts.length === 3) {
							const day = parts[0].padStart(2, "0");
							const month = parts[1].padStart(2, "0");
							const year = parts[2];
							formatted_birthday = `${year}-${month}-${day}`;
						}
					}
					// For any other format, try to use the browser's date parsing
					else if (this.birthday) {
						try {
							const date = new Date(this.birthday);
							// Check if the date is valid
							if (!isNaN(date.getTime())) {
								const year = date.getFullYear();
								const month = String(date.getMonth() + 1).padStart(2, "0");
								const day = String(date.getDate()).padStart(2, "0");
								formatted_birthday = `${year}-${month}-${day}`;
							}
						} catch (e) {
							console.error("Failed to parse date:", e);
						}
					}
				} catch (error) {
					console.error("Error formatting date:", error);
					formatted_birthday = null;
				}
			}

			// Create args object to use in callback
			const args = {
				customer_id: this.customer_id,
				customer_name: this.customer_name,
				tax_id: this.tax_id,
				mobile_no: this.mobile_no,
				address_line1: this.address_line1,
				city: this.city,
				country: this.country,
				email_id: this.email_id,
				referral_code: this.referral_code,
				birthday: formatted_birthday || this.birthday,
				customer_group: this.group,
				territory: this.territory,
				customer_type: this.customer_type,
				gender: this.gender,
			};
			const apiArgs = {
				...args,
				company: vm.pos_profile.company,
				pos_profile_doc: JSON.stringify(vm.pos_profile),
				method: this.customer_id ? "update" : "create",
			};

			if (isOffline()) {
				saveOfflineCustomer({ args: apiArgs });
				vm.eventBus.emit("show_message", { title: __("Customer saved offline"), color: "warning" });
				args.name = this.customer_name;
				vm.eventBus.emit("add_customer_to_list", args);
				vm.eventBus.emit("set_customer", args.name);
				vm.close_dialog();
				return;
			}

			frappe.call({
				method: "posawesome.posawesome.api.customers.create_customer",
				args: apiArgs,
				callback: (r) => {
					if (!r.exc && r.message.name) {
						let text = __("Customer created successfully.");
						if (vm.customer_id) {
							text = __("Customer updated successfully.");
						}
						vm.eventBus.emit("show_message", {
							title: text,
							color: "success",
						});
						args.name = r.message.name;
						frappe.utils.play_sound("submit");
						vm.eventBus.emit("add_customer_to_list", args);
						vm.eventBus.emit("set_customer", r.message.name);
						vm.eventBus.emit("fetch_customer_details");
						vm.close_dialog();
					} else {
						frappe.utils.play_sound("error");
						vm.eventBus.emit("show_message", {
							title: __("Customer creation failed."),
							color: "error",
						});
					}
				},
			});
		},
		onDateSelect() {
			// Close the menu
			this.birthday_menu = false;

			// Format date if it's a JavaScript Date object or full date string (from date picker)
			if (this.birthday) {
				try {
					// Handle both JavaScript Date objects and strings with GMT
					let dateObj;
					if (typeof this.birthday === "object") {
						dateObj = this.birthday;
					} else if (
						typeof this.birthday === "string" &&
						(this.birthday.includes("GMT") || this.birthday.includes("T"))
					) {
						dateObj = new Date(this.birthday);
					} else {
						// Already formatted or something else, leave it
						return;
					}

					const year = dateObj.getFullYear();
					const month = String(dateObj.getMonth() + 1).padStart(2, "0");
					const day = String(dateObj.getDate()).padStart(2, "0");

					// Format as DD-MM-YYYY
					this.birthday = `${day}-${month}-${year}`;
				} catch (error) {
					console.error("Error formatting date from picker:", error);
				}
			}
		},
	},
	created: function () {
		if (typeof localStorage !== "undefined") {
			const saved = localStorage.getItem("posawesome_hide_non_essential_fields");
			if (saved !== null) {
				this.hideNonEssential = JSON.parse(saved);
			}
		}
		this.eventBus.on("open_update_customer", (data) => {
			this.customerDialog = true;

			if (data) {
				this.customer_name = data.customer_name;
				this.customer_id = data.name;
				this.address_line1 = data.address_line1 || "";
				this.city = data.city || "";
				this.country =
					data.country || (this.pos_profile && this.pos_profile.posa_default_country) || "Pakistan";
				this.tax_id = data.tax_id;
				this.mobile_no = data.mobile_no;
				this.email_id = data.email_id;
				this.referral_code = data.referral_code;
				this.birthday = data.birthday;
				this.group = data.customer_group;
				this.territory = data.territory;
				this.loyalty_points = data.loyalty_points;
				this.loyalty_program = data.loyalty_program;
				this.gender = data.gender;
			} else {
				this.country = (this.pos_profile && this.pos_profile.posa_default_country) || "Pakistan";
			}
		});
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile;
			this.country = (this.pos_profile && this.pos_profile.posa_default_country) || "Pakistan";
		});
		this.eventBus.on("payments_register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile;
			this.country = (this.pos_profile && this.pos_profile.posa_default_country) || "Pakistan";
		});
		this.getCustomerGroups();
		this.getCustomerTerritorys();
		this.getGenders();
		// set default values for customer group and territory from user defaults
		this.group = frappe.defaults.get_user_default("Customer Group");
		this.territory = frappe.defaults.get_user_default("Territory");
	},
};
</script>

<style scoped>
/* Dark mode input styling */
:deep([data-theme="dark"]) .dark-field,
:deep(.v-theme--dark) .dark-field,
::v-deep([data-theme="dark"]) .dark-field,
::v-deep(.v-theme--dark) .dark-field {
	background-color: #1e1e1e !important;
}

:deep([data-theme="dark"]) .dark-field :deep(.v-field__input),
:deep(.v-theme--dark) .dark-field :deep(.v-field__input),
:deep([data-theme="dark"]) .dark-field :deep(input),
:deep(.v-theme--dark) .dark-field :deep(input),
:deep([data-theme="dark"]) .dark-field :deep(.v-label),
:deep(.v-theme--dark) .dark-field :deep(.v-label),
::v-deep([data-theme="dark"]) .dark-field .v-field__input,
::v-deep(.v-theme--dark) .dark-field .v-field__input,
::v-deep([data-theme="dark"]) .dark-field input,
::v-deep(.v-theme--dark) .dark-field input,
::v-deep([data-theme="dark"]) .dark-field .v-label,
::v-deep(.v-theme--dark) .dark-field .v-label {
	color: #fff !important;
}

:deep([data-theme="dark"]) .dark-field :deep(.v-field__overlay),
:deep(.v-theme--dark) .dark-field :deep(.v-field__overlay),
::v-deep([data-theme="dark"]) .dark-field .v-field__overlay,
::v-deep(.v-theme--dark) .dark-field .v-field__overlay {
	background-color: #1e1e1e !important;
}
</style>
