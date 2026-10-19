function normalizeHeader(value) {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/đ/g, 'd')
		.replace(/\s+/g, ' ')
		.trim();
}

function findHeaderIndex(headers, pattern) {
	return headers.findIndex((header) => pattern.test(normalizeHeader(header)));
}

function cellAt(row, index) {
	return index >= 0 ? row.cells?.[index] ?? null : null;
}

function cellText(row, index) {
	return String(cellAt(row, index)?.text ?? '').replace(/\s+/g, ' ').trim();
}

function parseCourseRow(row, columns) {
	const codeCell = cellAt(row, columns.code);
	const code = String(codeCell?.dataMamh ?? codeCell?.text ?? '')
		.toUpperCase()
		.match(/\b[A-Z]{2,4}\d{3,4}\b/)?.[0];
	if (!code) return null;

	const name = cellText(row, columns.name);
	const score = cellText(row, columns.score);
	const letterGrade = cellText(row, columns.letterGrade).toUpperCase();
	const passedCell = cellAt(row, columns.passed);
	const passedIconClasses = String(passedCell?.iconClassName ?? '').toLowerCase();
	const passedText = String(passedCell?.text ?? '').trim();
	const note = cellText(row, columns.note);
	const hasPassedIcon = passedIconClasses.split(/\s+/).includes('fa-check') &&
		!passedIconClasses.includes('fa-circle');
	const outcome = hasPassedIcon ? 'Đạt' : passedText || 'Chưa có dấu Đạt';
	const rawStatus = [
		score && `Điểm số: ${score}`,
		letterGrade && `Điểm chữ: ${letterGrade}`,
		outcome,
		note,
	]
		.filter(Boolean)
		.join(' | ');
	const allText = `${score} ${letterGrade} ${passedText} ${note}`
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/đ/g, 'd');

	let status = 'needs_review';
	if (/dang hoc|in progress|enrolled|registered/.test(allText)) {
		status = 'in_progress';
	} else if (
		hasPassedIcon
	) {
		status = 'completed';
	} else if (/\b(fail|failed|not passed|khong dat|chua dat|rot)\b/.test(allText)) {
		status = 'not_started';
	} else if (columns.passed >= 0) {
		const numericScore = Number(score.replace(',', '.'));
		const scoreIsNumeric = score !== '' && score !== '--' && Number.isFinite(numericScore);
		const hasAnyGrade = scoreIsNumeric || (letterGrade !== '' && letterGrade !== '--');
		if (passedText || passedIconClasses || hasAnyGrade || score === '--' || letterGrade === '--') {
			status = 'not_started';
		}
	}

	return {
		courseCode: code,
		name,
		status,
		rawStatus: rawStatus || 'Ô Đạt trống, không có điểm',
		sourceText: row.text ?? '',
	};
}

export function parseMyBkTranscript(page) {
	const coursesByCode = new Map();
	const rank = { not_started: 0, needs_review: 1, in_progress: 2, completed: 3 };

	for (const table of page?.tables ?? []) {
		const headers = table.headers ?? [];
		const columns = {
			code: findHeaderIndex(headers, /ma mon hoc|course code/),
			name: findHeaderIndex(headers, /ten mon hoc|course name/),
			score: findHeaderIndex(headers, /diem so|numeric grade/),
			letterGrade: findHeaderIndex(headers, /diem chu|letter grade/),
			passed: findHeaderIndex(headers, /^dat$|passed|completion/),
			note: findHeaderIndex(headers, /ghi chu|note/),
		};
		if (columns.code < 0 || columns.passed < 0) continue;

		for (const row of table.rows ?? []) {
			const course = parseCourseRow(row, columns);
			if (!course) continue;
			const previous = coursesByCode.get(course.courseCode);
			if (!previous || rank[course.status] > rank[previous.status]) {
				coursesByCode.set(course.courseCode, course);
			}
		}
	}

	return {
		...page,
		courses: [...coursesByCode.values()],
	};
}

function normalizeGradeCode(value) {
	return String(value ?? '').trim().toUpperCase();
}

export function parseMyBkGradeTable(page) {
	const courses = [];
	const tables = page?.tables ?? [];
	for (const table of tables) {
		let term = '';
		for (const row of table.rows ?? []) {
			const firstCellText = String(row.cells?.[0]?.text ?? '').replace(/\s+/g, ' ').trim();
			const termMatch = firstCellText.match(/Năm học\s+(\d{4})\s*-\s*(\d{4})\s*\/\s*Học kỳ\s*(\d+)/i);
			if (termMatch) {
				term = `${termMatch[1]}-${termMatch[2]}-${termMatch[3]}`;
				continue;
			}

			const cells = row.cells ?? [];
			const courseCode = normalizeGradeCode(cells[1]?.text);
			if (!/^[A-Z]{2,4}\d{3,4}$/.test(courseCode)) continue;

			const gradeNumericRaw = String(cells[3]?.text ?? '').trim();
			const gradeLetter = String(cells[4]?.text ?? '').trim().toUpperCase();
			const passedIconClasses = String(cells[6]?.iconClassName ?? '').toLowerCase();
			const passed = passedIconClasses.split(/\s+/).includes('fa-check');
			let status = 'needs_review';
			if (passed) status = 'completed';
			else if (['F', 'KD', 'RT', 'CT', 'VT'].includes(gradeLetter)) status = 'not_started';
			const parsedScore = Number(gradeNumericRaw.replace(',', '.'));
			const gradeNumeric = gradeNumericRaw && gradeNumericRaw !== '--' && Number.isFinite(parsedScore)
				? parsedScore
				: null;
			const result = [
				gradeNumericRaw && `Điểm số: ${gradeNumericRaw}`,
				gradeLetter && `Điểm chữ: ${gradeLetter}`,
				passed ? 'Đạt' : 'Chưa có dấu Đạt',
				cells[7]?.text && `Tình trạng: ${cells[7].text}`,
			].filter(Boolean).join(' | ');
			courses.push({
				courseCode,
				name: String(cells[2]?.text ?? '').slice(0, 200),
				term,
				gradeNumeric,
				gradeLetter: gradeLetter || null,
				credits: Number(cells[5]?.text) || 0,
				status,
				rawStatus: result,
				note: String(cells[9]?.text ?? '').slice(0, 200),
			});
		}
	}
	return {
		...page,
		courses,
	};
}