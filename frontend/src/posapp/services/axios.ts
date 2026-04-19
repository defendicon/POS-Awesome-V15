import axios from "axios";
import { LOADING_SCOPE_IDS, start, stop } from "../composables/core/useLoading";

const api = axios.create();

api.interceptors.request.use(
	(config) => {
		start(LOADING_SCOPE_IDS.action);
		return config;
	},
	(error) => {
		stop(LOADING_SCOPE_IDS.action);
		return Promise.reject(error);
	},
);

api.interceptors.response.use(
	(response) => {
		stop(LOADING_SCOPE_IDS.action);
		return response;
	},
	(error) => {
		stop(LOADING_SCOPE_IDS.action);
		return Promise.reject(error);
	},
);

export default api;
