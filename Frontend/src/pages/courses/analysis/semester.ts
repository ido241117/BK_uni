/**
 * Mã học kỳ kiểu myBK: 2 số cuối năm bắt đầu năm học + số kỳ.
 * 251 = năm học 2025-2026 kỳ 1, 252 = kỳ 2, 253 = kỳ hè. So sánh chuỗi 3 ký tự đúng bằng thứ tự thời gian.
 */
export interface SemesterParts {
    /** Năm bắt đầu năm học, ví dụ 2025. */
    year: number;
    term: number;
}

export const parseSemester = (code: string): SemesterParts | null => {
    if (!/^\d{3}$/.test(code)) return null;
    return { year: 2000 + Number(code.slice(0, 2)), term: Number(code[2]) };
};

export const toSemesterCode = (year: number, term: number) =>
    `${String(year % 100).padStart(2, '0')}${term}`;

/** Học kỳ đang diễn ra: tháng 8-12 là kỳ 1, tháng 1-5 kỳ 2, tháng 6-7 kỳ hè của năm học trước. */
export const currentSemester = (today = new Date()): string => {
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    if (month >= 8) return toSemesterCode(year, 1);
    if (month <= 5) return toSemesterCode(year - 1, 2);
    return toSemesterCode(year - 1, 3);
};

/** Học kỳ chính kế tiếp (bỏ qua kỳ hè): 261 -> 262, 262/263 -> 271. */
export const nextMainSemester = (code: string): string => {
    const parts = parseSemester(code)!;
    return parts.term === 1 ? toSemesterCode(parts.year, 2) : toSemesterCode(parts.year + 1, 1);
};

/** Mã học kỳ ứng với "Năm y · Kỳ t" của khung chương trình, theo năm nhập học. */
export const recommendedSemester = (admissionYear: number, year: number, term: number) =>
    toSemesterCode(admissionYear + year - 1, term);

/** Số học kỳ chính từ `from` (tính cả) tới `to` (tính cả); 0 nếu `to` trước `from`. */
export const countMainSemesters = (from: string, to: string): number => {
    let count = 0;
    let code = parseSemester(from)!.term === 3 ? nextMainSemester(from) : from;
    while (code <= to && count < 40) {
        count += 1;
        code = nextMainSemester(code);
    }
    return count;
};

export const semesterLabel = (code: string) => {
    const parts = parseSemester(code);
    if (!parts) return `HK ${code}`;
    const term = parts.term === 3 ? 'hè' : parts.term;
    return `HK ${code} (kỳ ${term} ${parts.year}-${parts.year + 1})`;
};
