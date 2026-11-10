/** Kiểu dữ liệu của "Tư vấn với AI" (khớp `Backend/src/advisor`). */

export type AdvisorStepRole = 'system' | 'context' | 'user' | 'assistant' | 'tool' | 'answer' | 'error';

export interface AdvisorToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface AdvisorStep {
    id: string;
    created_at: string;
    session_id: string;
    turn: number;
    seq: number;
    role: AdvisorStepRole;
    content: string | null;
    reasoning: string | null;
    tool_calls: AdvisorToolCall[] | null;
    tool_call_id: string | null;
    tool_name: string | null;
    tool_args: unknown;
    data: unknown;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    cache_hit_tokens: number | null;
    duration_ms: number | null;
}

export interface AdvisorSession {
    id: string;
    created_at: string;
    updated_at: string;
    title: string;
    model: string;
}

export interface AdvisorSessionDetail extends AdvisorSession {
    steps: AdvisorStep[];
}

export type OfferingVerdict = 'confirmed' | 'not_offered' | 'likely' | 'uncertain' | 'unlikely' | 'never' | 'no_data';

export interface AdvisorOffering {
    semester: string;
    verdict: OfferingVerdict;
    note: string;
    recent_same_term: string[];
    opened_same_term_recent: string[];
    last_opened: string | null;
}

export interface AdvisorRecommendation {
    code: string;
    name: string;
    credits: number | null;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    in_curriculum: boolean;
    eligible: boolean | null;
    missing: string[];
    offering: AdvisorOffering | null;
    /** Tóm tắt đề cương (bản áp dụng cho học kỳ tới); `null` khi môn chưa có đề cương. */
    outline: {
        version: string;
        study_hours: number | null;
        has_lab: boolean;
        has_project: boolean;
        final_exam: { format: string | null; duration_minutes: number | null } | null;
    } | null;
}

export interface AdvisorChoice {
    id: string;
    question: string;
    type: 'single' | 'multiple' | 'text';
    options: { value: string; label: string; description?: string }[];
}

export interface AdvisorAnswer {
    message: string;
    recommendations: AdvisorRecommendation[];
    choices: AdvisorChoice[];
    suggestions: string[];
    notes: string[];
    source: 'tool' | 'json_mode';
}

export interface AdvisorChoiceAnswer {
    id: string;
    question: string;
    values: string[];
    text?: string;
}

export interface SendAdvisorMessagePayload {
    session_id?: string;
    message: string;
    snapshot?: Record<string, unknown>;
    answers?: AdvisorChoiceAnswer[];
}

export interface AdvisorTurnResult {
    session: AdvisorSession;
    steps: AdvisorStep[];
}
