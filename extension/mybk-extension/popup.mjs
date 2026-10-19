import { analyzeCurriculum, parseIndices, pickByIndices } from './analyzer.mjs';
import { parseMyBkGradeTable, parseMyBkTranscript } from './mybk-parser.mjs';

const PROGRAM_PATH = '/app/sinh-vien/ket-qua-hoc-tap/chuong-trinh-dao-tao';
const GRADE_PATH = '/app/sinh-vien/ket-qua-hoc-tap/bang-diem-mon-hoc';
const LOCAL_ADVICE_URL = 'http://127.0.0.1:8787/api/v1/advice/elective-tracks';

const STATUS_LABELS = {
	completed: 'Đã học',
	in_progress: 'Đang học',
	not_started: 'Chưa học / rớt',
	needs_review: 'Cần kiểm tra',
};

const elements = Object.fromEntries(
	[
		'curriculum-name', 'curriculum-cohort', 'curriculum-note', 'data-view', 'open-chat',
		'back-to-data', 'reset-chat', 'read-program-page',
		'read-grade-page', 'route-message', 'status-message', 'program-import-status',
		'grade-import-status', 'chat-section', 'chat-log', 'question-input', 'send-consent',
		'ask-backend',
		'preview-section', 'preview-count', 'source-label', 'transcript-rows',
		'preview-title', 'confirm-import', 'results-section', 'missing-count', 'missing-list',
		'pick-indices', 'pick-button', 'pick-message', 'picked-section',
		'picked-count', 'picked-list', 'clear-data', 'manual-codes',
		'manual-status', 'add-manual-codes',
	].map((id) => [id, document.getElementById(id)]),
);

let curriculum;
let previewRows = [];
let previewKind = null;
let previewCreditSummary = null;
let programCourses = [];
let gradeCourses = [];
let programCreditSummary = null;
let missingCourses = [];
let pickedCodes = [];
let chatMessages = [];

function setStatus(message, isError = false) {
	elements['status-message'].textContent = message;
	elements['status-message'].classList.toggle('error', isError);
}

function showDataView() {
	elements['data-view'].hidden = false;
	elements['chat-section'].hidden = true;
	elements['clear-data'].hidden = false;
	elements['open-chat'].hidden = !(programCourses.length && gradeCourses.length);
}

function showChatView() {
	elements['data-view'].hidden = true;
	elements['chat-section'].hidden = false;
	elements['clear-data'].hidden = true;
	renderChat();
}

function makeText(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	node.textContent = text;
	return node;
}

function renderPreview() {
	elements['preview-count'].textContent = String(previewRows.length);
	elements['preview-title'].textContent = previewKind === 'program'
		? 'Tiến độ CTĐT'
		: 'Bảng điểm môn học';
	elements['transcript-rows'].replaceChildren();
	for (const [index, course] of previewRows.entries()) {
		const row = document.createElement('div');
		row.className = 'transcript-row';
		const copy = document.createElement('div');
		copy.append(makeText('strong', '', `${course.courseCode} · ${course.name || 'Chưa nhận diện tên'}`));
		copy.append(makeText('small', '', course.rawStatus || 'Không nhận diện trạng thái từ trang'));
		const select = document.createElement('select');
		select.setAttribute('aria-label', `Trạng thái ${course.courseCode}`);
		for (const [value, label] of Object.entries(STATUS_LABELS)) {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = label;
			option.selected = course.status === value;
			select.append(option);
		}
		select.addEventListener('change', () => { previewRows[index].status = select.value; });
		row.append(copy, select);
		elements['transcript-rows'].append(row);
	}
	elements['preview-section'].hidden = false;
}

