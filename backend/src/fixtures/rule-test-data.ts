export type RuleTestStatus = 'not_started' | 'in_progress' | 'completed';

export type RuleTestRule =
	| { type: 'prerequisite'; courseCode: string }
	| { type: 'minimum_credits'; minimumCredits: number };

export type RuleTestCourse = {
	code: string;
	name: string;
	credits: number;
	termCode: string;
	requirementType: 'required' | 'elective';
	electiveGroup?: string;
	recommendationPriority: number;
	rules: RuleTestRule[];
};

export type RuleTestCurriculum = {
	id: string;
	name: string;
	description: string;
	terms: Array<{ id: string; code: string; name: string; sortOrder: number }>;
	electiveGroup?: {
		id: string;
		name: string;
		requiredCredits: number;
		requiredCourses: number;
	};
	courses: Array<RuleTestCourse & { id: string }>;
};

export const ruleTestCurricula: RuleTestCurriculum[] = [
	{
		id: '10000000-0000-4000-8000-000000000001',
		name: 'Rule Test - Prerequisite',
		description: 'Synthetic data for prerequisite rule test cases.',
		terms: [
			{ id: '11000000-0000-4000-8000-000000000001', code: '1', name: 'Term 1', sortOrder: 1 },
			{ id: '11000000-0000-4000-8000-000000000002', code: '2', name: 'Term 2', sortOrder: 2 },
		],
		courses: [
			{ id: '13000000-0000-4000-8000-000000000001', code: 'PR101', name: 'Prerequisite Foundations', credits: 3, termCode: '1', requirementType: 'required', recommendationPriority: 0, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000002', code: 'PR102', name: 'Prerequisite Applications', credits: 3, termCode: '1', requirementType: 'required', recommendationPriority: 1, rules: [{ type: 'prerequisite', courseCode: 'PR101' }] },
			{ id: '13000000-0000-4000-8000-000000000003', code: 'PR201', name: 'Advanced Prerequisite Applications', credits: 3, termCode: '2', requirementType: 'required', recommendationPriority: 0, rules: [{ type: 'prerequisite', courseCode: 'PR102' }, { type: 'minimum_credits', minimumCredits: 6 }] },
			{ id: '13000000-0000-4000-8000-000000000004', code: 'PR202', name: 'Systems Practice', credits: 3, termCode: '2', requirementType: 'required', recommendationPriority: 1, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000005', code: 'PR203', name: 'Technical Communication', credits: 3, termCode: '2', requirementType: 'required', recommendationPriority: 2, rules: [] },
		],
	},
	{
		id: '10000000-0000-4000-8000-000000000002',
		name: 'Rule Test - Minimum Credits',
		description: 'Synthetic data for minimum accumulated credits rule test cases.',
		terms: [
			{ id: '11000000-0000-4000-8000-000000000011', code: '1', name: 'Term 1', sortOrder: 1 },
			{ id: '11000000-0000-4000-8000-000000000012', code: '2', name: 'Term 2', sortOrder: 2 },
		],
		courses: [
			{ id: '13000000-0000-4000-8000-000000000011', code: 'CR101', name: 'Credit Foundations', credits: 3, termCode: '1', requirementType: 'required', recommendationPriority: 0, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000012', code: 'CR102', name: 'Credit Applications', credits: 3, termCode: '1', requirementType: 'required', recommendationPriority: 1, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000013', code: 'CR103', name: 'Credit Practice', credits: 3, termCode: '1', requirementType: 'required', recommendationPriority: 2, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000014', code: 'CR201', name: 'Six-Credit Threshold Course', credits: 3, termCode: '2', requirementType: 'required', recommendationPriority: 0, rules: [{ type: 'minimum_credits', minimumCredits: 6 }] },
			{ id: '13000000-0000-4000-8000-000000000015', code: 'CR202', name: 'Capstone Practice', credits: 3, termCode: '2', requirementType: 'required', recommendationPriority: 1, rules: [] },
		],
	},
	{
		id: '10000000-0000-4000-8000-000000000003',
		name: 'Rule Test - AND and Electives',
		description: 'Synthetic data for combined rules and elective progress test cases.',
		terms: [
			{ id: '11000000-0000-4000-8000-000000000021', code: '1', name: 'Term 1', sortOrder: 1 },
			{ id: '11000000-0000-4000-8000-000000000022', code: '2', name: 'Term 2', sortOrder: 2 },
		],
		electiveGroup: {
			id: '12000000-0000-4000-8000-000000000001',
			name: 'Rule Test Electives',
			requiredCredits: 3,
			requiredCourses: 1,
		},
		courses: [
			{ id: '13000000-0000-4000-8000-000000000021', code: 'AN101', name: 'Analysis Foundations', credits: 3, termCode: '1', requirementType: 'required', recommendationPriority: 0, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000022', code: 'AN102', name: 'Analysis Methods', credits: 3, termCode: '1', requirementType: 'required', recommendationPriority: 1, rules: [{ type: 'prerequisite', courseCode: 'AN101' }] },
			{ id: '13000000-0000-4000-8000-000000000023', code: 'AN201', name: 'Integrated Analysis', credits: 3, termCode: '2', requirementType: 'required', recommendationPriority: 0, rules: [{ type: 'prerequisite', courseCode: 'AN102' }, { type: 'minimum_credits', minimumCredits: 6 }] },
			{ id: '13000000-0000-4000-8000-000000000024', code: 'AN202', name: 'Analysis Project', credits: 3, termCode: '2', requirementType: 'required', recommendationPriority: 1, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000025', code: 'AN-E01', name: 'Analysis Elective One', credits: 3, termCode: '2', requirementType: 'elective', electiveGroup: 'Rule Test Electives', recommendationPriority: 0, rules: [] },
			{ id: '13000000-0000-4000-8000-000000000026', code: 'AN-E02', name: 'Analysis Elective Two', credits: 3, termCode: '2', requirementType: 'elective', electiveGroup: 'Rule Test Electives', recommendationPriority: 1, rules: [] },
		],
	},
];

export const ruleTestProfiles: Array<{
	email: string;
	displayName: string;
	curriculumId: string;
	statuses: Record<string, RuleTestStatus>;
}> = [
		{
			email: 'prerequisite-pass@demo.test',
			displayName: 'Test Prerequisite Pass',
			curriculumId: ruleTestCurricula[0].id,
			statuses: { PR101: 'completed' },
		},
		{
			email: 'prerequisite-fail@demo.test',
			displayName: 'Test Prerequisite Fail',
			curriculumId: ruleTestCurricula[0].id,
			statuses: {},
		},
		{
			email: 'credits-fail@demo.test',
			displayName: 'Test Credits Fail',
			curriculumId: ruleTestCurricula[1].id,
			statuses: { CR101: 'completed' },
		},
		{
			email: 'credits-pass@demo.test',
			displayName: 'Test Credits Pass',
			curriculumId: ruleTestCurricula[1].id,
			statuses: { CR101: 'completed', CR102: 'in_progress' },
		},
		{
			email: 'combined-rule-fail@demo.test',
			displayName: 'Test Combined Rule Fail',
			curriculumId: ruleTestCurricula[2].id,
			statuses: { AN101: 'completed' },
		},
		{
			email: 'combined-rule-pass@demo.test',
			displayName: 'Test Combined Rule Pass',
			curriculumId: ruleTestCurricula[2].id,
			statuses: { AN101: 'completed', AN102: 'completed', AN202: 'in_progress', 'AN-E01': 'completed' },
		},
	];