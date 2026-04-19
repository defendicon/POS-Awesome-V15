import { createRouter, createWebHistory } from "vue-router";
import {
	startRouteLoading,
	stopRouteLoading,
} from "../composables/core/useLoading";
import {
	isDynamicImportFailure,
	recoverFromChunkLoadError,
} from "../utils/chunkLoadRecovery";
import { resolvePosAppRouteFullPath } from "../../loader-utils";
import OfflineRouteUnavailable from "../components/system/OfflineRouteUnavailable.vue";

const OFFLINE_ROUTE_UNAVAILABLE_NAME = "offline-route-unavailable";

const routes = [
	{ path: "/", redirect: "/pos" },
	{
		path: "/pos",
		component: () => import("../components/pos/shell/Pos.vue"),
		meta: { title: "POS", layout: "default", loadingMessage: "Loading POS..." },
	},
	{
		path: "/orders",
		component: () =>
			import("../components/pos/purchase/PurchaseOrders.vue"),
		meta: { title: "Orders", layout: "default", loadingMessage: "Loading orders..." },
	},
	{
		path: "/payments",
		component: () => import("../components/pos/shell/PayView.vue"),
		meta: { title: "Payments", layout: "default", loadingMessage: "Loading payments..." },
	},
	{
		path: "/gift-cards",
		component: () => import("../components/pos/wallet/GiftCardsView.vue"),
		meta: {
			title: "Gift Cards",
			layout: "default",
			loadingMessage: "Loading gift cards...",
		},
	},
	{
		path: "/dashboard",
		component: () => import("@/posapp/components/reports/Reports.vue"),
		meta: {
			title: "Awesome Dashboard",
			layout: "default",
			loadingMessage: "Loading dashboard...",
		},
	},
	{
		path: "/reports",
		component: () => import("@/posapp/components/reports/Reports.vue"),
		meta: { title: "Reports", layout: "default", loadingMessage: "Loading reports..." },
	},
	{
		path: "/barcode",
		component: () => import("../components/pos/shell/BarcodePrinting.vue"),
		meta: {
			title: "Barcode Printing",
			layout: "default",
			loadingMessage: "Loading barcode printing...",
		},
	},
	{
		path: "/cash-movement",
		component: () => import("../components/pos/cash/CashMovementView.vue"),
		meta: {
			title: "Cash Movement",
			layout: "default",
			loadingMessage: "Loading cash movement...",
		},
	},
	{
		path: "/closing",
		component: () => import("../components/pos/shell/ClosingDialog.vue"),
		meta: {
			title: "Close Shift",
			layout: "default",
			loadingMessage: "Loading close shift...",
		},
	},
	{
		path: "/customer-display",
		component: () =>
			import("../components/customer_display/CustomerDisplay.vue"),
		meta: {
			title: "Customer Display",
			layout: "display",
			loadingMessage: "Loading customer display...",
		},
	},
	{
		path: "/offline-route-unavailable",
		name: OFFLINE_ROUTE_UNAVAILABLE_NAME,
		component: OfflineRouteUnavailable,
		meta: {
			title: "Route Unavailable",
			layout: "default",
			loadingMessage: "Loading route fallback...",
		},
	},
	{
		path: "/:pathMatch(.*)*",
		redirect: "/pos",
	},
];

export function resolveRouteLoadFailureAction({
	error,
	isOnline,
	pendingRouteFullPath,
}: {
	error: unknown;
	isOnline: boolean;
	pendingRouteFullPath?: string | null;
}):
	| { type: "unhandled" }
	| { type: "chunk-recovery" }
	| { type: "offline-fallback"; target: string } {
	if (!isDynamicImportFailure(error)) {
		return { type: "unhandled" };
	}

	if (!isOnline && pendingRouteFullPath) {
		return {
			type: "offline-fallback",
			target: pendingRouteFullPath,
		};
	}

	return { type: "chunk-recovery" };
}

export function resolveRouteLoadingMessage(
	route: { meta?: Record<string, unknown> } | null | undefined,
) {
	const explicitMessage = route?.meta?.loadingMessage;
	if (typeof explicitMessage === "string" && explicitMessage.trim()) {
		return explicitMessage;
	}

	const title = route?.meta?.title;
	if (typeof title === "string" && title.trim()) {
		return `Loading ${title}...`;
	}

	return "Loading view...";
}

const createPosAppRouter = () => {
	const history = createWebHistory("/app/posapp");
	const router = createRouter({
		history,
		routes,
	});
	let pendingRouteFullPath: string | null = null;

	router.beforeEach((to, _from, next) => {
		pendingRouteFullPath = to.fullPath || "/";
		startRouteLoading({
			message: resolveRouteLoadingMessage(to),
		});
		next();
	});

	router.afterEach(() => {
		pendingRouteFullPath = null;
		stopRouteLoading();
		window.scrollTo(0, 0);
	});

	router.onError((error) => {
		stopRouteLoading();
		const currentWindowRoute =
			typeof window !== "undefined"
				? resolvePosAppRouteFullPath(window.location)
				: null;
		const failureAction = resolveRouteLoadFailureAction({
			error,
			isOnline:
				typeof navigator === "undefined" ? true : navigator.onLine,
			pendingRouteFullPath: pendingRouteFullPath || currentWindowRoute,
		});

		if (failureAction.type === "offline-fallback") {
			const target = failureAction.target;
			console.warn(
				"Route load failed offline; showing unavailable fallback",
				{
					target,
					error,
				},
			);
			void router.replace({
				name: OFFLINE_ROUTE_UNAVAILABLE_NAME,
				query: {
					target,
				},
			});
			return;
		}

		if (failureAction.type === "chunk-recovery") {
			void recoverFromChunkLoadError(error, "router");
		}
	});

	return { router, history };
};

export { createPosAppRouter };
export default createPosAppRouter;
