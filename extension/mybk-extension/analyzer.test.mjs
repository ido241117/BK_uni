import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzeCurriculum, parseIndices, pickByIndices } from './analyzer.mjs';

const fixture = {
	semesters: [
		{
			number: 1,
			requiredCourses: [
				{ courseCode: 'CO1005', nameVi: 'Nhập môn Điện toán', credits: 3 },
				{ courseCode: 'MT1003', nameVi: 'Giải tích 1', credits: 4 },
			],
			electiveGroups: [],
		},
		{
			number: 2,
			requiredCourses: [
				{ courseCode: 'CO1007', nameVi: 'Cấu trúc rời rạc', credits: 4 },
			],
			electiveGroups: [
				{
					group: 'A',
					creditsRequired: 6,
					courses: [
						{ courseCode: 'CO2001', nameVi: 'Tự chọn 1', credits: 3 },
						{ courseCode: 'CO2003', nameVi: 'Tự chọn 2', credits: 3 },
					],
				},
			],
		},
	],
};

test('lists missing required courses before remaining elective choices', () => {
	const missing = analyzeCurriculum(fixture, [
		{ courseCode: 'MT1003', status: 'completed' },
		{ courseCode: 'CO2001', status: 'in_progress' },
	]);
	assert.deepEqual(missing.map((course) => course.courseCode), [
		'CO1005',
		'CO1007',
		'CO2003',
	]);
	assert.equal(missing[2].groupName, 'Nhóm A');
});

test('accepts selected course indices and ignores duplicates', () => {
	const missing = analyzeCurriculum(fixture, []);
	const indices = parseIndices('4, 1;4', missing.length);
	assert.deepEqual(
		pickByIndices(missing, indices).map((course) => course.courseCode),
		['CO1005', 'CO2001'],
	);
});

test('rejects an out-of-range index', () => {
	assert.throws(() => parseIndices('4', 3), RangeError);
});

test('loads the requested draft curriculum shape', async () => {
	const curriculum = JSON.parse(
		await readFile(new URL('./curriculum.json', import.meta.url), 'utf8'),
	);
	const missing = analyzeCurriculum(curriculum, []);
	assert.equal(curriculum.source.programName, 'Khoa học Máy tính');
	assert.ok(missing.length > 0);
	assert.equal(missing[0].requirementType, 'required');
});