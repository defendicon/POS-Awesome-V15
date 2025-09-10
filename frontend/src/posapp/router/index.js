import { createRouter, createWebHistory } from "vue-router";
import { start, stop } from "../composables/useLoading.js";

const routes = [];

const router = createRouter({
	history: createWebHistory(),
	routes,
});

router.beforeEach((to, from, next) => {
	start("route");
	next();
});

router.afterEach(() => {
	stop("route");
});

router.onError(() => {
	stop("route");
});

export default router;
