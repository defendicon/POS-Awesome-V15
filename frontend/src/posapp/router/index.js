import { createRouter, createWebHistory } from "vue-router";
import { start, stop } from "../composables/useLoading.js";

const routes = [
	{ path: "/", redirect: "/pos" },
	{
		path: "/pos",
		component: () => import("../components/pos/Pos.vue"),
		meta: { title: "POS" }
	},
	{
		path: "/orders",
		component: () => import("../components/pos/PurchaseOrders.vue"),
		meta: { title: "Orders" }
	},
	{
		path: "/payments",
		component: () => import("../components/payments/Pay.vue"),
		meta: { title: "Payments" }
	},
	{
		path: "/reports",
		component: () => import("@/posapp/components/reports/Reports.vue"),
		meta: { title: "Reports" }
	},
	{
		path: "/barcode",
		component: () => import("../components/pos/BarcodePrinting.vue"),
		meta: { title: "Barcode Printing" }
	},
	{
		path: "/closing",
		component: () => import("../components/pos/ClosingDialog.vue"),
		meta: { title: "Close Shift" }
	}
];

const router = createRouter({
	history: createWebHistory("/app/posapp"),
	routes,
});

router.beforeEach((to, from, next) => {
	start("route");
	next();
});

router.afterEach(() => {
	stop("route");
	// Reset scroll position
	window.scrollTo(0, 0);
});

router.onError(() => {
	stop("route");
});

export default router;