function renderMissing() {
	missingCourses = analyzeCurriculum(curriculum, programCourses);
	elements['missing-count'].textContent = String(missingCourses.length);
	elements['missing-list'].replaceChildren();
	for (const course of missingCourses) {
		const item = document.createElement('li');
		item.className = 'course-item';
		const copy = document.createElement('div');
		copy.className = 'course-copy';
		copy.append(makeText('span', 'code', course.courseCode));
		copy.append(makeText('strong', '', course.name));
		const meta = document.createElement('div');
		meta.className = 'course-meta';
		meta.append(makeText('span', '', `${course.credits} tín chỉ`));
		meta.append(makeText('span', course.requirementType === 'elective' ? 'elective' : '', course.groupName || `HK ${course.semesterNumber}`));
		item.append(copy, meta);
		elements['missing-list'].append(item);
	}
	elements['results-section'].hidden = false;
	renderPicked();
}

function renderChat() {
	const log = elements['chat-log'];
	log.replaceChildren();
	if (!chatMessages.length) {
		log.append(makeText('p', 'chat-empty', 'Hai nguồn đã được nạp riêng. Hãy hỏi về tiến độ hoặc các nhóm tự chọn.'));
		return;
	}
	for (const message of chatMessages) {
		const bubble = document.createElement('article');
		bubble.className = `chat-message ${message.role}`;
		bubble.append(makeText('span', 'chat-role', message.role === 'user' ? 'Bạn' : 'Trợ lý'));
		bubble.append(makeText('p', 'chat-content', message.content));
		log.append(bubble);
	}
	log.scrollTop = log.scrollHeight;
}

function renderPicked() {
	const picked = pickedCodes
		.map((code) => curriculumCourseByCode(code))
		.filter(Boolean);
	elements['picked-count'].textContent = String(picked.length);
	elements['picked-list'].replaceChildren();
	elements['picked-section'].hidden = picked.length === 0;
	for (const course of picked) {
		const item = document.createElement('li');
		item.append(makeText('span', '', `${course.courseCode} · ${course.name}`));
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.textContent = 'Bỏ';
		remove.setAttribute('aria-label', `Bỏ ${course.courseCode} khỏi danh sách đã chọn`);
		remove.addEventListener('click', () => {
			pickedCodes = pickedCodes.filter((code) => code !== course.courseCode);
			void chrome.storage.local.set({ pickedCodes }).then(renderPicked);
		});
		item.append(remove);
		elements['picked-list'].append(item);
	}
}

function curriculumCourseByCode(code) {
	for (const semester of curriculum.semesters) {
		for (const course of semester.requiredCourses ?? []) {
			if (course.courseCode === code) return {
				courseCode: code,
				name: course.nameVi ?? course.nameEn ?? code,
			};
		}
		for (const group of semester.electiveGroups ?? []) {
			for (const course of group.courses ?? []) {
				if (course.courseCode === code) return {
					courseCode: code,
					name: course.nameVi ?? course.nameEn ?? code,
				};
			}
		}
	}
	return null;
}

function addManualCodes() {
	const codes = [...new Set((elements['manual-codes'].value.toUpperCase().match(/\b[A-Z]{2,4}\d{3,4}\b/g) ?? []))];
	if (!codes.length) {
		setStatus('Không tìm thấy mã môn hợp lệ trong nội dung nhập.', true);
		return;
	}
	const existing = new Map(previewRows.map((course) => [course.courseCode, course]));
	for (const courseCode of codes) {
		const knownCourse = curriculumCourseByCode(courseCode);
		existing.set(courseCode, existing.get(courseCode) ?? {
			courseCode,
			name: knownCourse?.name ?? '',
			status: elements['manual-status'].value,
			rawStatus: 'Nhập thủ công',
			sourceText: courseCode,
		});
	}
	previewRows = [...existing.values()];
	elements['source-label'].textContent = 'Nhập mã môn thủ công';
	renderPreview();
	setStatus(`Đã thêm ${codes.length} mã môn vào preview; hãy xác nhận trạng thái.`);
}

