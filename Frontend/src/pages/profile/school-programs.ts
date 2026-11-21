/**
 * Danh sách chương trình đào tạo của Trường (chép tay từ trang "Chương trình đào tạo từ khóa 2019" của hcmut.edu.vn).
 * Bảng cố định, không lấy từ database; chỉ dùng để đối chiếu xem khóa nào đã có dữ liệu trong hệ thống.
 *
 * - `program`: `TIỀN_TỐ/HẬU_TỐ` của mã CTĐT trong database (`CS-2024-KHMT` ↔ `CS/KHMT`); `null` = chưa có dữ liệu.
 * - `latest`: cột "Chương trình đào tạo/Kế hoạch giảng dạy" (CTĐT mới nhất), `previous`: cột "Chương trình đào tạo".
 * - Nhãn "Từ 2024" áp dụng cho khóa 2024 và 2025 (tới khi có CTĐT "Từ 2026").
 */
export interface SchoolProgramRow {
    faculty: string;
    major: string;
    program: string | null;
    latest: string[];
    previous: string[];
}

/** Khóa tuyển sinh ứng với một nhãn của bảng. */
export const cohortsOfLabel = (label: string): number[] => {
    const from = /^Từ (\d{4})$/.exec(label);
    if (!from) return [Number(label)];
    const year = Number(from[1]);
    // "Từ 2024" dùng tới trước 2026 (khi có CTĐT "Từ 2026"); "Từ 2026" là bản mới nhất.
    return year === 2024 ? [2024, 2025] : [year];
};

