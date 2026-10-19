import 'dotenv/config';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
	buildAdviceMessages,
	buildElectiveContext,
	validateAdviceRequest,
} from './context.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const curriculumPath = path.resolve(directory, '../mybk-extension/curriculum.json');
const extensionOriginPattern = /^chrome-extension:\/\/[a-p]{32}$/;

async function loadCurriculum() {
	return JSON.parse(await readFile(curriculumPath, 'utf8'));
}

export async function callLlm(messages, env = process.env, fetchImpl = fetch) {
	const apiKey = env.LLM_API_KEY;
	const model = env.LLM_MODEL;
	if (!apiKey || !model) {
		const error = new Error('LLM_API_KEY and LLM_MODEL must be configured.');
		error.statusCode = 503;
		error.code = 'LLM_NOT_CONFIGURED';
		throw error;
	}
	const baseUrl = (env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
	let response;
	try {
		response = await fetchImpl(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ model, messages, temperature: 0.2 }),
			signal: AbortSignal.timeout(30_000),
		});
	} catch {
		const error = new Error('LLM provider is unavailable.');
		error.statusCode = 502;
		error.code = 'LLM_UNAVAILABLE';
		throw error;
	}
	if (!response.ok) {
		const error = new Error('LLM provider returned an error.');
		error.statusCode = 502;
		error.code = 'LLM_UNAVAILABLE';
		throw error;
	}
	const payload = await response.json();
	const answer = payload?.choices?.[0]?.message?.content;
	if (typeof answer !== 'string' || !answer.trim()) {
		const error = new Error('LLM provider response is invalid.');
		error.statusCode = 502;
		error.code = 'LLM_INVALID_RESPONSE';
		throw error;
	}
	return answer.trim();
}

export function createApp({ curriculum, llmCall = callLlm } = {}) {
	const app = express();
	app.disable('x-powered-by');
	app.use((request, response, next) => {
		const origin = request.get('origin');
		if (origin && !extensionOriginPattern.test(origin)) {
			response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
			return;
		}
		if (origin) {
			response.setHeader('Access-Control-Allow-Origin', origin);
			response.setHeader('Vary', 'Origin');
			response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
			if (request.get('access-control-request-private-network') === 'true') {
				response.setHeader('Access-Control-Allow-Private-Network', 'true');
			}
		}
		if (request.method === 'OPTIONS') {
			response.sendStatus(204);
			return;
		}
		next();
	});
	app.use(express.json({ limit: '128kb', strict: true }));

	app.get('/health', (request, response) => {
		response.json({
			status: 'ok',
			llmConfigured: Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL),
		});
	});

	app.post('/api/v1/advice/elective-tracks', async (request, response) => {
		const validationError = validateAdviceRequest(request.body);
		if (validationError) {
			response.status(400).json({ error: 'INVALID_REQUEST', message: validationError });
			return;
		}
		try {
			const context = buildElectiveContext({
				curriculum,
				creditSummary: request.body.creditSummary,
				programCourses: request.body.programCourses,
				gradeCourses: request.body.gradeCourses,
			});
			const messages = buildAdviceMessages(
				request.body.question.trim(),
				context,
				request.body.history ?? [],
			);
			const answer = await llmCall(messages);
			response.json({ answer, context });
		} catch (error) {
			response.status(error.statusCode ?? 500).json({
				error: error.code ?? 'ADVICE_FAILED',
				message: error.statusCode ? error.message : 'Không tạo được tư vấn.',
			});
		}
	});

	app.use((error, request, response, next) => {
		if (error?.type === 'entity.too.large') {
			response.status(413).json({ error: 'REQUEST_TOO_LARGE' });
			return;
		}
		if (error instanceof SyntaxError && 'body' in error) {
			response.status(400).json({ error: 'INVALID_JSON' });
			return;
		}
		response.status(500).json({ error: 'INTERNAL_ERROR' });
	});

	return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const curriculum = await loadCurriculum();
	const app = createApp({ curriculum });
	const port = Number(process.env.PORT || 8787);
	app.listen(port, '127.0.0.1', () => {
		console.log(`myBK local backend listening at http://127.0.0.1:${port}`);
	});
}