function extractProgramTablesFromPage() {
	const tableIds = ['tbThongTinCTDT', 'tbThongTinCTDTCN'];
	const tables = tableIds.map((id) => document.getElementById(id)).filter(Boolean).map((table) => ({
		headers: [...table.querySelectorAll('thead tr:last-child th')]
			.map((cell) => (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim()),
		rows: [...table.querySelectorAll('tbody tr')].map((row) => {
			const cells = [...row.querySelectorAll(':scope > td')].map((cell) => ({
				text: (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim(),
				className: cell.className,
				dataMamh: cell.querySelector('[data-mamh]')?.getAttribute('data-mamh') ?? null,
				iconClassName: [...cell.querySelectorAll('i')].map((icon) => icon.className).join(' '),
			}));
			return {
				cells,
				text: cells.map((cell) => cell.text).filter(Boolean).join(' · '),
			};
		}),
	}));
	const creditText = document.getElementById('lblSoTinChi')?.innerText ?? '';
	const creditMatch = creditText.match(/([\d.,]+)\s*\/\s*([\d.,]+)/);
	return {
		pageTitle: document.title,
		pageUrl: location.href,
		capturedAt: new Date().toISOString(),
		creditSummary: creditMatch ? {
			earnedCredits: Number(creditMatch[1].replace(',', '.')),
			requiredCredits: Number(creditMatch[2].replace(',', '.')),
		} : null,
		tables,
	};
}

function extractGradeTableFromPage() {
	const table = document.getElementById('tbThongTinBangDiemMonHoc');
	const tables = table ? [{
		rows: [...table.querySelectorAll('tbody tr')].map((row) => ({
			cells: [...row.querySelectorAll(':scope > td')].map((cell) => ({
				text: (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim(),
				colSpan: Number(cell.getAttribute('colspan')) || 1,
				iconClassName: [...cell.querySelectorAll('i')].map((icon) => icon.className).join(' '),
			})),
		})),
	}] : [];
	return {
		pageTitle: document.title,
		pageUrl: location.href,
		capturedAt: new Date().toISOString(),
		tables,
	};
}

function updateSourceStatus() {
	elements['program-import-status'].textContent = programCourses.length
		? `CTĐT: đã nạp ${programCourses.length} môn`
		: 'CTĐT: chưa nạp';
	elements['grade-import-status'].textContent = gradeCourses.length
		? `Bảng điểm: đã nạp ${gradeCourses.length} lần học`
		: 'Bảng điểm: chưa nạp';
	const ready = programCourses.length > 0 && gradeCourses.length > 0;
	if (ready) {
		renderMissing();
		showChatView();
	} else {
		showDataView();
	}
}

async function updateRouteActions() {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		const url = new URL(tab?.url ?? '');
		const isMyBk = url.origin === 'https://mybk.hcmut.edu.vn';
		elements['read-program-page'].hidden = !(isMyBk && url.pathname === PROGRAM_PATH);
		elements['read-grade-page'].hidden = !(isMyBk && url.pathname === GRADE_PATH);
		if (elements['read-program-page'].hidden && elements['read-grade-page'].hidden) {
			elements['route-message'].textContent = 'Mở đúng trang CTĐT hoặc bảng điểm trên myBK để hiện nút nạp tương ứng.';
		} else {
			elements['route-message'].textContent = 'Chỉ đọc DOM của tab hiện tại sau khi bạn bấm nút nạp.';
		}
	} catch {
		elements['read-program-page'].hidden = true;
		elements['read-grade-page'].hidden = true;
		elements['route-message'].textContent = 'Không xác định được trang hiện tại.';
	}
}

async function readCurrentPage(kind) {
	const button = kind === 'program' ? elements['read-program-page'] : elements['read-grade-page'];
	previewCreditSummary = null;
	button.disabled = true;
	setStatus('Đang đọc DOM của tab hiện tại...');
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) throw new Error('Không xác định được tab đang mở.');
		const currentUrl = new URL(tab.url ?? '');
		const expectedPath = kind === 'program' ? PROGRAM_PATH : GRADE_PATH;
		if (currentUrl.origin !== 'https://mybk.hcmut.edu.vn' || currentUrl.pathname !== expectedPath) {
			throw new Error('Tab hiện tại không đúng trang cần nạp.');
		}
		const [result] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: kind === 'program' ? extractProgramTablesFromPage : extractGradeTableFromPage,
		});
		const page = kind === 'program'
			? parseMyBkTranscript(result?.result)
			: parseMyBkGradeTable(result?.result);
		if (!page?.courses?.length) {
			previewRows = [];
			elements['source-label'].textContent = 'Không nhận diện được bảng HTML trên tab hiện tại';
			previewKind = kind;
			renderPreview();
			setStatus('Không tìm thấy dòng môn học trong bảng. Kiểm tra đúng tab hoặc nhập dữ liệu thủ công.', true);
			return;
		}
		previewKind = kind;
		previewCreditSummary = kind === 'program' ? page.creditSummary ?? null : null;
		previewRows = page.courses.map((course) => ({ ...course }));
		elements['source-label'].textContent = `${page.pageTitle} · ${new URL(page.pageUrl).host} · ${new Date(page.capturedAt).toLocaleString()}`;
		renderPreview();
		setStatus(`Đã nhận diện ${previewRows.length} ${kind === 'program' ? 'môn trong CTĐT' : 'lần học'}. Kiểm tra trước khi lưu.`);
	} catch (error) {
		if (!previewRows.length) {
			elements['source-label'].textContent = 'Không đọc được DOM; có thể nhập mã môn thủ công';
			previewKind = kind;
			renderPreview();
		}
		setStatus(error instanceof Error ? error.message : 'Không đọc được trang hiện tại.', true);
	} finally {
		button.disabled = false;
	}
}