export const SCHOOL_PROGRAMS: SchoolProgramRow[] = [
    { faculty: 'KHOA CƠ KHÍ', major: 'Bảo dưỡng Công nghiệp', program: 'IMT/BDCN', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA CƠ KHÍ', major: 'Kỹ thuật Cơ khí', program: 'ME/KTCK', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA CƠ KHÍ', major: 'Công nghệ Dệt, May', program: 'TC/CNDM', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA CƠ KHÍ', major: 'Kỹ thuật Cơ điện tử', program: 'MCE/CDT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA CƠ KHÍ', major: 'Kỹ thuật Dệt', program: 'TE/KTD', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA CƠ KHÍ', major: 'Kỹ thuật Nhiệt', program: 'HE/KTN', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT ĐỊA CHẤT VÀ DẦU KHÍ', major: 'Kỹ thuật Địa chất', program: 'GE/KTDC', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT ĐỊA CHẤT VÀ DẦU KHÍ', major: 'Kỹ thuật Dầu khí', program: 'PE/KTDK', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT ĐỊA CHẤT VÀ DẦU KHÍ', major: 'Địa Kỹ thuật Xây dựng', program: 'GTE/DKTXD', latest: ['Từ 2026'], previous: ['Từ 2024'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Kỹ thuật Điều khiển và Tự động hóa', program: 'CA/DKTDH', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Kỹ thuật Điện tử - Viễn thông', program: 'ET/DTVT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Kỹ thuật Điện', program: 'EE/KTDIEN', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Thiết kế vi mạch', program: 'ICD/TKVM', latest: ['Từ 2026'], previous: ['Từ 2024'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Song ngành: Kỹ thuật Điện tử - Viễn thông - Kỹ thuật Điện', program: 'DM/2DK', latest: [], previous: ['2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Song ngành: Kỹ thuật Điện tử - Viễn thông - Kỹ thuật Điều khiển và Tự động hóa', program: 'DM/2DT', latest: [], previous: ['2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Song ngành: Kỹ thuật Điện - Kỹ thuật Điện tử - Viễn thông', program: 'DM/2KD', latest: [], previous: ['2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Song ngành: Kỹ thuật Điện - Kỹ thuật Điều khiển và Tự động hóa', program: 'DM/2KT', latest: [], previous: ['2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Song ngành: Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện tử - Viễn thông', program: 'DM/2TD', latest: [], previous: ['2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA ĐIỆN - ĐIỆN TỬ', major: 'Song ngành: Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện', program: 'DM/2TK', latest: [], previous: ['2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT GIAO THÔNG', major: 'Kỹ thuật Hàng không', program: 'AE/KTHK', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT GIAO THÔNG', major: 'Kỹ thuật Ô tô', program: 'AUT/KTOT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT GIAO THÔNG', major: 'Kỹ thuật Tàu thủy', program: 'NAE/KTTT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT GIAO THÔNG', major: 'Song ngành: Kỹ thuật Tàu thủy - Hàng không', program: 'DM/THK', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT GIAO THÔNG', major: 'Kỹ thuật Đường sắt', program: 'RE/KTDS', latest: ['Từ 2026'], previous: [] },
    { faculty: 'KHOA KỸ THUẬT GIAO THÔNG', major: 'Kỹ thuật Phương tiện không người lái', program: null, latest: [], previous: ['Từ 2027'] },
    { faculty: 'KHOA KỸ THUẬT GIAO THÔNG', major: 'Kỹ thuật Giao thông thông minh', program: null, latest: [], previous: ['Từ 2027'] },
    { faculty: 'KHOA KỸ THUẬT HÓA HỌC', major: 'Công nghệ Sinh học', program: 'BT/CNSH', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT HÓA HỌC', major: 'Kỹ thuật Hóa học', program: 'CHE/KTHH', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT HÓA HỌC', major: 'Công nghệ Thực phẩm', program: 'FT/CNTP', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA MÔI TRƯỜNG VÀ TÀI NGUYÊN', major: 'Kỹ thuật Môi trường', program: 'ENV/KTMTR', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA MÔI TRƯỜNG VÀ TÀI NGUYÊN', major: 'Quản lý Tài nguyên và Môi trường', program: 'NR/QLTNMT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA MÔI TRƯỜNG VÀ TÀI NGUYÊN', major: 'Kinh tế tài nguyên thiên nhiên', program: 'NRE/KTTNTN', latest: ['Từ 2026'], previous: ['Từ 2025'] },
    { faculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH', major: 'Khoa học Máy tính', program: 'CS/KHMT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH', major: 'Kỹ thuật máy tính', program: 'CE/KTMT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH', major: 'Công nghệ Thông tin (Vừa Làm Vừa Học)', program: null, latest: [], previous: ['2023', '2022', '2021', '2020'] },
    { faculty: 'KHOA QUẢN LÝ CÔNG NGHIỆP', major: 'Quản lý công nghiệp', program: 'IM/QLCN', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA QUẢN LÝ CÔNG NGHIỆP', major: 'Quản trị Kinh doanh', program: 'BA/QTKD', latest: ['Từ 2026'], previous: ['Từ 2025'] },
    { faculty: 'KHOA QUẢN LÝ CÔNG NGHIỆP', major: 'Kỹ thuật Hệ thống Công nghiệp', program: 'ISE/HTCN', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA QUẢN LÝ CÔNG NGHIỆP', major: 'Logistics và Quản lý Chuỗi cung ứng', program: 'LSC/LQLCCU', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KHOA HỌC ỨNG DỤNG', major: 'Cơ Kỹ thuật', program: 'EM/CKT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KHOA HỌC ỨNG DỤNG', major: 'Vật lý Kỹ thuật', program: 'EP/VLKT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KHOA HỌC ỨNG DỤNG', major: 'Khoa học dữ liệu', program: 'DS/KHDL', latest: ['Từ 2026'], previous: ['Từ 2024'] },
    { faculty: 'KHOA KHOA HỌC ỨNG DỤNG', major: 'Kỹ thuật Hạt nhân', program: 'NE/KTHN', latest: ['Từ 2026'], previous: [] },
    { faculty: 'KHOA KHOA HỌC ỨNG DỤNG', major: 'Kỹ thuật Lượng tử', program: null, latest: [], previous: ['Từ 2027'] },
    { faculty: 'KHOA CÔNG NGHỆ VẬT LIỆU', major: 'Kỹ thuật Vật liệu', program: 'MSE/KTVL', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA CÔNG NGHỆ VẬT LIỆU', major: 'Kỹ thuật Bán dẫn', program: 'SCE/KTBD', latest: ['Từ 2026'], previous: [] },
    { faculty: 'KHOA CÔNG NGHỆ VẬT LIỆU', major: 'Kỹ thuật Chế biến khoáng sản', program: null, latest: [], previous: ['Từ 2027'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kỹ thuật Công trình biển', program: 'COE/XDCTB', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kỹ thuật Cơ sở hạ tầng', program: 'IE/KTCSHT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Công nghệ Kỹ thuật Vật liệu Xây dựng', program: 'CM/CNVLXD', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kỹ thuật Xây dựng', program: 'CVE/KTXD', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kiến trúc', program: 'AR/KT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kỹ thuật Trắc địa - Bản đồ', program: 'GEO/TDBD', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kỹ thuật Xây dựng Công trình Thủy', program: 'HWE/XDCTT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kỹ thuật Xây dựng Công trình Giao thông', program: 'TRE/XDCTGT', latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020', '2019'] },
    { faculty: 'KHOA KỸ THUẬT XÂY DỰNG', major: 'Kinh tế Xây dựng', program: 'CEM/KTEXD', latest: ['Từ 2026'], previous: ['Từ 2024'] },
    { faculty: 'VIỆT PHÁP', major: 'Kỹ thuật Cơ điện tử', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'VIỆT PHÁP', major: 'Hàng không', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'VIỆT PHÁP', major: 'Vật liệu Polymer và Composite', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'VIỆT PHÁP', major: 'Vật liệu và Năng lượng', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'VIỆT PHÁP', major: 'Viễn thông', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'VIỆT PHÁP', major: 'Hệ thống năng lượng điện', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'VIỆT PHÁP', major: 'Kỹ thuật và quản lý nước đô thị', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021', '2020'] },
    { faculty: 'VIỆT PHÁP', major: 'Xây dựng dân dụng - Công nghiệp và Hiệu quả', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'CHƯƠNG TRÌNH TIÊN TIẾN', major: 'Vi mạch - Hệ thống phần cứng', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'CHƯƠNG TRÌNH TIÊN TIẾN', major: 'Hệ thống Năng lượng', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'CHƯƠNG TRÌNH TIÊN TIẾN', major: 'Kỹ thuật Điều khiển và Tự động hoá', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
    { faculty: 'CHƯƠNG TRÌNH TIÊN TIẾN', major: 'Hệ thống Viễn thông', program: null, latest: ['Từ 2026'], previous: ['Từ 2024', '2023', '2022', '2021'] },
];
