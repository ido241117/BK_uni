import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMyBkGradeTable, parseMyBkTranscript } from './mybk-parser.mjs';

const headers = ['Stt', 'Mã môn học', 'Tên môn học', 'Điểm số', 'Điểm chữ', 'Tín chỉ', 'Đạt', 'Ghi chú'];

function courseRow({ code, name, score = '--', letterGrade = '--', passedClass = '', iconClass = '' }) {
	const cells = [
		{ text: '1' },
		{ text: code, dataMamh: code },
		{ text: name },
		{ text: score },
		{ text: letterGrade },
		{ text: '3' },
		{ text: '', className: passedClass, iconClassName: iconClass },
		{ text: '' },
	];
	return { cells, text: cells.map((cell) => cell.text).join(' ') };
}

function parseRows(rows) {
	return parseMyBkTranscript({ tables: [{ headers, rows }] }).courses;
}

test('reads the myBK Đạt check icon as completed', () => {
	const [course] = parseRows([
		courseRow({
			code: 'CO1007',
			name: 'Cấu trúc Rời rạc',
			score: '7.1',
			letterGrade: 'B',
			iconClass: 'fa-solid fa-check',
		}),
	]);
	assert.equal(course.status, 'completed');
	assert.equal(course.courseCode, 'CO1007');
	assert.match(course.rawStatus, /Đạt/);
	assert.doesNotMatch(course.rawStatus, /fa-solid/);
});

test('reads empty grade and Đạt cells as not started', () => {
	const [course] = parseRows([
		courseRow({ code: 'IM1023', name: 'Quản lý Sản xuất', score: '--', letterGrade: '--' }),
	]);
	assert.equal(course.status, 'not_started');
});

test('reads an F grade without the Đạt check as not started', () => {
	const [course] = parseRows([
		courseRow({ code: 'CO3101', name: 'Đồ án Tổng hợp', score: '3', letterGrade: 'F' }),
	]);
	assert.equal(course.status, 'not_started');
});

test('skips group summary rows without course codes', () => {
	const [course] = parseRows([
		{ cells: [{ text: 'Chuyên ngành' }, { text: '0/1' }, { iconClassName: 'fa-circle' }] },
		courseRow({ code: 'CO3101', name: 'Đồ án Tổng hợp', score: '3', letterGrade: 'F' }),
	]);
	assert.equal(course.courseCode, 'CO3101');
});

test('parses grade-history rows and keeps term and individual attempts', () => {
	const page = {
		tables: [{
			rows: [
				{ cells: [{ text: 'Năm học 2025 - 2026 / Học kỳ 2' }] },
				{
					cells: [
						{ text: '1' }, { text: 'CO2039' }, { text: 'Lập trình Nâng cao' },
						{ text: '8' }, { text: 'B+' }, { text: '3' },
						{ iconClassName: 'fa fa-check' }, { text: '' }, { text: 'L02' }, { text: '' },
					],
				},
				{ cells: [{ text: 'Năm học 2025 - 2026 / Học kỳ 1' }] },
				{
					cells: [
						{ text: '11' }, { text: 'CO3005' }, { text: 'Nguyên lý Ngôn ngữ Lập trình' },
						{ text: '4.5' }, { text: 'D' }, { text: '4' },
						{ iconClassName: 'fa fa-check' }, { text: '' }, { text: 'L03' }, { text: '' },
					],
				},
				{
					cells: [
						{ text: '15' }, { text: 'CO3101' }, { text: 'Đồ án Tổng hợp' },
						{ text: '3' }, { text: 'F' }, { text: '1' }, { iconClassName: '' },
						{ text: '' }, { text: 'L01' }, { text: '' },
					],
				},
			],
		}],
	};
	const courses = parseMyBkGradeTable(page).courses;
	assert.equal(courses.length, 3);
	assert.equal(courses[0].term, '2025-2026-2');
	assert.equal(courses[0].status, 'completed');
	assert.equal(courses[1].term, '2025-2026-1');
	assert.equal(courses[1].status, 'completed');
	assert.equal(courses[2].status, 'not_started');
});