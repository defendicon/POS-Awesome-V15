import axios from "axios";
import { start, stop } from "../composables/useLoading.js";

const api = axios.create();

api.interceptors.request.use(
	(config) => {
		start("api");
		return config;
	},
	(error) => {
		stop("api");
		return Promise.reject(error);
	},
);

api.interceptors.response.use(
	(response) => {
		stop("api");
		return response;
	},
	(error) => {
		stop("api");
		return Promise.reject(error);
	},
);

export default api;
