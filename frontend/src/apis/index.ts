import axios from "axios";
import type { AxiosResponse } from "axios";

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

export default apiClient;
