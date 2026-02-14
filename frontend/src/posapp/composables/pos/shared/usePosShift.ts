import { ref, getCurrentInstance, inject } from "vue";
import { useToastStore } from "../../../stores/toastStore.js";
import { useUIStore } from "../../../stores/uiStore.js";
import {
	initPromise,
	checkDbHealth,
	getOpeningStorage,
	setOpeningStorage,
	clearOpeningStorage,
	setTaxTemplate,
	isOffline,
} from "../../../../offline/index";

declare const frappe: any;

export function usePosShift(openDialog?: () => void) {
	const instance = getCurrentInstance();
	const proxy: any = instance?.proxy;
	const eventBus: any = proxy?.eventBus || inject("eventBus");
	const toastStore = useToastStore();
	const uiStore = useUIStore();

	const pos_profile = ref<any>(null);
	const pos_opening_shift = ref<any>(null);

	const isCachedOpeningValidForCurrentUser = (data: any) => {
		if (!data || !data.pos_profile || !data.pos_opening_shift) {
			return false;
		}
		const currentUser = frappe?.session?.user;
		const cachedUser = data?.pos_opening_shift?.user;
		if (!currentUser || !cachedUser) {
			return false;
		}
		return currentUser === cachedUser;
	};

	async function check_opening_entry() {
		await initPromise;
		await checkDbHealth();
		return frappe
			.call("posawesome.posawesome.api.shifts.check_opening_shift", {
				user: frappe.session.user,
			})
			.then((r: any) => {
				if (r.message) {
					pos_profile.value = r.message.pos_profile;
					pos_opening_shift.value = r.message.pos_opening_shift;
					if (pos_profile.value.taxes_and_charges) {
						frappe.call({
							method: "frappe.client.get",
							args: {
								doctype: "Sales Taxes and Charges Template",
								name: pos_profile.value.taxes_and_charges,
							},
							callback: (res: any) => {
								if (res.message) {
									setTaxTemplate(
										pos_profile.value.taxes_and_charges,
										res.message,
									);
								}
							},
						});
					}
					uiStore.setRegisterData(r.message);

					try {
						frappe.realtime.emit("pos_profile_registered");
					} catch (e) {
						console.warn("Realtime emit failed", e);
					}
					console.info("LoadPosProfile");
					try {
						setOpeningStorage(r.message);
					} catch (e) {
						console.error("Failed to cache opening data", e);
					}
				} else {
					console.info("No opening shift found, opening dialog");
					clearOpeningStorage();
					openDialog && openDialog();
				}
			})
			.catch((err: unknown) => {
				console.error("Error checking opening entry", err);
				const data: any = getOpeningStorage();
				if (isOffline() && isCachedOpeningValidForCurrentUser(data)) {
					pos_profile.value = data.pos_profile;
					pos_opening_shift.value = data.pos_opening_shift;
					uiStore.setRegisterData(data);

					try {
						frappe.realtime.emit("pos_profile_registered");
					} catch (e) {
						console.warn("Realtime emit failed", e);
					}
					console.info("LoadPosProfile (cached)");
					return;
				}
				if (!isOffline()) {
					clearOpeningStorage();
				}
				openDialog && openDialog();
			});
	}

	function get_closing_data() {
		const cachedOpeningShift = (getOpeningStorage() as any)
			?.pos_opening_shift;
		if (!pos_opening_shift.value && cachedOpeningShift) {
			pos_opening_shift.value = cachedOpeningShift;
		}
		if (!pos_opening_shift.value) {
			return Promise.resolve();
		}
		return frappe
			.call(
				"posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.make_closing_shift_from_opening",
				{ opening_shift: pos_opening_shift.value },
			)
			.then((r: any) => {
				if (r.message) {
					eventBus?.emit("open_ClosingDialog", r.message);
				}
			});
	}

	function submit_closing_pos(data: any) {
		console.log("Submitting closing shift", data);
		frappe
			.call(
				"posawesome.posawesome.doctype.pos_closing_shift.pos_closing_shift.submit_closing_shift",
				{
					closing_shift: JSON.stringify(data),
				},
			)
			.then((r: any) => {
				console.log("Submit result", r);
				if (r.message) {
					pos_profile.value = null;
					pos_opening_shift.value = null;
					clearOpeningStorage();
					toastStore.show({
						title: "POS Shift Closed",
						color: "success",
					});
					check_opening_entry();
				}
			})
			.catch((err: unknown) => {
				console.error("Failed to submit closing shift", err);
			});
	}

	return {
		pos_profile,
		pos_opening_shift,
		check_opening_entry,
		get_closing_data,
		submit_closing_pos,
	};
}