async function confirmImport() {
	const records = previewRows.map((course) => ({ ...course }));
	if (previewKind === 'program') {
		programCourses = records;
		programCreditSummary = previewCreditSummary;
		await chrome.storage.local.set({ programCourses, programCreditSummary });
	} else if (previewKind === 'grade') {
		gradeCourses = records;
		await chrome.storage.local.set({ gradeCourses });
	}
	updateSourceStatus();
	setStatus(`Đã lưu ${records.length} bản ghi ${previewKind === 'program' ? 'CTĐT' : 'bảng điểm'} local.`);
}

async function askBackend() {
	if (!programCourses.length || !gradeCourses.length) {
		setStatus('Cần nạp cả CTĐT và bảng điểm trước.', true);
		return;
	}
	if (!elements['send-consent'].checked) {
		setStatus('Hãy xác nhận đồng ý gửi context đến backend và LLM provider.', true);
		return;
	}
	const question = elements['question-input'].value.trim();
	if (!question) {
		setStatus('Nhập câu hỏi trước khi gửi.', true);
		return;
	}
	elements['ask-backend'].disabled = true;
	setStatus('Đang gửi dữ liệu tối thiểu đến backend local...');
	try {
		const response = await fetch(LOCAL_ADVICE_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				question,
				history: chatMessages.slice(-20),
				creditSummary: programCreditSummary,
				programCourses: programCourses.map(({ courseCode, status }) => ({ courseCode, status })),
				gradeCourses: gradeCourses.map(({ courseCode, term, gradeNumeric, gradeLetter, credits, status }) => ({
					courseCode, term, gradeNumeric, gradeLetter, credits, status,
				})),
			}),
		});
		const result = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(result.message || result.error || `Backend lỗi HTTP ${response.status}.`);
		chatMessages = [...chatMessages, { role: 'user', content: question }, { role: 'assistant', content: result.answer }].slice(-40);
		await chrome.storage.local.set({ chatMessages });
		elements['question-input'].value = '';
		renderChat();
		setStatus('Đã nhận câu trả lời từ backend local.');
	} catch (error) {
		setStatus(error instanceof Error ? error.message : 'Không kết nối được backend local.', true);
	} finally {
		elements['ask-backend'].disabled = false;
	}
}

