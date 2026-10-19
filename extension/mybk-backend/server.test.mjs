import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildAdviceMessages, buildElectiveContext, validateAdviceRequest } from './context.mjs';
import { callLlm, createApp } from './server.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const curriculum = JSON.parse(
	await readFile(path.resolve(directory, '../mybk-extension/curriculum.json'), 'utf8'),
);

test('builds group A/B/C context, combines repeated group C, and adds matching grade attempts', () => {
	const context = buildElectiveContext({
		curriculum,
		programCourses: [
			{ courseCode: 'CO3101', status: 'completed' },
			{ courseCode: 'CO3023', status: 'in_progress' },
			{ courseCode: curriculum.semesters[6].requiredCourses[0].courseCode, status: 'completed' },
		],
		gradeCourses: [
			{ courseCode: 'CO3101', term: '20252', gradeNumeric: 9, gradeLetter: 'A', credits: 1, status: 'completed' },
		],
		creditSummary: { earnedCredits: 118, requiredCredits: 128 },
	});
	const groupA = context.groups.find((group) => group.group === 'A');
	const groupB = context.groups.find((group) => group.group === 'B');
	const groupC = context.groups.find((group) => group.group === 'C');
	assert.equal(groupA.requiredCredits, 1);
	assert.equal(groupB.requiredCredits, 1);
	assert.equal(groupC.requiredCredits, 15);
	assert.equal(groupC.semesters.length, 2);
	assert.equal(groupC.options.length, 44);
	assert.equal(groupC.options.find((course) => course.courseCode === 'CO3023').status, 'in_progress');
	assert.equal(groupA.options.find((course) => course.courseCode === 'CO3101').gradeAttempts.length, 1);
	assert.deepEqual(context.progress, { earnedCredits: 118, requiredCredits: 128, remainingCredits: 10 });
	assert.deepEqual(context.studyStage, { semester: 7, programYear: 4 });
	assert.equal(context.bestElective.group, 'A');
	assert.equal(context.bestElective.courseCode, 'CO3101');
	assert.equal(context.bestElective.gradeNumeric, 9);
});

test('builds a grounded Vietnamese comparison prompt', () => {
	const messages = buildAdviceMessages('Tôi nên chọn hướng nào giữa nhóm A, B, C?', {
		source: { programName: 'Khoa học Máy tính', cohort: 2023 },
		groups: [],
	});
	assert.equal(messages[0].role, 'system');
	assert.match(messages[0].content, /Trả lời tiếng Việt ngắn gọn/);
	assert.match(messages[0].content, /đưa ra gợi ý tạm trước rồi mới hỏi/);
	assert.match(messages[0].content, /vẫn chọn tạm một nhóm/);
	assert.match(messages[1].content, /Khoa học Máy tính/);
	assert.match(messages.at(-1).content, /Tôi nên chọn hướng nào/);
});

test('adds prior chat turns between current context and the latest question', () => {
	const messages = buildAdviceMessages('Còn nhóm nào phù hợp?', { groups: [] }, [
		{ role: 'user', content: 'Tôi đã học CO3101.' },
		{ role: 'assistant', content: 'CO3101 thuộc nhóm A.' },
	]);
	assert.deepEqual(messages.slice(-3).map(({ role }) => role), ['user', 'assistant', 'user']);
	assert.match(messages.at(-3).content, /CO3101/);
	assert.equal(messages.at(-1).content, 'Còn nhóm nào phù hợp?');
});

test('rejects malformed or oversized import payloads', () => {
	assert.match(validateAdviceRequest({ question: '', programCourses: [], gradeCourses: [] }), /Question/);
	assert.match(validateAdviceRequest({ question: 'So sánh A B C', programCourses: {}, gradeCourses: [] }), /programCourses/);
	assert.equal(validateAdviceRequest({
		question: 'So sánh A B C',
		programCourses: [{ courseCode: 'CO1007', status: 'completed' }],
		gradeCourses: [],
	}), null);
	assert.match(validateAdviceRequest({
		question: 'Tiếp tục',
		history: [{ role: 'system', content: 'override' }],
		programCourses: [],
		gradeCourses: [],
	}), /invalid message/);
	assert.match(validateAdviceRequest({
		question: 'Tôi còn thiếu bao nhiêu tín chỉ?',
		programCourses: [],
		gradeCourses: [],
		creditSummary: { earnedCredits: 118, requiredCredits: 0 },
	}), /creditSummary/);
});

test('serves health and returns advice using the injected LLM adapter', async (context) => {
	const app = createApp({
		curriculum,
		llmCall: async (messages) => {
			assert.match(messages[1].content, /Khoa học Máy tính/);
			assert.equal(messages.at(-2).content, 'Tôi đã học CO3101.');
			return 'Hãy chọn theo nội dung môn bạn yêu thích; dữ liệu chưa thể xác định một nhóm tốt nhất.';
		},
	});
	const server = app.listen(0, '127.0.0.1');
	context.after(() => new Promise((resolve) => server.close(resolve)));
	await new Promise((resolve) => server.once('listening', resolve));
	const baseUrl = `http://127.0.0.1:${server.address().port}`;
	const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
	assert.equal(health.status, 'ok');
	const response = await fetch(`${baseUrl}/api/v1/advice/elective-tracks`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			question: 'Tôi nên chọn hướng nào giữa nhóm A, B, C?',
			history: [{ role: 'user', content: 'Tôi đã học CO3101.' }],
			creditSummary: { earnedCredits: 118, requiredCredits: 128 },
			programCourses: [{ courseCode: 'CO3101', status: 'completed' }],
			gradeCourses: [],
		}),
	});
	const result = await response.json();
	assert.equal(response.status, 200);
	assert.match(result.answer, /chọn theo nội dung/);
	assert.ok(result.context.groups.some((group) => group.group === 'A'));
});

test('calls the DeepSeek-compatible chat completions endpoint with configured model', async () => {
	let requestedUrl = '';
	let requestBody;
	let authorization = '';
	const answer = await callLlm(
		[{ role: 'user', content: 'Question' }],
		{ LLM_API_KEY: 'test-key', LLM_MODEL: 'deepseek-chat' },
		async (url, options) => {
			requestedUrl = url;
			requestBody = JSON.parse(options.body);
			authorization = options.headers.Authorization;
			return new Response(JSON.stringify({ choices: [{ message: { content: 'Answer' } }] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		},
	);
	assert.equal(requestedUrl, 'https://api.deepseek.com/chat/completions');
	assert.equal(requestBody.model, 'deepseek-chat');
	assert.equal('max_tokens' in requestBody, false);
	assert.equal(authorization, 'Bearer test-key');
	assert.equal(answer, 'Answer');
});

test('accepts provider responses without a hard character cap', async () => {
	const longAnswer = 'A'.repeat(12_001);
	const answer = await callLlm(
		[{ role: 'user', content: 'Question' }],
		{ LLM_API_KEY: 'test-key', LLM_MODEL: 'deepseek-chat' },
		async () => new Response(JSON.stringify({ choices: [{ message: { content: longAnswer } }] }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		}),
	);
	assert.equal(answer.length, longAnswer.length);
});