/**
 * Mức khớp của một môn với từ khoá tìm kiếm (số nhỏ khớp tốt hơn), cùng thứ tự với backend `GET /courses`:
 * 0 trùng mã, 1 mã bắt đầu bằng từ khoá, 2 mã chứa từ khoá, 3 chỉ tên chứa từ khoá, `null` không khớp.
 */
export const courseSearchRank = (course: { code: string; name: string }, keyword: string): number | null => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return 3;
    const code = course.code.toLowerCase();
    if (code === needle) return 0;
    if (code.startsWith(needle)) return 1;
    if (code.includes(needle)) return 2;
    return course.name.toLowerCase().includes(needle) ? 3 : null;
};
