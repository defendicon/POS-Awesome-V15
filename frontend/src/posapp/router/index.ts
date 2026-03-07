import { createRouter, createWebHistory } from "vue-router";
import { start, stop } from "../composables/core/useLoading";
import { recoverFromChunkLoadError } from "../utils/chunkLoadRecovery";

const routes = [
	{ path: "/", redirect: "/pos" },
	{
		path: "/pos",
		component: () => import("../components/pos/shell/Pos.vue"),
		meta: { title: "POS", layout: "default" },
	},
	{
		path: "/orders",
		component: () =>
			import("../components/pos/purchase/PurchaseOrders.vue"),
		meta: { title: "Orders", layout: "default" },
	},
	{
		path: "/payments",
		component: () => import("../components/pos/shell/PayView.vue"),
		meta: { title: "Payments", layout: "default" },
	},
	{
		path: "/dashboard",
		component: () => import("@/posapp/components/reports/Reports.vue"),
		meta: { title: "Awesome Dashboard", layout: "default" },
	},
	{
		path: "/reports",
		component: () => import("@/posapp/components/reports/Reports.vue"),
		meta: { title: "Reports", layout: "default" },
	},
	{
		path: "/barcode",
		component: () => import("../components/pos/shell/BarcodePrinting.vue"),
		meta: { title: "Barcode Printing", layout: "default" },
	},
	{
		path: "/cash-movement",
		component: () => import("../components/pos/cash/CashMovementView.vue"),
		meta: { title: "Cash Movement", layout: "default" },
	},
	{
		path: "/closing",
		component: () => import("../components/pos/shell/ClosingDialog.vue"),
		meta: { title: "Close Shift", layout: "default" },
	},
	{
		path: "/customer-display",
		component: () =>
			import("../components/customer_display/CustomerDisplay.vue"),
		meta: { title: "Customer Display", layout: "display" },
	},
	{
		path: "/:pathMatch(.*)*",
		redirect: "/pos",
	},
];

const createPosAppRouter = () => {
	const history = createWebHistory("/app/posapp");
	const router = createRouter({
		history,
		routes,
	});

	router.beforeEach((_to, _from, next) => {
		start("route");
		next();
	});

	router.afterEach(() => {
		stop("route");
		window.scrollTo(0, 0);
	});

	router.onError((error) => {
		stop("route");
		void recoverFromChunkLoadError(error, "router");
	});

	return { router, history };
};

export { createPosAppRouter };
export default createPosAppRouter;
