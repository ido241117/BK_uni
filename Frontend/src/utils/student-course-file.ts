import type { CourseSummary, StudentCourseStatus } from '@/types';
import { STUDENT_COURSE_STATUS, STUDENT_COURSE_STATUS_LABEL } from '@/types';

/**
 * File khai trạng thái học tập: sinh viên tải về (Excel/CSV, điền sẵn trạng thái hiện tại),
 * điền cột "Trạng thái" rồi nộp lại. Mọi xử lý file chạy trong trình duyệt; backend chỉ nhận
 * danh sách `{ course_id, status }` đã kiểm tra.
 */

/** Số dòng trống có sẵn danh sách chọn trạng thái ở cuối file Excel mẫu. */
const TEMPLATE_EXTRA_ROWS = 200;

export const FILE_HEADERS = ['Mã môn', 'Tên môn học', 'Tín chỉ', 'Trạng thái'] as const;

/** Dấu BOM để Excel nhận CSV là UTF-8 (tiếng Việt không bị lỗi font). */
const UTF8_BOM = String.fromCharCode(0xfeff);

/** Nhãn ghi trong file theo đúng thứ tự hiển thị của dropdown Excel. */
export const STATUS_FILE_LABELS: string[] = [
    STUDENT_COURSE_STATUS.NOT_STARTED,
    STUDENT_COURSE_STATUS.IN_PROGRESS,
    STUDENT_COURSE_STATUS.COMPLETED,
    STUDENT_COURSE_STATUS.FAILED,
].map(status => STUDENT_COURSE_STATUS_LABEL[status]);

export interface TemplateRow {
    code: string;
    name: string;
    credits: number;
    status: StudentCourseStatus | null;
}

/** Một dòng đọc từ file nộp lên; `line` là số dòng trong file (dòng tiêu đề là 1). */
export interface ParsedRow {
    line: number;
    code: string;
    status: string;
}

export interface StatusChange {
    courseId: string;
    code: string;
    name: string;
    from: StudentCourseStatus | null;
    to: StudentCourseStatus;
}

export interface RowError {
    line: number;
    code: string;
    message: string;
}

export interface ImportAnalysis {
    changes: StatusChange[];
    /** Dòng có trạng thái trùng với trạng thái đang lưu. */
    unchanged: number;
    /** Dòng để trống trạng thái: giữ nguyên. */
    blank: number;
    errors: RowError[];
}

/** Bỏ dấu, chữ thường, gộp khoảng trắng: "Đã  Hoàn thành" -> "da hoan thanh". */
const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim();

/** Các cách ghi trạng thái được chấp nhận (đã chuẩn hoá); nhãn chuẩn nằm trong `STATUS_FILE_LABELS`. */
const STATUS_ALIASES: Record<string, StudentCourseStatus> = {
    'chua hoc': STUDENT_COURSE_STATUS.NOT_STARTED,
    'not-started': STUDENT_COURSE_STATUS.NOT_STARTED,
    'not started': STUDENT_COURSE_STATUS.NOT_STARTED,
    'dang hoc': STUDENT_COURSE_STATUS.IN_PROGRESS,
    'in-progress': STUDENT_COURSE_STATUS.IN_PROGRESS,
    'in progress': STUDENT_COURSE_STATUS.IN_PROGRESS,
    'da hoan thanh': STUDENT_COURSE_STATUS.COMPLETED,
    'hoan thanh': STUDENT_COURSE_STATUS.COMPLETED,
    'da hoc': STUDENT_COURSE_STATUS.COMPLETED,
    'dat': STUDENT_COURSE_STATUS.COMPLETED,
    'da dat': STUDENT_COURSE_STATUS.COMPLETED,
    completed: STUDENT_COURSE_STATUS.COMPLETED,
    'chua dat': STUDENT_COURSE_STATUS.FAILED,
    'khong dat': STUDENT_COURSE_STATUS.FAILED,
    rot: STUDENT_COURSE_STATUS.FAILED,
    failed: STUDENT_COURSE_STATUS.FAILED,
};

