<template>
	<v-row justify="center">
		<v-dialog v-model="addressDialog" max-width="600px">
			<v-card>
				<v-card-title>
					<span class="text-h5 text-primary">{{ __("Add New Address") }}</span>
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
						<v-row>
							<v-col cols="12">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Address Name')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="address.name"
								></v-text-field>
							</v-col>
							<v-col cols="12">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Address Line 1')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="address.address_line1"
								></v-text-field>
							</v-col>
							<v-col cols="12">
								<v-text-field
									density="compact"
									color="primary"
									:label="frappe._('Address Line 2')"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="address.address_line2"
								></v-text-field>
							</v-col>
							<v-col cols="6">
								<v-text-field
									label="City"
									density="compact"
									color="primary"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="address.city"
								></v-text-field>
							</v-col>
							<v-col cols="6">
								<v-text-field
									label="State"
									density="compact"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									class="dark-field"
									hide-details
									v-model="address.state"
								></v-text-field>
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="close_dialog">{{ __("Close") }}</v-btn>
					<v-btn color="success" theme="dark" @click="submit_dialog">{{ __("Submit") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>
</template>

<script>
export default {
	data: () => ({
		addressDialog: false,
		address: {},
		customer: "",
	}),
	computed: {
		isDarkTheme() {
			return this.$theme.current === "dark";
		},
	},

	methods: {
		close_dialog() {
			this.addressDialog = false;
		},

		submit_dialog() {
			var vm = this;
			this.address.customer = this.customer;
			this.address.doctype = "Customer";
			frappe.call({
				method: "posawesome.posawesome.api.customers.make_address",
				args: {
					args: this.address,
				},
				callback: (r) => {
					if (!r.exc) {
						vm.eventBus.emit("add_the_new_address", r.message);
						vm.eventBus.emit("show_message", {
							text: "Customer Address created successfully.",
							color: "success",
						});
						vm.addressDialog = false;
						vm.customer = "";
						vm.address = {};
					}
				},
			});
		},
	},
	created: function () {
		this.eventBus.on("open_new_address", (data) => {
			this.addressDialog = true;
			this.customer = data;
		});
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
