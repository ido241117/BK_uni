export function analyzeCurriculum(curriculum, transcriptCourses) {
	if (!Array.isArray(curriculum?.semesters)) {
		throw new TypeError('Curriculum must contain a semesters array.');
	}

	const statuses = new Map(
		(transcriptCourses ?? []).map((course) => [
			String(course.courseCode ?? '').trim().toUpperCase(),
			course.status,
		]),
	);
	const courses = [];
	const seenCodes = new Set();
	const appendCourse = (course, semesterNumber, requirementType, groupName = null) => {
		const code = String(course.courseCode ?? '').trim().toUpperCase();
		if (!code || seenCodes.has(code)) return;
		seenCodes.add(code);
		const status = statuses.get(code) ?? 'not_started';
		if (status === 'completed' || status === 'in_progress') return;
		courses.push({
			courseCode: code,
			name: course.nameVi ?? course.nameEn ?? code,
			credits: Number(course.credits) || 0,
			semesterNumber,
			ordinal: Number(course.ordinal) || 0,
			requirementType,
			groupName,
			status,
		});
	};

	for (const semester of curriculum.semesters) {
		for (const course of semester.requiredCourses ?? []) {
			appendCourse(course, semester.number, 'required');
		}
		for (const group of semester.electiveGroups ?? []) {
			const groupName = `Nhóm ${group.group}`;
			const earnedCredits = (group.courses ?? []).reduce((total, course) => {
				const status = statuses.get(String(course.courseCode ?? '').trim().toUpperCase());
				return status === 'completed' || status === 'in_progress'
					? total + (Number(course.credits) || 0)
					: total;
			}, 0);
			if (earnedCredits >= Number(group.creditsRequired ?? 0)) continue;
			for (const course of group.courses ?? []) {
				appendCourse(course, semester.number, 'elective', groupName);
			}
		}
	}

	return courses.sort((left, right) => {
		const requirementOrder =
			(left.requirementType === 'required' ? 0 : 1) -
			(right.requirementType === 'required' ? 0 : 1);
		return (
			requirementOrder ||
			left.semesterNumber - right.semesterNumber ||
			left.ordinal - right.ordinal ||
			left.courseCode.localeCompare(right.courseCode)
		);
	});
}

export function pickByIndices(courses, indices) {
	const selectedIndices = [...new Set(indices)]
		.filter((index) => Number.isInteger(index) && index >= 1 && index <= courses.length)
		.sort((left, right) => left - right);
	return selectedIndices.map((index) => courses[index - 1]);
}

export function parseIndices(value, itemCount) {
	const rawIndices = String(value ?? '')
		.split(/[\s,;]+/)
		.filter(Boolean)
		.map(Number);
	if (rawIndices.some((index) => !Number.isInteger(index) || index < 1 || index > itemCount)) {
		throw new RangeError(`Chọn số thứ tự từ 1 đến ${itemCount}.`);
	}
	return [...new Set(rawIndices)];
}