export const parseStatus = (value: string): StudentCourseStatus | null => STATUS_ALIASES[normalize(value)] ?? null;

export const buildTemplateRows = (
    courses: CourseSummary[],
    statusByCourseId: Map<string, StudentCourseStatus>,
): TemplateRow[] => [...courses]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(course => ({
        code: course.code,
        name: course.name,
        credits: course.credits,
        status: statusByCourseId.get(course.id) ?? null,
    }));

const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const statusLabel = (status: StudentCourseStatus | null) => (status ? STUDENT_COURSE_STATUS_LABEL[status] : '');

/* --------------------------------- Xuất file -------------------------------- */

const csvCell = (value: string | number) => {
    const text = String(value);
    return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV UTF-8 có BOM để Excel đọc đúng tiếng Việt. */
export const downloadCsvTemplate = (rows: TemplateRow[], fileName: string) => {
    const lines = [
        FILE_HEADERS.join(','),
        ...rows.map(row => [row.code, row.name, row.credits, statusLabel(row.status)].map(csvCell).join(',')),
    ];
    saveBlob(new Blob([`${UTF8_BOM}${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }), fileName);
};

/** Excel có dropdown chọn trạng thái ở cột D; thư viện chỉ tải khi người dùng bấm xuất. */
export const downloadXlsxTemplate = async (rows: TemplateRow[], fileName: string) => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet('Môn học', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
        { header: FILE_HEADERS[0], key: 'code', width: 14 },
        { header: FILE_HEADERS[1], key: 'name', width: 56 },
        { header: FILE_HEADERS[2], key: 'credits', width: 10 },
        { header: FILE_HEADERS[3], key: 'status', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };
    rows.forEach(row => sheet.addRow({ ...row, status: statusLabel(row.status) }));

    const statusList = `"${STATUS_FILE_LABELS.join(',')}"`;
    // Chừa thêm dòng trống có sẵn danh sách chọn để sinh viên khai môn ngoài file mẫu.
    for (let index = 2; index <= rows.length + 1 + TEMPLATE_EXTRA_ROWS; index += 1) {
        sheet.getCell(`D${index}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [statusList],
            showErrorMessage: true,
            errorTitle: 'Trạng thái không hợp lệ',
            error: `Chọn một trong: ${STATUS_FILE_LABELS.join(', ')}; hoặc để trống để giữ nguyên.`,
        };
    }

    const guide = workbook.addWorksheet('Hướng dẫn');
    guide.getColumn(1).width = 100;
    [
        'Cách khai trạng thái học tập',
        '1. Ở sheet "Môn học", chọn trạng thái ở cột "Trạng thái" cho từng môn.',
        `2. Trạng thái hợp lệ: ${STATUS_FILE_LABELS.join(', ')}.`,
        '3. Để trống ô "Trạng thái" nếu muốn giữ nguyên trạng thái hiện có của môn.',
        '4. Không sửa cột "Mã môn" của các dòng có sẵn; hệ thống nhận diện môn theo mã. Cột tên và tín chỉ chỉ để tham khảo.',
        '   Môn chưa có trong file (ví dụ môn ngoài chương trình): thêm dòng mới ở cuối, chỉ cần điền "Mã môn" và "Trạng thái".',
        '5. Lưu file rồi bấm "Nhập từ file" trên trang Chương trình & học phần để xem trước và lưu.',
    ].forEach((text, index) => {
        const cell = guide.getCell(`A${index + 1}`);
        cell.value = text;
        if (index === 0) cell.font = { bold: true };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveBlob(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        fileName,
    );
};

/* --------------------------------- Đọc file --------------------------------- */

/** Tách CSV có hỗ trợ ngoặc kép; dấu phân cách đoán từ dòng tiêu đề (Excel tiếng Việt hay dùng `;`). */
const parseCsv = (text: string): string[][] => {
    const content = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
    const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = [',', ';', '\t']
        .map(candidate => ({ candidate, count: firstLine.split(candidate).length }))
        .sort((a, b) => b.count - a.count)[0].candidate;

    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < content.length; index += 1) {
        const char = content[index];
        if (quoted) {
            if (char === '"' && content[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                cell += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === delimiter) {
            row.push(cell);
            cell = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && content[index + 1] === '\n') index += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
};

const readXlsx = async (file: File): Promise<string[][]> => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const values: string[] = [];
        for (let column = 1; column <= Math.max(row.cellCount, FILE_HEADERS.length); column += 1) {
            values.push(row.getCell(column).text ?? '');
        }
        rows[rowNumber - 1] = values;
    });
    return Array.from(rows, row => row ?? []);
};

/**
 * Đọc file .xlsx hoặc .csv thành các dòng (mã môn, trạng thái). Cột được tìm theo tiêu đề
 * "Mã môn" và "Trạng thái" nên người dùng có thể đổi thứ tự cột.
 */
export const readStatusFile = async (file: File): Promise<ParsedRow[]> => {
    const extension = file.name.toLowerCase().split('.').pop();
    let table: string[][];
    if (extension === 'xlsx') {
        table = await readXlsx(file);
    } else if (extension === 'csv') {
        table = parseCsv(await file.text());
    } else {
        throw new Error('Chỉ nhận file .xlsx hoặc .csv.');
    }

    const header = (table[0] ?? []).map(normalize);
    const codeColumn = header.indexOf(normalize(FILE_HEADERS[0]));
    const statusColumn = header.indexOf(normalize(FILE_HEADERS[3]));
    if (codeColumn < 0 || statusColumn < 0) {
        throw new Error('Không tìm thấy cột "Mã môn" và "Trạng thái" ở dòng đầu tiên. Hãy dùng file mẫu tải từ hệ thống.');
    }

    return table.slice(1)
        .map((row, index) => ({
            line: index + 2,
            code: (row[codeColumn] ?? '').trim(),
            status: (row[statusColumn] ?? '').trim(),
        }))
        .filter(row => row.code !== '' || row.status !== '');
};

/** So file với danh mục môn và trạng thái đang lưu: chỉ giữ dòng thực sự thay đổi, gom lỗi theo dòng. */
export const analyzeStatusFile = (
    rows: ParsedRow[],
    courses: CourseSummary[],
    statusByCourseId: Map<string, StudentCourseStatus>,
): ImportAnalysis => {
    const courseByCode = new Map(courses.map(course => [course.code.toUpperCase(), course]));
    const seen = new Set<string>();
    const result: ImportAnalysis = { changes: [], unchanged: 0, blank: 0, errors: [] };

    rows.forEach(row => {
        if (!row.code) {
            result.errors.push({ line: row.line, code: '', message: 'Thiếu mã môn.' });
            return;
        }
        const key = row.code.toUpperCase();
        const course = courseByCode.get(key);
        if (!course) {
            result.errors.push({ line: row.line, code: row.code, message: 'Mã môn không có trong danh mục.' });
            return;
        }
        if (seen.has(key)) {
            result.errors.push({ line: row.line, code: row.code, message: 'Mã môn bị lặp; chỉ giữ dòng đầu tiên.' });
            return;
        }
        seen.add(key);

        if (!row.status) {
            result.blank += 1;
            return;
        }
        const status = parseStatus(row.status);
        if (!status) {
            result.errors.push({
                line: row.line,
                code: row.code,
                message: `Trạng thái "${row.status}" không hợp lệ; dùng ${STATUS_FILE_LABELS.join(', ')}.`,
            });
            return;
        }

        const current = statusByCourseId.get(course.id) ?? null;
        if (current === status) {
            result.unchanged += 1;
            return;
        }
        result.changes.push({ courseId: course.id, code: course.code, name: course.name, from: current, to: status });
    });

    return result;
};
