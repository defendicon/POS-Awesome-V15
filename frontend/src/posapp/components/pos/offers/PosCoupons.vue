<template>
	<div>
		<v-card class="selection mx-auto mt-3 pos-themed-card" style="max-height: 80vh; height: 80vh">
			<v-card-title>
				<span class="text-h6 text-primary">{{ __("Coupons") }}</span>
			</v-card-title>

			<!-- Input and Button Row - Same Level -->
			<v-row class="px-4 pb-2" no-gutters>
				<v-col cols="8" class="pr-2">
					<v-text-field
						density="compact"
						variant="outlined"
						color="primary"
						:label="frappe._('Coupon')"
						class="pos-themed-input coupon-input"
						hide-details
						v-model="new_coupon"
						@keydown.enter="add_coupon(new_coupon)"
					>
					</v-text-field>
				</v-col>
				<v-col cols="4">
					<v-btn
						class="add-coupon-btn"
						color="success"
						theme="dark"
						block
						@click="add_coupon(new_coupon)"
					>
						{{ __("add") }}
					</v-btn>
				</v-col>
			</v-row>

			<div
				class="my-0 py-0 overflow-y-auto"
				style="max-height: 75vh"
				@mouseover="style = 'cursor: pointer'"
			>
				<v-data-table
					:headers="items_headers"
					:items="posa_coupons"
					:single-expand="singleExpand"
					v-model:expanded="expanded"
					item-key="coupon"
					class="elevation-1"
					:items-per-page="itemsPerPage"
					hide-default-footer
				>
					<template v-slot:item.applied="{ item }">
						<v-checkbox-btn v-model="item.applied" disabled></v-checkbox-btn>
					</template>
				</v-data-table>
			</div>
		</v-card>

		<v-card flat style="max-height: 11vh; height: 11vh" class="cards mb-0 mt-3 py-0">
			<v-row align="start" no-gutters>
				<v-col cols="12">
					<v-btn
						block
						class="pa-1"
						size="large"
						color="warning"
						theme="dark"
						@click="back_to_invoice"
						>{{ __("Back") }}</v-btn
					>
				</v-col>
			</v-row>
		</v-card>
	</div>
</template>

<script>
import { useCustomersStore } from "../../../stores/customersStore.js";
import { useToastStore } from "../../../stores/toastStore.js";
import { useUIStore } from "../../../stores/uiStore.js";
import { storeToRefs } from "pinia";