async function addPickedCourses() {
	const message = elements['pick-message'];
	message.classList.remove('error');
	try {
		const indices = parseIndices(elements['pick-indices'].value, missingCourses.length);
		const additions = pickByIndices(missingCourses, indices).map((course) => course.courseCode);
		pickedCodes = [...new Set([...pickedCodes, ...additions])];
		await chrome.storage.local.set({ pickedCodes });
		elements['pick-indices'].value = '';
		message.textContent = `Đã thêm ${additions.length} môn vào danh sách chọn.`;
		renderPicked();
	} catch (error) {
		message.textContent = error instanceof Error ? error.message : 'Index không hợp lệ.';
		message.classList.add('error');
	}
}

async function clearLocalData() {
	await chrome.storage.local.clear();
	programCourses = [];
	gradeCourses = [];
	programCreditSummary = null;
	previewCreditSummary = null;
	pickedCodes = [];
	chatMessages = [];
	previewRows = [];
	elements['preview-section'].hidden = true;
	elements['results-section'].hidden = true;
	elements['chat-section'].hidden = true;
	elements['chat-log'].replaceChildren();
	updateSourceStatus();
	setStatus('Đã xóa dữ liệu local của extension.');
}

async function resetChat() {
	chatMessages = [];
	await chrome.storage.local.remove('chatMessages');
	renderChat();
	setStatus('Đã làm mới cuộc trò chuyện; dữ liệu đã nạp vẫn được giữ.');
}

async function initialize() {
	try {
		const response = await fetch(chrome.runtime.getURL('curriculum.json'));
		if (!response.ok) throw new Error('Không tải được CTĐT đóng gói cùng extension.');
		curriculum = await response.json();
		elements['curriculum-name'].textContent = curriculum.source.programName;
		elements['curriculum-cohort'].textContent = `Khóa ${curriculum.source.cohort}`;
		const freeElectiveCount = curriculum.semesters.reduce(
			(total, semester) => total + (semester.freeElectiveRequirements?.length ?? 0),
			0,
		);
		if (freeElectiveCount) {
			elements['curriculum-note'].textContent = 'CTĐT có yêu cầu tự chọn tự do chưa gắn mã môn; phần này chưa thể liệt kê hoặc pick theo index.';
			elements['curriculum-note'].hidden = false;
		}
		const stored = await chrome.storage.local.get([
			'programCourses', 'gradeCourses', 'programCreditSummary', 'pickedCodes', 'chatMessages',
		]);
		programCourses = stored.programCourses ?? [];
		gradeCourses = stored.gradeCourses ?? [];
		programCreditSummary = stored.programCreditSummary ?? null;
		pickedCodes = stored.pickedCodes ?? [];
		chatMessages = Array.isArray(stored.chatMessages)
			? stored.chatMessages.filter((message) =>
				['user', 'assistant'].includes(message?.role) && typeof message.content === 'string',
			).slice(-40)
			: [];
		updateSourceStatus();
		await updateRouteActions();
	} catch (error) {
		setStatus(error instanceof Error ? error.message : 'Không khởi tạo được extension.', true);
	}
}

elements['read-program-page'].addEventListener('click', () => void readCurrentPage('program'));
elements['read-grade-page'].addEventListener('click', () => void readCurrentPage('grade'));
elements['confirm-import'].addEventListener('click', () => void confirmImport());
elements['open-chat'].addEventListener('click', showChatView);
elements['back-to-data'].addEventListener('click', showDataView);
elements['reset-chat'].addEventListener('click', () => void resetChat());
elements['ask-backend'].addEventListener('click', () => void askBackend());
elements['question-input'].addEventListener('keydown', (event) => {
	if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
		event.preventDefault();
		void askBackend();
	}
});
elements['pick-button'].addEventListener('click', () => void addPickedCourses());
elements['pick-indices'].addEventListener('keydown', (event) => {
	if (event.key === 'Enter') void addPickedCourses();
});
elements['clear-data'].addEventListener('click', () => void clearLocalData());
elements['add-manual-codes'].addEventListener('click', addManualCodes);
void initialize();