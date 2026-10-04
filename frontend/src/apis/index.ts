import axios from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";

export interface ApiEnvelope<T> {
	error: false;
	data: T;
	message: string;
}

export interface ApiErrorEnvelope {
	error: true;
	data: null;
	message: string;
	code: string;
	details?: unknown[];
}

export function unwrapApiResponse<T>(
	response: AxiosResponse<ApiEnvelope<T>>,
): T {
	return response.data.data;
}

const apiClient = axios.create({
	baseURL: import.meta.env.VITE_API_BASE_URL || undefined,
	withCredentials: true,
	headers: {
		Accept: "application/json",
		"Content-Type": "application/json",
	},
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
	if (["POST", "PUT", "PATCH", "DELETE"].includes(config.method?.toUpperCase() ?? "")) {
		const csrfCookie = document.cookie
			.split(";")
			.map((part) => part.trim())
			.find((part) => part.startsWith("bk_uni_csrf="));
		if (csrfCookie) {
			config.headers.set("X-CSRF-Token", decodeURIComponent(csrfCookie.slice("bk_uni_csrf=".length)));
		}
	}
	return config;
});

export default apiClient;