export default {
	setup() {
		const customersStore = useCustomersStore();
		const toastStore = useToastStore();
		const uiStore = useUIStore();
		const { selectedCustomer } = storeToRefs(customersStore);
		return { selectedCustomer, toastStore, uiStore };
	},
	data: () => ({
		loading: false,
		pos_profile: "",
		customer: "",
		posa_coupons: [],
		new_coupon: null,
		itemsPerPage: 1000,
		singleExpand: true,
		items_headers: [
			{ title: __("Coupon"), value: "coupon_code", align: "start" },
			{ title: __("Type"), value: "type", align: "start" },
			{ title: __("Offer"), value: "pos_offer", align: "start" },
			{ title: __("Applied"), value: "applied", align: "start" },
		],
	}),

	computed: {
		couponsCount() {
			return (this.posa_coupons || []).length;
		},
		appliedCouponsCount() {
			return (this.posa_coupons || []).filter((el) => !!el.applied).length;
		},
	},

	methods: {
		back_to_invoice() {
			this.uiStore.setActiveView("items");
		},
		add_coupon(new_coupon, options = {}) {
			const silentDuplicate = !!options.silentDuplicate;
			const normalizedCoupon = String(new_coupon || "").trim().toUpperCase();
			if (!this.customer || !normalizedCoupon) {
				this.toastStore.show({
					title: __("Select a customer to use coupon"),
					color: "error",
				});
				return;
			}
			const coupons = this.posa_coupons || [];
			const exist = coupons.find(
				(el) => String(el.coupon_code || "").trim().toUpperCase() == normalizedCoupon,
			);
			if (exist) {
				if (!silentDuplicate) {
					this.toastStore.show({
						title: __("This coupon already used !"),
						color: "error",
					});
				}
				return;
			}
			const vm = this;
			frappe.call({
				method: "posawesome.posawesome.api.offers.get_pos_coupon",
				args: {
					coupon: normalizedCoupon,
					customer: vm.customer,
					company: vm.pos_profile.company,
				},
				callback: function (r) {
					if (r.message) {
						const res = r.message;
						if (res.msg != "Apply" || !res.coupon) {
							vm.toastStore.show({
								title: res.msg,
								color: "error",
							});
						} else {
							vm.new_coupon = null;
							const coupon = res.coupon;
							if (!vm.posa_coupons) vm.posa_coupons = [];
							vm.posa_coupons.push({
								coupon: coupon.name,
								coupon_code: coupon.coupon_code,
								type: coupon.coupon_type,
								applied: 0,
								pos_offer: coupon.pos_offer,
								customer: coupon.customer || vm.customer,
							});
						}
					}
				},
			});
		},
		setActiveGiftCoupons() {
			if (!this.customer) return;
			const vm = this;
			frappe.call({
				method: "posawesome.posawesome.api.offers.get_active_gift_coupons",
				args: {
					customer: vm.customer,
					company: vm.pos_profile.company,
				},
				callback: function (r) {
					if (r.message) {
						const coupons = r.message;
						coupons.forEach((coupon_code) => {
							vm.add_coupon(coupon_code, { silentDuplicate: true });
						});
					}
				},
			});
		},

		updatePosCoupons(offers) {
			if (!this.posa_coupons) return;
			const offerList = Array.isArray(offers) ? offers : [];
			this.posa_coupons.forEach((coupon) => {
				const offer = offerList.find((el) => el.offer_applied && el.coupon == coupon.coupon);
				if (offer) {
					coupon.applied = 1;
				} else {
					coupon.applied = 0;
				}
			});
		},

		removeCoupon(reomove_list) {
			if (!this.posa_coupons) return;
			this.posa_coupons = this.posa_coupons.filter((coupon) => !reomove_list.includes(coupon.coupon));
		},
		updateInvoice() {
			this.eventBus.emit("update_invoice_coupons", this.posa_coupons || []);
		},
		updateCounters() {
			// update store
			this.uiStore.setCouponCounts(this.couponsCount, this.appliedCouponsCount);
		},
	},

	watch: {
		posa_coupons: {
			deep: true,
			handler() {
				this.updateInvoice();
				this.updateCounters();
			},
		},
		selectedCustomer(newCustomer, oldCustomer) {
			if (newCustomer === oldCustomer && newCustomer === this.customer) {
				this.setActiveGiftCoupons();
				return;
			}
			const normalized = newCustomer || "";
			if (this.customer !== normalized) {
				const to_remove = [];
				(this.posa_coupons || []).forEach((el) => {
					if (el.type == "Promotional") {
						el.customer = normalized;
					} else {
						to_remove.push(el.coupon);
					}
				});
				this.customer = normalized;
				if (to_remove.length) {
					this.removeCoupon(to_remove);
				}
			}
			this.setActiveGiftCoupons();
		},
	},

	created: function () {
		this.$watch(
			() => this.uiStore.posProfile,
			(profile) => {
				if (profile) this.pos_profile = profile;
			},
			{ deep: true, immediate: true },
		);
		/*
		this.$nextTick(function () {
			this.eventBus.on("register_pos_profile", (data) => {
				this.pos_profile = data.pos_profile;
			});
		});
		*/
		this.eventBus.on("update_pos_coupons", (data) => {
			this.updatePosCoupons(data);
		});
		this.eventBus.on("set_pos_coupons", (data) => {
			this.posa_coupons = data;
		});
	},
};
</script>

<style scoped>
.coupon-input {
	height: 40px;
}

.add-coupon-btn {
	height: 40px;
	font-weight: 600 !important;
	transition: all 0.3s ease !important;
}

.add-coupon-btn:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}
</style>
