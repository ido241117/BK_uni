import axios from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type {
	AdminCurriculum,
	AnalysisHistoryDetail,
	AnalysisHistoryItem,
	AnalysisSnapshot,
	CourseRule,
	CourseRecommendationResponse,
	CurriculumCourse,
	CurriculumSource,
	CurriculumStructure,
	CurriculumTerm,
	ElectiveGroup,
	PageResult,
	CourseStatus,
	RecommendationSettings,
} from "@/types";

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

async function getCsrf() {
	await apiClient.get("/auth/csrf");
}

async function post<T>(path: string, body: unknown) {
	await getCsrf();
	return unwrapApiResponse(await apiClient.post<ApiEnvelope<T>>(path, body));
}

async function postEmpty<T>(path: string) {
	await getCsrf();
	return unwrapApiResponse(await apiClient.post<ApiEnvelope<T>>(path));
}

async function patch<T>(path: string, body: unknown) {
	await getCsrf();
	return unwrapApiResponse(await apiClient.patch<ApiEnvelope<T>>(path, body));
}

async function put<T>(path: string, body: unknown) {
	await getCsrf();
	return unwrapApiResponse(await apiClient.put<ApiEnvelope<T>>(path, body));
}

async function remove(path: string) {
	await getCsrf();
	await apiClient.delete(path);
}

export interface CurriculumInput {
	name: string;
	description?: string | null;
	source: CurriculumSource;
	recommendationSettings?: RecommendationSettings | null;
}

export interface TermInput {
	code: string;
	name: string;
	sortOrder: number;
}

export interface ElectiveGroupInput {
	name: string;
	sortOrder: number;
	requiredCredits?: number | null;
	requiredCourses?: number | null;
}

export interface CourseInput {
	code: string;
	version?: string;
	name: string;
	nameEn?: string | null;
	credits: number;
	recommendationPriority: number;
	termId: string;
	requirementType: 'required' | 'elective';
	electiveGroupId?: string | null;
}

export interface StudentProfile {
	id: string;
	displayName: string | null;
	curriculumId: string | null;
}

export interface StudentCourse extends CurriculumCourse {
	status: CourseStatus;
}

export type CourseRuleInput = Omit<CourseRule, 'id'>;

export const curriculumApi = {
	listAdmin(params: { limit?: number; offset?: number; q?: string } = {}) {
		return apiClient
			.get<ApiEnvelope<PageResult<AdminCurriculum>>>("/admin/curricula", { params })
			.then(unwrapApiResponse);
	},
	structure(curriculumId: string) {
		return apiClient
			.get<ApiEnvelope<CurriculumStructure>>(`/curricula/${curriculumId}/structure`)
			.then(unwrapApiResponse);
	},
	courses(curriculumId: string, params: { limit?: number; offset?: number } = {}) {
		return apiClient
			.get<ApiEnvelope<PageResult<StudentCourse>>>(`/curricula/${curriculumId}/courses`, {
				params: { limit: 100, ...params },
			})
			.then(unwrapApiResponse);
	},
	listStudent() {
		return apiClient
			.get<ApiEnvelope<PageResult<AdminCurriculum>>>("/curricula", { params: { limit: 100 } })
			.then(unwrapApiResponse);
	},
	createCurriculum(input: CurriculumInput) {
		return post<AdminCurriculum>("/admin/curricula", input);
	},
	updateCurriculum(id: string, input: Partial<CurriculumInput>) {
		return patch<AdminCurriculum>(`/admin/curricula/${id}`, input);
	},
	createTerm(id: string, input: TermInput) {
		return post<CurriculumTerm>(`/admin/curricula/${id}/terms`, input);
	},
	updateTerm(id: string, termId: string, input: Partial<TermInput>) {
		return patch<CurriculumTerm>(`/admin/curricula/${id}/terms/${termId}`, input);
	},
	deleteTerm(id: string, termId: string) {
		return remove(`/admin/curricula/${id}/terms/${termId}`);
	},
	createGroup(id: string, input: ElectiveGroupInput) {
		return post<ElectiveGroup>(`/admin/curricula/${id}/elective-groups`, input);
	},
	updateGroup(id: string, groupId: string, input: Partial<ElectiveGroupInput>) {
		return patch<ElectiveGroup>(`/admin/curricula/${id}/elective-groups/${groupId}`, input);
	},
	deleteGroup(id: string, groupId: string) {
		return remove(`/admin/curricula/${id}/elective-groups/${groupId}`);
	},
	createCourse(id: string, input: CourseInput) {
		return post<CurriculumCourse>(`/admin/curricula/${id}/courses`, input);
	},
	updateCourse(id: string, courseId: string, input: Partial<CourseInput>) {
		return patch<CurriculumCourse>(`/admin/curricula/${id}/courses/${courseId}`, input);
	},
	deleteCourse(id: string, courseId: string) {
		return remove(`/admin/curricula/${id}/courses/${courseId}`);
	},
	rules(id: string, courseId: string) {
		return apiClient
			.get<ApiEnvelope<CourseRule[]>>(`/admin/curricula/${id}/courses/${courseId}/rules`)
			.then(unwrapApiResponse);
	},
	createRule(id: string, courseId: string, input: CourseRuleInput) {
		return post<CourseRule>(`/admin/curricula/${id}/courses/${courseId}/rules`, input);
	},
	updateRule(id: string, courseId: string, ruleId: string, input: Partial<CourseRuleInput>) {
		return patch<CourseRule>(`/admin/curricula/${id}/courses/${courseId}/rules/${ruleId}`, input);
	},
	deleteRule(id: string, courseId: string, ruleId: string) {
		return remove(`/admin/curricula/${id}/courses/${courseId}/rules/${ruleId}`);
	},
};

export const studentApi = {
	profile() {
		return apiClient.get<ApiEnvelope<StudentProfile>>("/me/profile").then(unwrapApiResponse);
	},
	updateProfile(input: { displayName?: string | null; curriculumId?: string | null }) {
		return put<StudentProfile>("/me/profile", input);
	},
	deleteProfile() {
		return remove("/me/profile");
	},
	updateStatuses(items: Array<{ courseId: string; status: CourseStatus }>) {
		return patch<{ updated: number }>("/me/profile/course-statuses", { items });
	},
	courseRecommendations() {
		return postEmpty<CourseRecommendationResponse>("/me/profile/course-recommendations");
	},
};

export const analysisApi = {
	run() {
		return postEmpty<AnalysisSnapshot>('/me/profile/analyses');
	},
	history(params: { limit?: number; offset?: number } = {}) {
		return apiClient
			.get<ApiEnvelope<PageResult<AnalysisHistoryItem>>>(
				'/me/profile/analyses',
				{ params },
			)
			.then(unwrapApiResponse);
	},
	detail(analysisId: string) {
		return apiClient
			.get<ApiEnvelope<AnalysisHistoryDetail>>(
				`/me/profile/analyses/${analysisId}`,
			)
			.then(unwrapApiResponse);
	},
};

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
