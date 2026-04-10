import { ref } from "vue";

import { createBootstrapSnapshotFromRegisterData } from "../../../offline/bootstrapSnapshot";

type OpeningDialogData = {
	companies?: Array<{ name?: string | null }> | null;
	pos_profiles_data?: Array<{
		name?: string | null;
		company?: string | null;
		[key: string]: any;
	}> | null;
	payments_method?: Array<{
		parent?: string | null;
		mode_of_payment?: string | null;
		currency?: string | null;
		[key: string]: any;
	}> | null;
} | null;

type RegisterSetupState = {
	stage: "idle" | "loading" | "ready" | "submitting" | "submitted" | "error";
	companies: string[];
	company: string;
	posProfiles: string[];
	posProfilesData: Array<Record<string, any>>;
	posProfile: string;
	paymentMethodData: Array<Record<string, any>>;
	paymentMethods: Array<Record<string, any>>;
	errorMessage: string | null;
	submittedRegisterData: any | null;
};

type CreateRegisterSetupPageOptions = {
	getCachedSetupData: () => OpeningDialogData;
	getServerSetupData: () => Promise<OpeningDialogData> | OpeningDialogData;
	saveSetupCache: (data: OpeningDialogData) => void;
	submitOpeningShift: (payload: {
		posProfile: string;
		company: string;
		balanceDetails: Array<Record<string, any>>;
	}) => Promise<any> | any;
	saveOpeningStorage: (data: any) => void;
	getBootstrapSnapshot: () => any;
	setBootstrapSnapshot: (snapshot: any) => void;
	buildVersion?: string | null;
};

function createInitialRegisterSetupState(): RegisterSetupState {
	return {
		stage: "idle",
		companies: [],
		company: "",
		posProfiles: [],
		posProfilesData: [],
		posProfile: "",
		paymentMethodData: [],
		paymentMethods: [],
		errorMessage: null,
		submittedRegisterData: null,
	};
}

function toCompanyNames(data: OpeningDialogData) {
	return (Array.isArray(data?.companies) ? data?.companies : [])
		.map((company) => String(company?.name || "").trim())
		.filter(Boolean);
}

function toPosProfilesData(data: OpeningDialogData) {
	return Array.isArray(data?.pos_profiles_data)
		? data.pos_profiles_data.map((profile) => ({ ...(profile || {}) }))
		: [];
}

function toPaymentMethodData(data: OpeningDialogData) {
	return Array.isArray(data?.payments_method)
		? data.payments_method.map((paymentMethod) => ({ ...(paymentMethod || {}) }))
		: [];
}

function buildProfileNamesForCompany(
	posProfilesData: Array<Record<string, any>>,
	company: string,
) {
	return posProfilesData
		.filter((profile) => String(profile.company || "") === company)
		.map((profile) => String(profile.name || "").trim())
		.filter(Boolean);
}

function buildPaymentMethodsForProfile(
	paymentMethodData: Array<Record<string, any>>,
	posProfile: string,
	existingPaymentMethods: Array<Record<string, any>> = [],
) {
	const existingAmounts = new Map(
		existingPaymentMethods.map((item) => [
			String(item.mode_of_payment || ""),
			Number(item.amount || 0),
		]),
	);

	return paymentMethodData
		.filter((paymentMethod) => String(paymentMethod.parent || "") === posProfile)
		.map((paymentMethod) => ({
			mode_of_payment: paymentMethod.mode_of_payment,
			amount: existingAmounts.get(String(paymentMethod.mode_of_payment || "")) || 0,
			currency: paymentMethod.currency,
		}));
}

function applySetupDataToState(
	state: RegisterSetupState,
	data: OpeningDialogData,
): RegisterSetupState {
	const companies = toCompanyNames(data);
	const posProfilesData = toPosProfilesData(data);
	const paymentMethodData = toPaymentMethodData(data);
	const nextCompany = companies.includes(state.company)
		? state.company
		: companies[0] || "";
	const posProfiles = buildProfileNamesForCompany(posProfilesData, nextCompany);
	const nextPosProfile = posProfiles.includes(state.posProfile)
		? state.posProfile
		: posProfiles[0] || "";
	const paymentMethods = buildPaymentMethodsForProfile(
		paymentMethodData,
		nextPosProfile,
		state.paymentMethods,
	);

	return {
		...state,
		stage: "ready",
		companies,
		company: nextCompany,
		posProfilesData,
		posProfiles,
		posProfile: nextPosProfile,
		paymentMethodData,
		paymentMethods,
		errorMessage: null,
	};
}

export function createRegisterSetupPage(
	options: CreateRegisterSetupPageOptions,
) {
	const state = ref<RegisterSetupState>(createInitialRegisterSetupState());

	function setCompany(company: string) {
		const posProfiles = buildProfileNamesForCompany(
			state.value.posProfilesData,
			company,
		);
		const nextPosProfile = posProfiles[0] || "";

		state.value = {
			...state.value,
			company,
			posProfiles,
			posProfile: nextPosProfile,
			paymentMethods: buildPaymentMethodsForProfile(
				state.value.paymentMethodData,
				nextPosProfile,
			),
		};
	}

	function setPosProfile(posProfile: string) {
		state.value = {
			...state.value,
			posProfile,
			paymentMethods: buildPaymentMethodsForProfile(
				state.value.paymentMethodData,
				posProfile,
				state.value.paymentMethods,
			),
		};
	}

	async function load() {
		state.value = {
			...state.value,
			stage: "loading",
			errorMessage: null,
		};

		const cachedSetupData = options.getCachedSetupData();
		if (cachedSetupData) {
			state.value = applySetupDataToState(state.value, cachedSetupData);
		}

		try {
			const serverSetupData = await Promise.resolve(options.getServerSetupData());
			if (serverSetupData) {
				state.value = applySetupDataToState(state.value, serverSetupData);
				options.saveSetupCache(serverSetupData);
				return state.value;
			}

			if (state.value.stage !== "ready") {
				state.value = {
					...state.value,
					stage: "ready",
				};
			}

			return state.value;
		} catch (error) {
			state.value = {
				...state.value,
				stage: "error",
				errorMessage:
					error instanceof Error
						? error.message
						: "Unable to load register setup data.",
			};
			return state.value;
		}
	}

	async function submit() {
		if (!state.value.company || !state.value.posProfile) {
			state.value = {
				...state.value,
				stage: "error",
				errorMessage: "Company and POS profile are required.",
			};
			return null;
		}

		state.value = {
			...state.value,
			stage: "submitting",
			errorMessage: null,
		};

		try {
			const submittedRegisterData = await Promise.resolve(
				options.submitOpeningShift({
					posProfile: state.value.posProfile,
					company: state.value.company,
					balanceDetails: state.value.paymentMethods.map((item) => ({ ...item })),
				}),
			);
			options.saveOpeningStorage(submittedRegisterData);
			options.setBootstrapSnapshot(
				createBootstrapSnapshotFromRegisterData(
					submittedRegisterData,
					options.getBootstrapSnapshot(),
					{ buildVersion: options.buildVersion || null },
				),
			);

			state.value = {
				...state.value,
				stage: "submitted",
				submittedRegisterData,
				errorMessage: null,
			};

			return submittedRegisterData;
		} catch (error) {
			state.value = {
				...state.value,
				stage: "error",
				errorMessage:
					error instanceof Error
						? error.message
						: "Unable to submit register setup.",
			};
			return null;
		}
	}

	return {
		state,
		load,
		setCompany,
		setPosProfile,
		submit,
	};
}
