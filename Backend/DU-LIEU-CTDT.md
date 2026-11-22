# Dữ liệu môn học và chương trình đào tạo trong database

Số liệu lấy trực tiếp từ database (schema `bk_uni`) ngày 2026-11-20, sau khi thay toàn bộ CTĐT bằng dữ liệu cào từ API myBK (`Scraper/curriculum/build-from-mybk.cjs`). Danh sách đối chiếu là trang AAO "Chương trình đào tạo từ khóa 2019" (`a.html`).

## 1. Tổng quan

| Chỉ số | Giá trị |
|---|---|
| Chương trình đào tạo | **132** (khóa 2023: 46, 2024: 40, 2025: 2, 2026: 44) |
| Môn học trong danh mục (`courses`) | **5675** |
| Môn thuộc ít nhất một CTĐT | 1626 |
| Môn không thuộc CTĐT nào | 4049 |
| Mã môn có đề cương (`course_outlines`) | 2522 |
| Môn trong CTĐT có đề cương | 1127/1626 |
| Môn trong CTĐT có lịch sử mở lớp | 1188/1626 |

## 2. Môn học so với chương trình đào tạo

Danh mục môn dùng chung cho mọi CTĐT; một môn (ví dụ MT1003, LA1003) nằm trong nhiều CTĐT.

### 2.1. Môn không thuộc CTĐT nào (4049)

Gồm môn còn lại từ dữ liệu cũ (CTĐT nhập từ PDF đã xóa), môn tạo khi import đề cương hoặc lịch mở lớp. Không ảnh hưởng phân tích; sinh viên khai các môn này thì được xét vào khối tự chọn tự do.

| Nhóm (một môn có thể thuộc nhiều nhóm) | Số môn |
|---|---|
| Có sinh viên đã khai (`student_courses`) | 0 |
| Có đề cương | 1358 |
| Có lịch sử mở lớp | 4048 |
| Không có đề cương, mở lớp hay sinh viên khai | 1 |

### 2.2. Môn dùng chung nhiều CTĐT nhất

| Mã | Tên | TC | Số CTĐT |
|---|---|---|---|
| LA1003 | Anh văn 1 / English 1 | 2 | 132 |
| LA1005 | Anh văn 2 / English 2 | 2 | 132 |
| LA1007 | Anh văn 3 / English 3 | 2 | 132 |
| LA1009 | Anh văn 4 / English 4 | 2 | 132 |
| MI1003 | Giáo dục Quốc phòng / Military Training | 0 | 132 |
| MT1007 | Đại số Tuyến tính / Linear Algebra | 3 | 132 |
| PE1003 | Giáo dục thể chất 1 / Physical Education 1 | 0 | 132 |
| PE1005 | Giáo dục thể chất 2 / Physical Education 2 | 0 | 132 |
| PH1003 | Vật lý 1 / General Physics 1 | 4 | 132 |
| SA4001 | Hoạt động sinh viên / Student Activities | 0 | 132 |
| SP1031 | Triết học Mác - Lênin / Marxist - Leninist Philosophy | 3 | 132 |
| SP1033 | Kinh tế Chính trị Mác - Lênin / Marxist - Leninist Political Economy | 2 | 132 |
| SP1035 | Chủ nghĩa Xã hội Khoa học / Scientific Socialism | 2 | 132 |
| SP1037 | Tư tưởng Hồ Chí Minh / Ho Chi Minh Ideology | 2 | 132 |
| SP1039 | Lịch sử Đảng Cộng sản Việt Nam / History of VieTNamese Communist Party | 2 | 132 |

### 2.3. Theo tiền tố mã môn

| Tiền tố | Tổng | Trong CTĐT | Ngoài CTĐT | Có đề cương |
|---|---|---|---|---|
| CI | 761 | 173 | 588 | 329 |
| CH | 736 | 166 | 570 | 246 |
| ME | 694 | 218 | 476 | 380 |
| EE | 540 | 158 | 382 | 311 |
| GE | 378 | 143 | 235 | 176 |
| AS | 327 | 132 | 195 | 203 |
| EN | 325 | 115 | 210 | 119 |
| MA | 311 | 129 | 182 | 169 |
| CO | 276 | 90 | 186 | 158 |
| TR | 275 | 121 | 154 | 133 |
| IM | 225 | 102 | 123 | 129 |
| IU | 97 | 42 | 55 | 46 |
| LA | 67 | 4 | 63 | 33 |
| PE | 28 | 2 | 26 | 0 |
| SP | 27 | 7 | 20 | 7 |
| GK | 20 | 0 | 20 | 16 |
| MT | 19 | 7 | 12 | 17 |
| PH | 10 | 5 | 5 | 10 |
| AV | 8 | 0 | 8 | 0 |
| SK | 8 | 8 | 0 | 3 |
| SA | 6 | 1 | 5 | 0 |
| ENG | 2 | 2 | 0 | 0 |
| 001004 | 1 | 0 | 1 | 0 |
| 003401 | 1 | 0 | 1 | 0 |
| 003705 | 1 | 0 | 1 | 0 |
| 003706 | 1 | 0 | 1 | 0 |
| 003707 | 1 | 0 | 1 | 0 |
| 003708 | 1 | 0 | 1 | 0 |
| 003709 | 1 | 0 | 1 | 0 |
| 003720 | 1 | 0 | 1 | 0 |
| 003721 | 1 | 0 | 1 | 0 |
| 003722 | 1 | 0 | 1 | 0 |
| 003723 | 1 | 0 | 1 | 0 |
| 003724 | 1 | 0 | 1 | 0 |
| 003727 | 1 | 0 | 1 | 0 |
| 003728 | 1 | 0 | 1 | 0 |
| 003729 | 1 | 0 | 1 | 0 |
| 003730 | 1 | 0 | 1 | 0 |
| 006023 | 1 | 0 | 1 | 0 |
| 006401 | 1 | 0 | 1 | 0 |
| 006406 | 1 | 0 | 1 | 0 |
| 006407 | 1 | 0 | 1 | 0 |
| 006714 | 1 | 0 | 1 | 0 |
| 006717 | 1 | 0 | 1 | 0 |
| 007030 | 1 | 0 | 1 | 0 |
| 007301 | 1 | 0 | 1 | 0 |
| 007302 | 1 | 0 | 1 | 0 |
| 007303 | 1 | 0 | 1 | 0 |
| 007703 | 1 | 0 | 1 | 0 |
| 007707 | 1 | 0 | 1 | 0 |
| 007710 | 1 | 0 | 1 | 0 |
| 008701 | 1 | 0 | 1 | 0 |
| 009053 | 1 | 0 | 1 | 0 |
| 0X6603 | 1 | 0 | 1 | 0 |
| 200004 | 1 | 0 | 1 | 0 |
| 200006 | 1 | 0 | 1 | 0 |
| 200008 | 1 | 0 | 1 | 0 |
| 201302 | 1 | 0 | 1 | 0 |
| 201303 | 1 | 0 | 1 | 0 |
| 201701 | 1 | 0 | 1 | 0 |
| 201702 | 1 | 0 | 1 | 0 |
| 201703 | 1 | 0 | 1 | 0 |
| 201704 | 1 | 0 | 1 | 0 |
| 201705 | 1 | 0 | 1 | 0 |
| 201706 | 1 | 0 | 1 | 0 |
| 201708 | 1 | 0 | 1 | 0 |
| 202302 | 1 | 0 | 1 | 0 |
| 202303 | 1 | 0 | 1 | 0 |
| 202701 | 1 | 0 | 1 | 0 |
| 202702 | 1 | 0 | 1 | 0 |
| 202703 | 1 | 0 | 1 | 0 |
| 202704 | 1 | 0 | 1 | 0 |
| 202838 | 1 | 0 | 1 | 0 |
| 203302 | 1 | 0 | 1 | 0 |
| 203303 | 1 | 0 | 1 | 0 |
| 204302 | 1 | 0 | 1 | 0 |
| 204303 | 1 | 0 | 1 | 0 |
| 205701 | 1 | 0 | 1 | 0 |
| 206202 | 1 | 0 | 1 | 0 |
| 206203 | 1 | 0 | 1 | 0 |
| 206204 | 1 | 0 | 1 | 0 |
| 206302 | 1 | 0 | 1 | 0 |
| 206303 | 1 | 0 | 1 | 0 |
| 206701 | 1 | 0 | 1 | 0 |
| 206830 | 1 | 0 | 1 | 0 |
| 206831 | 1 | 0 | 1 | 0 |
| 207701 | 1 | 0 | 1 | 0 |
| 207702 | 1 | 0 | 1 | 0 |
| 207703 | 1 | 0 | 1 | 0 |
| 207704 | 1 | 0 | 1 | 0 |
| 207705 | 1 | 0 | 1 | 0 |
| 208302 | 1 | 0 | 1 | 0 |
| 208303 | 1 | 0 | 1 | 0 |
| 209037 | 1 | 0 | 1 | 0 |
| 209302 | 1 | 0 | 1 | 0 |
| 209303 | 1 | 0 | 1 | 0 |
| 209701 | 1 | 0 | 1 | 0 |
| 209702 | 1 | 0 | 1 | 0 |
| 209703 | 1 | 0 | 1 | 0 |
| 209704 | 1 | 0 | 1 | 0 |
| 209705 | 1 | 0 | 1 | 0 |
| 209801 | 1 | 0 | 1 | 0 |
| 210014 | 1 | 0 | 1 | 0 |
| 210302 | 1 | 0 | 1 | 0 |
| 210303 | 1 | 0 | 1 | 0 |
| 210701 | 1 | 0 | 1 | 0 |
| 210702 | 1 | 0 | 1 | 0 |
| 213029 | 1 | 0 | 1 | 0 |
| 213034 | 1 | 0 | 1 | 0 |
| 213302 | 1 | 0 | 1 | 0 |
| 213303 | 1 | 0 | 1 | 0 |
| 213700 | 1 | 0 | 1 | 0 |
| 213701 | 1 | 0 | 1 | 0 |
| 213702 | 1 | 0 | 1 | 0 |
| 213703 | 1 | 0 | 1 | 0 |
| 213704 | 1 | 0 | 1 | 0 |
| 213705 | 1 | 0 | 1 | 0 |
| 213706 | 1 | 0 | 1 | 0 |
| 213707 | 1 | 0 | 1 | 0 |
| 213708 | 1 | 0 | 1 | 0 |
| 213709 | 1 | 0 | 1 | 0 |
| 213710 | 1 | 0 | 1 | 0 |
| 213711 | 1 | 0 | 1 | 0 |
| 213712 | 1 | 0 | 1 | 0 |
| 213713 | 1 | 0 | 1 | 0 |
| 213714 | 1 | 0 | 1 | 0 |
| 213715 | 1 | 0 | 1 | 0 |
| 213716 | 1 | 0 | 1 | 0 |
| 213717 | 1 | 0 | 1 | 0 |
| 213719 | 1 | 0 | 1 | 0 |
| 213720 | 1 | 0 | 1 | 0 |
| 213750 | 1 | 0 | 1 | 0 |
| 213751 | 1 | 0 | 1 | 0 |
| 213752 | 1 | 0 | 1 | 0 |
| 213757 | 1 | 0 | 1 | 0 |
| 213758 | 1 | 0 | 1 | 0 |
| 214030 | 1 | 0 | 1 | 0 |
| 214302 | 1 | 0 | 1 | 0 |
| 214303 | 1 | 0 | 1 | 0 |
| 214701 | 1 | 0 | 1 | 0 |
| 214702 | 1 | 0 | 1 | 0 |
| 215135 | 1 | 0 | 1 | 0 |
| 215302 | 1 | 0 | 1 | 0 |
| 215303 | 1 | 0 | 1 | 0 |
| 215700 | 1 | 0 | 1 | 0 |
| 215701 | 1 | 0 | 1 | 0 |
| 215702 | 1 | 0 | 1 | 0 |
| 215703 | 1 | 0 | 1 | 0 |
| 215706 | 1 | 0 | 1 | 0 |
| 215707 | 1 | 0 | 1 | 0 |
| 215708 | 1 | 0 | 1 | 0 |
| 215709 | 1 | 0 | 1 | 0 |
| 215710 | 1 | 0 | 1 | 0 |
| 215711 | 1 | 0 | 1 | 0 |
| 215712 | 1 | 0 | 1 | 0 |
| 215713 | 1 | 0 | 1 | 0 |
| 215714 | 1 | 0 | 1 | 0 |
| 215715 | 1 | 0 | 1 | 0 |
| 215716 | 1 | 0 | 1 | 0 |
| 215717 | 1 | 0 | 1 | 0 |
| 215718 | 1 | 0 | 1 | 0 |
| 215719 | 1 | 0 | 1 | 0 |
| 215720 | 1 | 0 | 1 | 0 |
| 215721 | 1 | 0 | 1 | 0 |
| 215722 | 1 | 0 | 1 | 0 |
| 215723 | 1 | 0 | 1 | 0 |
| 215724 | 1 | 0 | 1 | 0 |
| 215725 | 1 | 0 | 1 | 0 |
| 215728 | 1 | 0 | 1 | 0 |
| 215738 | 1 | 0 | 1 | 0 |
| 215739 | 1 | 0 | 1 | 0 |
| 215740 | 1 | 0 | 1 | 0 |
| 215741 | 1 | 0 | 1 | 0 |
| 215742 | 1 | 0 | 1 | 0 |
| 215743 | 1 | 0 | 1 | 0 |
| 215744 | 1 | 0 | 1 | 0 |
| 215751 | 1 | 0 | 1 | 0 |
| 215752 | 1 | 0 | 1 | 0 |
| 216302 | 1 | 0 | 1 | 0 |
| 216303 | 1 | 0 | 1 | 0 |
| 216700 | 1 | 0 | 1 | 0 |
| 216701 | 1 | 0 | 1 | 0 |
| 216750 | 1 | 0 | 1 | 0 |
| 216757 | 1 | 0 | 1 | 0 |
| 216758 | 1 | 0 | 1 | 0 |
| 217302 | 1 | 0 | 1 | 0 |
| 217303 | 1 | 0 | 1 | 0 |
| 217700 | 1 | 0 | 1 | 0 |
| 217750 | 1 | 0 | 1 | 0 |
| 217757 | 1 | 0 | 1 | 0 |
| 217758 | 1 | 0 | 1 | 0 |
| 218302 | 1 | 0 | 1 | 0 |
| 218303 | 1 | 0 | 1 | 0 |
| 218700 | 1 | 0 | 1 | 0 |
| 218701 | 1 | 0 | 1 | 0 |
| 218702 | 1 | 0 | 1 | 0 |
| 218703 | 1 | 0 | 1 | 0 |
| 218704 | 1 | 0 | 1 | 0 |
| 218705 | 1 | 0 | 1 | 0 |
| 218706 | 1 | 0 | 1 | 0 |
| 218708 | 1 | 0 | 1 | 0 |
| 218750 | 1 | 0 | 1 | 0 |
| 218751 | 1 | 0 | 1 | 0 |
| 218752 | 1 | 0 | 1 | 0 |
| 218757 | 1 | 0 | 1 | 0 |
| 218758 | 1 | 0 | 1 | 0 |
| 218827 | 1 | 0 | 1 | 0 |
| 218828 | 1 | 0 | 1 | 0 |
| 219303 | 1 | 0 | 1 | 0 |
| 260603 | 1 | 0 | 1 | 0 |
| 260604 | 1 | 0 | 1 | 0 |
| 260605 | 1 | 0 | 1 | 0 |
| 260608 | 1 | 0 | 1 | 0 |
| 260610 | 1 | 0 | 1 | 0 |
| 260612 | 1 | 0 | 1 | 0 |
| 260615 | 1 | 0 | 1 | 0 |
| 260616 | 1 | 0 | 1 | 0 |
| 260618 | 1 | 0 | 1 | 0 |
| 260619 | 1 | 0 | 1 | 0 |
| 260620 | 1 | 0 | 1 | 0 |
| 260621 | 1 | 0 | 1 | 0 |
| 260623 | 1 | 0 | 1 | 0 |
| 260625 | 1 | 0 | 1 | 0 |
| 260627 | 1 | 0 | 1 | 0 |
| 260628 | 1 | 0 | 1 | 0 |
| 260657 | 1 | 0 | 1 | 0 |
| 260661 | 1 | 0 | 1 | 0 |
| 260663 | 1 | 0 | 1 | 0 |
| 300302 | 1 | 0 | 1 | 0 |
| 300303 | 1 | 0 | 1 | 0 |
| 301302 | 1 | 0 | 1 | 0 |
| 301303 | 1 | 0 | 1 | 0 |
| 302302 | 1 | 0 | 1 | 0 |
| 302303 | 1 | 0 | 1 | 0 |
| 303017 | 1 | 0 | 1 | 0 |
| 303302 | 1 | 0 | 1 | 0 |
| 303303 | 1 | 0 | 1 | 0 |
| 304003 | 1 | 0 | 1 | 0 |
| 304006 | 1 | 0 | 1 | 0 |
| 304008 | 1 | 0 | 1 | 0 |
| 305302 | 1 | 0 | 1 | 0 |
| 305303 | 1 | 0 | 1 | 0 |
| 400004 | 1 | 0 | 1 | 0 |
| 400008 | 1 | 0 | 1 | 0 |
| 400009 | 1 | 0 | 1 | 0 |
| 400013 | 1 | 0 | 1 | 0 |
| 400018 | 1 | 0 | 1 | 0 |
| 400055 | 1 | 0 | 1 | 0 |
| 400302 | 1 | 0 | 1 | 0 |
| 400303 | 1 | 0 | 1 | 0 |
| 400323 | 1 | 0 | 1 | 0 |
| 400409 | 1 | 0 | 1 | 0 |
| 400410 | 1 | 0 | 1 | 0 |
| 400416 | 1 | 0 | 1 | 0 |
| 400431 | 1 | 0 | 1 | 0 |
| 400432 | 1 | 0 | 1 | 0 |
| 400433 | 1 | 0 | 1 | 0 |
| 400434 | 1 | 0 | 1 | 0 |
| 400809 | 1 | 0 | 1 | 0 |
| 400816 | 1 | 0 | 1 | 0 |
| 401402 | 1 | 0 | 1 | 0 |
| 401403 | 1 | 0 | 1 | 0 |
| 401701 | 1 | 0 | 1 | 0 |
| 401702 | 1 | 0 | 1 | 0 |
| 401703 | 1 | 0 | 1 | 0 |
| 401705 | 1 | 0 | 1 | 0 |
| 401706 | 1 | 0 | 1 | 0 |
| 401707 | 1 | 0 | 1 | 0 |
| 401708 | 1 | 0 | 1 | 0 |
| 401709 | 1 | 0 | 1 | 0 |
| 401710 | 1 | 0 | 1 | 0 |
| 401711 | 1 | 0 | 1 | 0 |
| 401712 | 1 | 0 | 1 | 0 |
| 402401 | 1 | 0 | 1 | 0 |
| 402404 | 1 | 0 | 1 | 0 |
| 402408 | 1 | 0 | 1 | 0 |
| 402701 | 1 | 0 | 1 | 0 |
| 402702 | 1 | 0 | 1 | 0 |
| 402703 | 1 | 0 | 1 | 0 |
| 402704 | 1 | 0 | 1 | 0 |
| 402706 | 1 | 0 | 1 | 0 |
| 402708 | 1 | 0 | 1 | 0 |
| 402709 | 1 | 0 | 1 | 0 |
| 403302 | 1 | 0 | 1 | 0 |
| 403303 | 1 | 0 | 1 | 0 |
| 403402 | 1 | 0 | 1 | 0 |
| 403409 | 1 | 0 | 1 | 0 |
| 403700 | 1 | 0 | 1 | 0 |
| 403702 | 1 | 0 | 1 | 0 |
| 403703 | 1 | 0 | 1 | 0 |
| 403705 | 1 | 0 | 1 | 0 |
| 403707 | 1 | 0 | 1 | 0 |
| 403708 | 1 | 0 | 1 | 0 |
| 403750 | 1 | 0 | 1 | 0 |
| 403751 | 1 | 0 | 1 | 0 |
| 403752 | 1 | 0 | 1 | 0 |
| 403757 | 1 | 0 | 1 | 0 |
| 403758 | 1 | 0 | 1 | 0 |
| 403922 | 1 | 0 | 1 | 0 |
| 403925 | 1 | 0 | 1 | 0 |
| 403931 | 1 | 0 | 1 | 0 |
| 403933 | 1 | 0 | 1 | 0 |
| 404401 | 1 | 0 | 1 | 0 |
| 404403 | 1 | 0 | 1 | 0 |
| 404703 | 1 | 0 | 1 | 0 |
| 404704 | 1 | 0 | 1 | 0 |
| 404705 | 1 | 0 | 1 | 0 |
| 404707 | 1 | 0 | 1 | 0 |
| 404708 | 1 | 0 | 1 | 0 |
| 404710 | 1 | 0 | 1 | 0 |
| 404711 | 1 | 0 | 1 | 0 |
| 404712 | 1 | 0 | 1 | 0 |
| 404713 | 1 | 0 | 1 | 0 |
| 405402 | 1 | 0 | 1 | 0 |
| 405403 | 1 | 0 | 1 | 0 |
| 405404 | 1 | 0 | 1 | 0 |
| 405405 | 1 | 0 | 1 | 0 |
| 405406 | 1 | 0 | 1 | 0 |
| 405407 | 1 | 0 | 1 | 0 |
| 405408 | 1 | 0 | 1 | 0 |
| 405409 | 1 | 0 | 1 | 0 |
| 405412 | 1 | 0 | 1 | 0 |
| 405413 | 1 | 0 | 1 | 0 |
| 405414 | 1 | 0 | 1 | 0 |
| 405507 | 1 | 0 | 1 | 0 |
| 405508 | 1 | 0 | 1 | 0 |
| 405700 | 1 | 0 | 1 | 0 |
| 405701 | 1 | 0 | 1 | 0 |
| 405702 | 1 | 0 | 1 | 0 |
| 405703 | 1 | 0 | 1 | 0 |
| 405704 | 1 | 0 | 1 | 0 |
| 405705 | 1 | 0 | 1 | 0 |
| 405706 | 1 | 0 | 1 | 0 |
| 405709 | 1 | 0 | 1 | 0 |
| 405710 | 1 | 0 | 1 | 0 |
| 405711 | 1 | 0 | 1 | 0 |
| 405712 | 1 | 0 | 1 | 0 |
| 405713 | 1 | 0 | 1 | 0 |
| 405714 | 1 | 0 | 1 | 0 |
| 405715 | 1 | 0 | 1 | 0 |
| 405718 | 1 | 0 | 1 | 0 |
| 405719 | 1 | 0 | 1 | 0 |
| 405725 | 1 | 0 | 1 | 0 |
| 405750 | 1 | 0 | 1 | 0 |
| 405751 | 1 | 0 | 1 | 0 |
| 405752 | 1 | 0 | 1 | 0 |
| 405757 | 1 | 0 | 1 | 0 |
| 405758 | 1 | 0 | 1 | 0 |
| 405902 | 1 | 0 | 1 | 0 |
| 405903 | 1 | 0 | 1 | 0 |
| 406701 | 1 | 0 | 1 | 0 |
| 406702 | 1 | 0 | 1 | 0 |
| 407406 | 1 | 0 | 1 | 0 |
| 407410 | 1 | 0 | 1 | 0 |
| 407701 | 1 | 0 | 1 | 0 |
| 407702 | 1 | 0 | 1 | 0 |
| 408402 | 1 | 0 | 1 | 0 |
| 408403 | 1 | 0 | 1 | 0 |
| 408405 | 1 | 0 | 1 | 0 |
| 408406 | 1 | 0 | 1 | 0 |
| 408701 | 1 | 0 | 1 | 0 |
| 408703 | 1 | 0 | 1 | 0 |
| 408705 | 1 | 0 | 1 | 0 |
| 408706 | 1 | 0 | 1 | 0 |
| 408707 | 1 | 0 | 1 | 0 |
| 408708 | 1 | 0 | 1 | 0 |
| 408709 | 1 | 0 | 1 | 0 |
| 408710 | 1 | 0 | 1 | 0 |
| 408711 | 1 | 0 | 1 | 0 |
| 409302 | 1 | 0 | 1 | 0 |
| 409303 | 1 | 0 | 1 | 0 |
| 409401 | 1 | 0 | 1 | 0 |
| 409402 | 1 | 0 | 1 | 0 |
| 409403 | 1 | 0 | 1 | 0 |
| 409404 | 1 | 0 | 1 | 0 |
| 409405 | 1 | 0 | 1 | 0 |
| 409412 | 1 | 0 | 1 | 0 |
| 409701 | 1 | 0 | 1 | 0 |
| 409702 | 1 | 0 | 1 | 0 |
| 409703 | 1 | 0 | 1 | 0 |
| 409704 | 1 | 0 | 1 | 0 |
| 409836 | 1 | 0 | 1 | 0 |
| 409908 | 1 | 0 | 1 | 0 |
| 440302 | 1 | 0 | 1 | 0 |
| 440303 | 1 | 0 | 1 | 0 |
| 440323 | 1 | 0 | 1 | 0 |
| 500004 | 1 | 0 | 1 | 0 |
| 500006 | 1 | 0 | 1 | 0 |
| 500009 | 1 | 0 | 1 | 0 |
| 500302 | 1 | 0 | 1 | 0 |
| 500303 | 1 | 0 | 1 | 0 |
| 500323 | 1 | 0 | 1 | 0 |
| 501302 | 1 | 0 | 1 | 0 |
| 501303 | 1 | 0 | 1 | 0 |
| 501533 | 1 | 0 | 1 | 0 |
| 501702 | 1 | 0 | 1 | 0 |
| 501703 | 1 | 0 | 1 | 0 |
| 501704 | 1 | 0 | 1 | 0 |
| 501705 | 1 | 0 | 1 | 0 |
| 501706 | 1 | 0 | 1 | 0 |
| 501707 | 1 | 0 | 1 | 0 |
| 501708 | 1 | 0 | 1 | 0 |
| 501709 | 1 | 0 | 1 | 0 |
| 501710 | 1 | 0 | 1 | 0 |
| 501711 | 1 | 0 | 1 | 0 |
| 504302 | 1 | 0 | 1 | 0 |
| 504303 | 1 | 0 | 1 | 0 |
| 5X0303 | 1 | 0 | 1 | 0 |
| 5X0603 | 1 | 0 | 1 | 0 |
| 5X0631 | 1 | 0 | 1 | 0 |
| 5X0632 | 1 | 0 | 1 | 0 |
| 5X0633 | 1 | 0 | 1 | 0 |
| 600004 | 1 | 0 | 1 | 0 |
| 600007 | 1 | 0 | 1 | 0 |
| 600011 | 1 | 0 | 1 | 0 |
| 600302 | 1 | 0 | 1 | 0 |
| 600303 | 1 | 0 | 1 | 0 |
| 601302 | 1 | 0 | 1 | 0 |
| 601303 | 1 | 0 | 1 | 0 |
| 601702 | 1 | 0 | 1 | 0 |
| 601703 | 1 | 0 | 1 | 0 |
| 602302 | 1 | 0 | 1 | 0 |
| 602303 | 1 | 0 | 1 | 0 |
| 603302 | 1 | 0 | 1 | 0 |
| 603303 | 1 | 0 | 1 | 0 |
| 603936 | 1 | 0 | 1 | 0 |
| 604302 | 1 | 0 | 1 | 0 |
| 604303 | 1 | 0 | 1 | 0 |
| 605302 | 1 | 0 | 1 | 0 |
| 605303 | 1 | 0 | 1 | 0 |
| 606302 | 1 | 0 | 1 | 0 |
| 606303 | 1 | 0 | 1 | 0 |
| 606809 | 1 | 0 | 1 | 0 |
| 607302 | 1 | 0 | 1 | 0 |
| 607303 | 1 | 0 | 1 | 0 |
| 607832 | 1 | 0 | 1 | 0 |
| 608302 | 1 | 0 | 1 | 0 |
| 608303 | 1 | 0 | 1 | 0 |
| 610043 | 1 | 0 | 1 | 0 |
| 610086 | 1 | 0 | 1 | 0 |
| 610302 | 1 | 0 | 1 | 0 |
| 610303 | 1 | 0 | 1 | 0 |
| 610702 | 1 | 0 | 1 | 0 |
| 610832 | 1 | 0 | 1 | 0 |
| 610834 | 1 | 0 | 1 | 0 |
| 611302 | 1 | 0 | 1 | 0 |
| 611303 | 1 | 0 | 1 | 0 |
| 611810 | 1 | 0 | 1 | 0 |
| 611813 | 1 | 0 | 1 | 0 |
| 700401 | 1 | 0 | 1 | 0 |
| 700403 | 1 | 0 | 1 | 0 |
| 700406 | 1 | 0 | 1 | 0 |
| 701054 | 1 | 0 | 1 | 0 |
| 701062 | 1 | 0 | 1 | 0 |
| 701122 | 1 | 0 | 1 | 0 |
| 701228 | 1 | 0 | 1 | 0 |
| 701302 | 1 | 0 | 1 | 0 |
| 701303 | 1 | 0 | 1 | 0 |
| 701323 | 1 | 0 | 1 | 0 |
| 701703 | 1 | 0 | 1 | 0 |
| 701705 | 1 | 0 | 1 | 0 |
| 701706 | 1 | 0 | 1 | 0 |
| 701707 | 1 | 0 | 1 | 0 |
| 701708 | 1 | 0 | 1 | 0 |
| 701709 | 1 | 0 | 1 | 0 |
| 701710 | 1 | 0 | 1 | 0 |
| 701711 | 1 | 0 | 1 | 0 |
| 800004 | 1 | 0 | 1 | 0 |
| 800006 | 1 | 0 | 1 | 0 |
| 800700 | 1 | 0 | 1 | 0 |
| 800702 | 1 | 0 | 1 | 0 |
| 800703 | 1 | 0 | 1 | 0 |
| 800704 | 1 | 0 | 1 | 0 |
| 800706 | 1 | 0 | 1 | 0 |
| 800707 | 1 | 0 | 1 | 0 |
| 800709 | 1 | 0 | 1 | 0 |
| 800752 | 1 | 0 | 1 | 0 |
| 800758 | 1 | 0 | 1 | 0 |
| 801302 | 1 | 0 | 1 | 0 |
| 801303 | 1 | 0 | 1 | 0 |
| 801831 | 1 | 0 | 1 | 0 |
| 801832 | 1 | 0 | 1 | 0 |
| 801833 | 1 | 0 | 1 | 0 |
| 801834 | 1 | 0 | 1 | 0 |
| 802703 | 1 | 0 | 1 | 0 |
| 802704 | 1 | 0 | 1 | 0 |
| 802705 | 1 | 0 | 1 | 0 |
| 802706 | 1 | 0 | 1 | 0 |
| 802707 | 1 | 0 | 1 | 0 |
| 802708 | 1 | 0 | 1 | 0 |
| 802709 | 1 | 0 | 1 | 0 |
| 802710 | 1 | 0 | 1 | 0 |
| 802711 | 1 | 0 | 1 | 0 |
| 803302 | 1 | 0 | 1 | 0 |
| 803303 | 1 | 0 | 1 | 0 |
| 804041 | 1 | 0 | 1 | 0 |
| 804047 | 1 | 0 | 1 | 0 |
| 804302 | 1 | 0 | 1 | 0 |
| 804303 | 1 | 0 | 1 | 0 |
| 804306 | 1 | 0 | 1 | 0 |
| 804323 | 1 | 0 | 1 | 0 |
| 804701 | 1 | 0 | 1 | 0 |
| 804702 | 1 | 0 | 1 | 0 |
| 804703 | 1 | 0 | 1 | 0 |
| 804705 | 1 | 0 | 1 | 0 |
| 804706 | 1 | 0 | 1 | 0 |
| 804707 | 1 | 0 | 1 | 0 |
| 804708 | 1 | 0 | 1 | 0 |
| 804836 | 1 | 0 | 1 | 0 |
| 804838 | 1 | 0 | 1 | 0 |
| 804841 | 1 | 0 | 1 | 0 |
| 804842 | 1 | 0 | 1 | 0 |
| 804847 | 1 | 0 | 1 | 0 |
| 805701 | 1 | 0 | 1 | 0 |
| 805702 | 1 | 0 | 1 | 0 |
| 805703 | 1 | 0 | 1 | 0 |
| 805704 | 1 | 0 | 1 | 0 |
| 805705 | 1 | 0 | 1 | 0 |
| 805829 | 1 | 0 | 1 | 0 |
| 806010 | 1 | 0 | 1 | 0 |
| 807701 | 1 | 0 | 1 | 0 |
| 807702 | 1 | 0 | 1 | 0 |
| 807703 | 1 | 0 | 1 | 0 |
| 807704 | 1 | 0 | 1 | 0 |
| 807705 | 1 | 0 | 1 | 0 |
| 808302 | 1 | 0 | 1 | 0 |
| 808303 | 1 | 0 | 1 | 0 |
| 808701 | 1 | 0 | 1 | 0 |
| 808870 | 1 | 0 | 1 | 0 |
| 808876 | 1 | 0 | 1 | 0 |
| 809702 | 1 | 0 | 1 | 0 |
| 809703 | 1 | 0 | 1 | 0 |
| 809704 | 1 | 0 | 1 | 0 |
| 809705 | 1 | 0 | 1 | 0 |
| 809706 | 1 | 0 | 1 | 0 |
| 809708 | 1 | 0 | 1 | 0 |
| 809709 | 1 | 0 | 1 | 0 |
| 809710 | 1 | 0 | 1 | 0 |
| 810000 | 1 | 0 | 1 | 0 |
| 810302 | 1 | 0 | 1 | 0 |
| 810303 | 1 | 0 | 1 | 0 |
| 810701 | 1 | 0 | 1 | 0 |
| 810825 | 1 | 0 | 1 | 0 |
| 812302 | 1 | 0 | 1 | 0 |
| 812303 | 1 | 0 | 1 | 0 |
| 812701 | 1 | 0 | 1 | 0 |
| 813022 | 1 | 0 | 1 | 0 |
| 813040 | 1 | 0 | 1 | 0 |
| 813302 | 1 | 0 | 1 | 0 |
| 813303 | 1 | 0 | 1 | 0 |
| 813701 | 1 | 0 | 1 | 0 |
| 813702 | 1 | 0 | 1 | 0 |
| 813703 | 1 | 0 | 1 | 0 |
| 813704 | 1 | 0 | 1 | 0 |
| 813706 | 1 | 0 | 1 | 0 |
| MI | 1 | 1 | 0 | 0 |
| P | 1 | 0 | 1 | 0 |

## 3. Chương trình đào tạo hiện có (132)

Cột: **TC** tổng tín chỉ tốt nghiệp; **Môn** số môn trong CTĐT (gồm tự chọn); **Xếp kỳ** số môn có năm/kỳ khuyến nghị; **Khối** số khối tự chọn gốc; **CN** số chuyên ngành ("bắt buộc": phải đạt một chuyên ngành); **QH** số quan hệ tiên quyết/học trước/song hành/khuyến nghị.

### Khóa 2023 (46)

| Mã | Ngành | Khoa | TC | Môn | Xếp kỳ | Khối | CN | QH | Nguồn myBK |
|---|---|---|---|---|---|---|---|---|---|
| LSC-2023-LQLCCU | Logistics và Quản lý Chuỗi cung ứng | Cơ khí | 132 | 48 | 41 | 1 | – | 30 | DH_CQ_CK_LQC_2023 |
| MCE-2023-CDT | Kỹ thuật Cơ điện tử | Cơ khí | 132 | 57 | 34 | 3 | 1 | 37 | DH_CQ_CK_COD_2023 |
| ME-2023-KTCK | Kỹ thuật Cơ khí | Cơ khí | 132 | 54 | 38 | 2 | – | 20 | DH_CQ_CK_CK1_2023 |
| TC-2023-CNDM | Công nghệ Dệt, May | Cơ khí | 131 | 53 | 44 | 2 | – | 18 | DH_CQ_CK_CDM_2023 |
| TE-2023-KTD | Kỹ thuật Dệt | Cơ khí | 131 | 52 | 44 | 2 | – | 19 | DH_CQ_CK_DET_2023 |
| MSE-2023-KTVL | Kỹ thuật Vật liệu | Công Nghệ Vật Liệu | 132 | 108 | 34 | 6 | – | 47 | DH_CQ_VL_VL1_2023 |
| MSE-2023-KTVL-VKH | Kỹ thuật Vật liệu Kim loại | Công Nghệ Vật Liệu | 132 | 63 | 34 | 3 | – | 29 | DH_CQ_VL_VKH_2023 |
| MSE-2023-KTVL-VKN | Kỹ thuật Vật liệu Năng lượng | Công Nghệ Vật Liệu | 132 | 58 | 34 | 3 | – | 30 | DH_CQ_VL_VKN_2023 |
| MSE-2023-KTVL-VPO | Kỹ thuật Vật liệu Polyme | Công Nghệ Vật Liệu | 132 | 57 | 34 | 3 | – | 37 | DH_CQ_VL_VPO_2023 |
| MSE-2023-KTVL-VSI | Kỹ thuật Vật liệu Silicat | Công Nghệ Vật Liệu | 132 | 64 | 34 | 3 | – | 25 | DH_CQ_VL_VSI_2023 |
| CA-2023-DKTDH | Kỹ thuật Điều khiển và Tự động hóa | Điện - Điện tử | 132 | 62 | 42 | 3 | – | 69 | DH_CQ_DD_DTH_2023 |
| DM-2023-2DK | Song ngành Kỹ thuật Điện tử - Viễn thông - Kỹ thuật Điện | Điện - Điện tử | 163 | 91 | 2 | 4 | – | 117 | DH_CQ_DD_2DK_2023 |
| DM-2023-2DT | Song ngành Kỹ thuật Điện tử-Viễn thông - Kỹ thuật Điều khiển và Tự động hóa | Điện - Điện tử | 163 | 86 | 2 | 4 | – | 89 | DH_CQ_DD_2DT_2023 |
| DM-2023-2KD | Song ngành Kỹ thuật Điện - Kỹ thuật Điện tử - Viễn thông | Điện - Điện tử | 163 | 91 | 2 | 4 | – | 117 | DH_CQ_DD_2KD_2023 |
| DM-2023-2KT | Song ngành Kỹ thuật Điện - Kỹ thuật Điều khiển và Tự động hóa | Điện - Điện tử | 162 | 83 | 2 | 4 | – | 95 | DH_CQ_DD_2KT_2023 |
| DM-2023-2TD | Song ngành Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện tử-Viễn thông | Điện - Điện tử | 163 | 86 | 2 | 4 | – | 89 | DH_CQ_DD_2TD_2023 |
| DM-2023-2TK | Song ngành Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện | Điện - Điện tử | 162 | 83 | 2 | 4 | – | 95 | DH_CQ_DD_2TK_2023 |
| EE-2023-KTDIEN | Kỹ thuật Điện | Điện - Điện tử | 132 | 69 | 40 | 3 | – | 100 | DH_CQ_DD_KDI_2023 |
| ET-2023-DTVT | Kỹ thuật Điện tử - Viễn thông | Điện - Điện tử | 132 | 67 | 42 | 3 | – | 93 | DH_CQ_DD_DVT_2023 |
| ICD-2023-TKVM | Thiết kế vi mạch | Điện - Điện tử | 132 | 61 | 44 | 4 | – | 73 | DH_CQ_DD_NG_VIM_2023 |
| EM-2023-CKT | Cơ Kỹ thuật | Khoa Học Ứng Dụng | 132 | 70 | 42 | 3 | – | 64 | DH_CQ_UD_CKT_2023 |
| EP-2023-VLKT | Vật lý Kỹ thuật | Khoa Học Ứng Dụng | 132 | 84 | 37 | 7 | 1 | 33 | DH_CQ_UD_VLY_2023 |
| CE-2023-KTMT | Kỹ thuật Máy tính | Khoa học và Kỹ thuật Máy tính | 128 | 66 | 41 | 4 | 2 | 47 | DH_CQ_MT_KTM_2023 |
| CS-2023-KHMT | Khoa học Máy tính | Khoa học và Kỹ thuật Máy tính | 128 | 96 | 37 | 5 | 5 | 37 | DH_CQ_MT_KHM_2023 |
| GE-2023-KTDC | Kỹ thuật Địa chất | Kỹ thuật Địa chất và Dầu khí | 129 | 69 | 29 | 3 | 3 | 30 | DH_CQ_DC_DC1_2023 |
| PE-2023-KTDK | Kỹ thuật Dầu khí | Kỹ thuật Địa chất và Dầu khí | 132 | 52 | 41 | 3 | – | 55 | DH_CQ_DC_DK1_2023 |
| AE-2023-KTHK | Kỹ thuật Hàng không | Kỹ Thuật Giao Thông | 130 | 66 | 44 | 3 | – | 62 | DH_CQ_GT_HKG_2023 |
| AUT-2023-KTOT | Kỹ thuật Ô tô | Kỹ Thuật Giao Thông | 131 | 53 | 43 | 2 | – | 58 | DH_CQ_GT_KTO_2023 |
| DM-2023-THK | Song ngành Kỹ thuật Tàu thủy - Hàng không | Kỹ Thuật Giao Thông | 160 | 79 | 45 | 4 | – | 61 | DH_CQ_GT_THK_2023 |
| NAE-2023-KTTT | Kỹ thuật Tàu thủy | Kỹ Thuật Giao Thông | 129 | 51 | 40 | 3 | – | 25 | DH_CQ_GT_TAU_2023 |
| BT-2023-CNSH | Công nghệ Sinh học | Kỹ Thuật Hóa Học | 132 | 54 | 38 | 4 | – | 39 | DH_CQ_HC_CSH_2023 |
| CHE-2023-KTHH | Kỹ thuật Hóa học | Kỹ Thuật Hóa Học | 132 | 76 | 38 | 4 | – | 63 | DH_CQ_HC_HC1_2023 |
| FT-2023-CNTP | Công nghệ Thực phẩm | Kỹ Thuật Hóa Học | 132 | 59 | 41 | 4 | – | 41 | DH_CQ_HC_HTP_2023 |
| AR-2023-KT | Kiến trúc | Kỹ Thuật Xây Dựng | 132 | 54 | 38 | 3 | 1 | 27 | DH_CQ_XD_KTR_2023 |
| CM-2023-CNVLXD | Công nghệ Kỹ thuật Vật liệu Xây dựng | Kỹ Thuật Xây Dựng | 131 | 49 | 45 | 2 | – | 34 | DH_CQ_XD_CVX_2023 |
| COE-2023-XDCTB | Kỹ thuật Xây dựng Công trình Biển | Kỹ Thuật Xây Dựng | 131 | 49 | 45 | 2 | – | 30 | DH_CQ_XD_KXB_2023 |
| CVE-2023-KTXD | Kỹ thuật Xây dựng | Kỹ Thuật Xây Dựng | 131 | 52 | 44 | 3 | – | 36 | DH_CQ_XD_KTX_2023 |
| GEO-2023-TDBD | Kỹ thuật Trắc địa - Bản đồ | Kỹ Thuật Xây Dựng | 131 | 48 | 44 | 2 | – | 25 | DH_CQ_XD_TDI_2023 |
| HWE-2023-XDCTT | Kỹ thuật Xây dựng Công trình Thủy | Kỹ Thuật Xây Dựng | 131 | 49 | 45 | 2 | – | 30 | DH_CQ_XD_KXT_2023 |
| IE-2023-KTCSHT | Kỹ thuật Cơ sở Hạ tầng | Kỹ Thuật Xây Dựng | 131 | 49 | 45 | 2 | – | 30 | DH_CQ_XD_COS_2023 |
| TRE-2023-XDCTGT | Kỹ thuật Xây dựng Công trình Giao thông | Kỹ Thuật Xây Dựng | 131 | 49 | 45 | 2 | – | 28 | DH_CQ_XD_XGT_2023 |
| ENV-2023-KTMTR | Kỹ thuật Môi trường | Môi trường và Tài nguyên | 132 | 63 | 33 | 4 | – | 29 | DH_CQ_MO_KMT_2023 |
| NR-2023-QLTNMT | Quản lý Tài nguyên và Môi trường | Môi trường và Tài nguyên | 130 | 72 | 36 | 4 | – | 28 | DH_CQ_MO_QM1_2023 |
| IM-2023-QLCN | Quản lý Công nghiệp | Quản Lý Công Nghiệp | 130 | 77 | 39 | 4 | 2 | 44 | DH_CQ_QL_QCN_2023 |
| ISE-2023-HTCN | Kỹ thuật Hệ thống Công nghiệp | Quản Lý Công Nghiệp | 132 | 48 | 43 | 1 | – | 30 | DH_CQ_CK_KTH_2023 |
| IMT-2023-BDCN | Bảo dưỡng Công nghiệp | Trung tâm Đào tạo Bảo dưỡng Công nghiệp | 132 | 49 | 33 | 2 | – | 14 | DH_CQ_BD_BDG_2023 |

### Khóa 2024 (40)

| Mã | Ngành | Khoa | TC | Môn | Xếp kỳ | Khối | CN | QH | Nguồn myBK |
|---|---|---|---|---|---|---|---|---|---|
| HE-2024-KTN | Kỹ thuật Nhiệt | Cơ khí | 132 | 62 | 42 | 3 | 2 (bắt buộc) | 50 | DH_CQ_CK_NG_7520115_2024 |
| IMT-2024-BDCN | Bảo dưỡng Công nghiệp | Cơ khí | 132 | 54 | 47 | 2 | – | 14 | DH_CQ_CK_NG_7510211_2024 |
| MCE-2024-CDT | Kỹ thuật Cơ điện tử | Cơ khí | 132 | 66 | 41 | 3 | 2 (bắt buộc) | 42 | DH_CQ_CK_NG_7520114_2024 |
| ME-2024-KTCK | Kỹ thuật Cơ khí | Cơ khí | 132 | 54 | 46 | 2 | – | 23 | DH_CQ_CK_NG_7520103_2024 |
| TC-2024-CNDM | Công nghệ Dệt, May | Cơ khí | 131 | 53 | 46 | 2 | – | 18 | DH_CQ_CK_NG_7540204_2024 |
| TE-2024-KTD | Kỹ thuật Dệt | Cơ khí | 131 | 52 | 45 | 2 | – | 19 | DH_CQ_CK_NG_7520312_2024 |
| MSE-2024-KTVL | Kỹ thuật Vật liệu | Công Nghệ Vật Liệu | 132 | 119 | 36 | 3 | 5 (bắt buộc) | 60 | DH_CQ_VL_NG_7520309_2024 |
| CA-2024-DKTDH | Kỹ thuật Điều khiển và Tự động hóa | Điện - Điện tử | 132 | 62 | 43 | 4 | – | 75 | DH_CQ_DD_NG_7520216_2024 |
| EE-2024-KTDIEN | Kỹ thuật điện | Điện - Điện tử | 132 | 70 | 43 | 4 | – | 102 | DH_CQ_DD_NG_7520201_2024 |
| ET-2024-DTVT | Kỹ thuật Điện tử - Viễn thông | Điện - Điện tử | 132 | 67 | 43 | 4 | – | 94 | DH_CQ_DD_NG_7520207_2024 |
| ICD-2024-TKVM | Thiết kế vi mạch (thí điểm) | Điện - Điện tử | 132 | 61 | 43 | 4 | – | 73 | DH_CQ_DD_NG_7520202_2024 |
| DS-2024-KHDL | Khoa học dữ liệu | Khoa Học Ứng Dụng | 130 | 61 | 42 | 4 | – | 27 | DH_CQ_UD_NG_7460108_2024 |
| EM-2024-CKT | Cơ Kỹ thuật | Khoa Học Ứng Dụng | 132 | 65 | 45 | 3 | – | 59 | DH_CQ_UD_NG_7520101_2024 |
| EP-2024-VLKT | Vật lý Kỹ thuật | Khoa Học Ứng Dụng | 132 | 65 | 37 | 4 | 3 (bắt buộc) | 33 | DH_CQ_UD_NG_7520401_2024 |
| CE-2024-KTMT | Kỹ thuật Máy tính | Khoa học và Kỹ thuật Máy tính | 128 | 65 | 39 | 4 | 3 | 45 | DH_CQ_MT_NG_7480106_2024 |
| CS-2024-KHMT | Khoa học Máy tính | Khoa học và Kỹ thuật Máy tính | 128 | 90 | 37 | 5 | 4 | 36 | DH_CQ_MT_NG_7480101_2024 |
| GE-2024-KTDC | Kỹ thuật Địa chất | Kỹ thuật Địa chất và Dầu khí | 132 | 64 | 43 | 3 | – | 29 | DH_CQ_DC_NG_7520501_2024 |
| GTE-2024-DKTXD | Địa kỹ thuật xây dựng | Kỹ thuật Địa chất và Dầu khí | 132 | 55 | 47 | 3 | – | 24 | DH_CQ_DC_NG_7580211_2024 |
| PE-2024-KTDK | Kỹ thuật Dầu khí | Kỹ thuật Địa chất và Dầu khí | 132 | 54 | 45 | 2 | – | 55 | DH_CQ_DC_NG_7520604_2024 |
| AE-2024-KTHK | Kỹ thuật Hàng không | Kỹ Thuật Giao Thông | 130 | 69 | 44 | 3 | – | 62 | DH_CQ_GT_NG_7520120_2024 |
| AUT-2024-KTOT | Kỹ thuật Ô tô | Kỹ Thuật Giao Thông | 132 | 54 | 45 | 2 | – | 60 | DH_CQ_GT_NG_7520130_2024 |
| DM-2024-THK | Song ngành Kỹ thuật Tàu thủy - Hàng không | Kỹ Thuật Giao Thông | 161 | 88 | 51 | 5 | – | 62 | DH_CQ_GT_NG_THK_2024 |
| NAE-2024-KTTT | Kỹ thuật Tàu thủy | Kỹ Thuật Giao Thông | 129 | 59 | 43 | 3 | – | 25 | DH_CQ_GT_NG_7520122_2024 |
| BT-2024-CNSH | Công nghệ Sinh học | Kỹ Thuật Hóa Học | 132 | 59 | 45 | 3 | – | 52 | DH_CQ_HC_NG_7420201_2024 |
| CHE-2024-KTHH | Kỹ thuật Hóa học | Kỹ Thuật Hóa Học | 132 | 88 | 43 | 3 | 3 (bắt buộc) | 88 | DH_CQ_HC_NG_7520301_2024 |
| FT-2024-CNTP | Công nghệ Thực phẩm | Kỹ Thuật Hóa Học | 132 | 58 | 46 | 4 | – | 40 | DH_CQ_HC_NG_7540101_2024 |
| AR-2024-KT | Kiến trúc | Kỹ Thuật Xây Dựng | 132 | 56 | 40 | 3 | 2 (bắt buộc) | 30 | DH_CQ_XD_NG_7580101_2024 |
| CEM-2024-KTEXD | Kinh tế xây dựng | Kỹ Thuật Xây Dựng | 129 | 55 | 43 | 3 | – | 19 | DH_CQ_XD_NG_7580301_2024 |
| CM-2024-CNVLXD | Công nghệ Kỹ thuật Vật liệu Xây dựng | Kỹ Thuật Xây Dựng | 131 | 51 | 44 | 3 | – | 34 | DH_CQ_XD_NG_7510105_2024 |
| COE-2024-XDCTB | Kỹ thuật Xây dựng Công trình Biển | Kỹ Thuật Xây Dựng | 131 | 51 | 45 | 2 | – | 30 | DH_CQ_XD_NG_7580203_2024 |
| CVE-2024-KTXD | Kỹ thuật Xây dựng | Kỹ Thuật Xây Dựng | 131 | 54 | 44 | 3 | – | 36 | DH_CQ_XD_NG_7580201_2024 |
| GEO-2024-TDBD | Kỹ thuật Trắc địa - Bản đồ | Kỹ Thuật Xây Dựng | 131 | 50 | 44 | 2 | – | 25 | DH_CQ_XD_NG_7520503_2024 |
| HWE-2024-XDCTT | Kỹ thuật Xây dựng Công trình Thủy | Kỹ Thuật Xây Dựng | 131 | 51 | 45 | 2 | – | 30 | DH_CQ_XD_NG_7580202_2024 |
| IE-2024-KTCSHT | Kỹ thuật Cơ sở Hạ tầng | Kỹ Thuật Xây Dựng | 131 | 51 | 45 | 2 | – | 30 | DH_CQ_XD_NG_7580210_2024 |
| TRE-2024-XDCTGT | Kỹ thuật Xây dựng Công trình Giao thông | Kỹ Thuật Xây Dựng | 131 | 51 | 45 | 2 | – | 28 | DH_CQ_XD_NG_7580205_2024 |
| ENV-2024-KTMTR | Kỹ thuật Môi trường | Môi trường và Tài nguyên | 132 | 69 | 40 | 4 | – | 41 | DH_CQ_MO_NG_7520320_2024 |
| NR-2024-QLTNMT | Quản lý Tài nguyên và Môi trường | Môi trường và Tài nguyên | 132 | 62 | 42 | 4 | – | 36 | DH_CQ_MO_NG_7850101_2024 |
| IM-2024-QLCN | Quản lý Công nghiệp | Quản Lý Công Nghiệp | 130 | 77 | 40 | 3 | 3 (bắt buộc) | 42 | DH_CQ_QL_NG_7510601_2024 |
| ISE-2024-HTCN | Kỹ thuật Hệ thống Công nghiệp | Quản Lý Công Nghiệp | 132 | 48 | 46 | 1 | – | 29 | DH_CQ_QL_NG_7520118_2024 |
| LSC-2024-LQLCCU | Logistics và Quản lý Chuỗi cung ứng | Quản Lý Công Nghiệp | 132 | 48 | 46 | 1 | – | 26 | DH_CQ_QL_NG_7510605_2024 |

### Khóa 2025 (2)

| Mã | Ngành | Khoa | TC | Môn | Xếp kỳ | Khối | CN | QH | Nguồn myBK |
|---|---|---|---|---|---|---|---|---|---|
| NRE-2025-KTTNTN | Kinh tế tài nguyên thiên nhiên | Môi trường và Tài nguyên | 132 | 71 | 42 | 4 | 2 (bắt buộc) | 14 | DH_CQ_MO_NG_7850102_2025 |
| BA-2025-QTKD | Quản trị kinh doanh | Quản Lý Công Nghiệp | 130 | 66 | 38 | 6 | 2 (bắt buộc) | 31 | DH_CQ_QL_NG_7340101_2025 |

### Khóa 2026 (44)

| Mã | Ngành | Khoa | TC | Môn | Xếp kỳ | Khối | CN | QH | Nguồn myBK |
|---|---|---|---|---|---|---|---|---|---|
| HE-2026-KTN | Kỹ thuật Nhiệt | Cơ khí | 132 | 75 | 47 | 5 | – | 35 | DH_CQ_CK_NG_7520115_2026 |
| IMT-2026-BDCN | Bảo dưỡng Công nghiệp | Cơ khí | 132 | 63 | 44 | 4 | – | 13 | DH_CQ_CK_NG_7510211_2026 |
| MCE-2026-CDT | Kỹ thuật Cơ điện tử | Cơ khí | 132 | 80 | 43 | 4 | 2 (bắt buộc) | 36 | DH_CQ_CK_NG_7520114_2026 |
| ME-2026-KTCK | Kỹ thuật Cơ khí | Cơ khí | 132 | 71 | 48 | 4 | – | 18 | DH_CQ_CK_NG_7520103_2026 |
| TC-2026-CNDM | Công nghệ Dệt, May | Cơ khí | 132 | 63 | 46 | 3 | – | 15 | DH_CQ_CK_NG_7540204_2026 |
| TE-2026-KTD | Kỹ thuật Dệt | Cơ khí | 132 | 63 | 46 | 3 | – | 15 | DH_CQ_CK_NG_7520312_2026 |
| MSE-2026-KTVL | Kỹ thuật Vật liệu | Công Nghệ Vật Liệu | 132 | 99 | 38 | 4 | 5 (bắt buộc) | 53 | DH_CQ_VL_NG_7520309_2026 |
| SCE-2026-KTBD | Kỹ thuật bán dẫn | Công Nghệ Vật Liệu | 132 | 74 | 44 | 4 | – | 19 | DH_CQ_VL_NG_7520315_2026 |
| CA-2026-DKTDH | Kỹ thuật Điều khiển và Tự động hóa | Điện - Điện tử | 132 | 69 | 43 | 5 | – | 64 | DH_CQ_DD_NG_7520216_2026 |
| EE-2026-KTDIEN | Kỹ thuật điện | Điện - Điện tử | 132 | 77 | 44 | 4 | – | 89 | DH_CQ_DD_NG_7520201_2026 |
| ET-2026-DTVT | Kỹ thuật Điện tử - Viễn thông | Điện - Điện tử | 132 | 74 | 43 | 5 | – | 80 | DH_CQ_DD_NG_7520207_2026 |
| ICD-2026-TKVM | Thiết kế vi mạch (thí điểm) | Điện - Điện tử | 132 | 68 | 44 | 4 | – | 63 | DH_CQ_DD_NG_7520202_2026 |
| DS-2026-KHDL | Khoa học dữ liệu | Khoa Học Ứng Dụng | 131 | 68 | 42 | 5 | – | 24 | DH_CQ_UD_NG_7460108_2026 |
| EM-2026-CKT | Cơ Kỹ thuật | Khoa Học Ứng Dụng | 130 | 66 | 44 | 4 | – | 43 | DH_CQ_UD_NG_7520101_2026 |
| EP-2026-VLKT | Vật lý Kỹ thuật | Khoa Học Ứng Dụng | 132 | 75 | 38 | 4 | 3 (bắt buộc) | 27 | DH_CQ_UD_NG_7520401_2026 |
| NE-2026-KTHN | Kỹ thuật hạt nhân | Khoa Học Ứng Dụng | 131 | 66 | 43 | 4 | – | 17 | DH_CQ_UD_NG_7520402_2026 |
| CE-2026-KTMT | Kỹ thuật Máy tính | Khoa học và Kỹ thuật Máy tính | 129 | 73 | 39 | 4 | 3 | 36 | DH_CQ_MT_NG_7480106_2026 |
| CS-2026-KHMT | Khoa học Máy tính | Khoa học và Kỹ thuật Máy tính | 128 | 98 | 37 | 5 | 4 | 33 | DH_CQ_MT_NG_7480101_2026 |
| GE-2026-KTDC | Kỹ thuật Địa chất | Kỹ thuật Địa chất và Dầu khí | 132 | 68 | 46 | 5 | – | 25 | DH_CQ_DC_NG_7520501_2026 |
| GTE-2026-DKTXD | Địa kỹ thuật xây dựng | Kỹ thuật Địa chất và Dầu khí | 131 | 62 | 45 | 5 | – | 20 | DH_CQ_DC_NG_7580211_2026 |
| PE-2026-KTDK | Kỹ thuật Dầu khí | Kỹ thuật Địa chất và Dầu khí | 132 | 60 | 45 | 4 | – | 33 | DH_CQ_DC_NG_7520604_2026 |
| AE-2026-KTHK | Kỹ thuật Hàng không | Kỹ Thuật Giao Thông | 130 | 74 | 44 | 5 | – | 56 | DH_CQ_GT_NG_7520120_2026 |
| AUT-2026-KTOT | Kỹ thuật Ô tô | Kỹ Thuật Giao Thông | 132 | 94 | 41 | 7 | – | 59 | DH_CQ_GT_NG_7520130_2026 |
| NAE-2026-KTTT | Kỹ thuật Tàu thủy | Kỹ Thuật Giao Thông | 130 | 62 | 42 | 4 | – | 25 | DH_CQ_GT_NG_7520122_2026 |
| RE-2026-KTDS | Kỹ thuật đường sắt (thí điểm) | Kỹ Thuật Giao Thông | 132 | 89 | 43 | 6 | – | 19 | DH_CQ_GT_NG_7520135_2026 |
| BT-2026-CNSH | Công nghệ Sinh học | Kỹ Thuật Hóa Học | 132 | 65 | 46 | 4 | – | 34 | DH_CQ_HC_NG_7420201_2026 |
| CHE-2026-KTHH | Kỹ thuật Hóa học | Kỹ Thuật Hóa Học | 132 | 96 | 44 | 4 | 3 (bắt buộc) | 74 | DH_CQ_HC_NG_7520301_2026 |
| FT-2026-CNTP | Công nghệ Thực phẩm | Kỹ Thuật Hóa Học | 132 | 66 | 47 | 5 | – | 29 | DH_CQ_HC_NG_7540101_2026 |
| AR-2026-KT | Kiến trúc | Kỹ Thuật Xây Dựng | 132 | 68 | 39 | 6 | 2 (bắt buộc) | 29 | DH_CQ_XD_NG_7580101_2026 |
| CEM-2026-KTEXD | Kinh tế xây dựng | Kỹ Thuật Xây Dựng | 130 | 63 | 44 | 4 | – | 18 | DH_CQ_XD_NG_7580301_2026 |
| CM-2026-CNVLXD | Công nghệ Kỹ thuật Vật liệu Xây dựng | Kỹ Thuật Xây Dựng | 132 | 60 | 46 | 3 | – | 30 | DH_CQ_XD_NG_7510105_2026 |
| COE-2026-XDCTB | Kỹ thuật Xây dựng Công trình Biển | Kỹ Thuật Xây Dựng | 132 | 63 | 45 | 4 | – | 30 | DH_CQ_XD_NG_7580203_2026 |
| CVE-2026-KTXD | Kỹ thuật Xây dựng | Kỹ Thuật Xây Dựng | 132 | 65 | 45 | 4 | – | 37 | DH_CQ_XD_NG_7580201_2026 |
| GEO-2026-TDBD | Kỹ thuật Trắc địa - Bản đồ | Kỹ Thuật Xây Dựng | 132 | 59 | 45 | 3 | – | 24 | DH_CQ_XD_NG_7520503_2026 |
| HWE-2026-XDCTT | Kỹ thuật Xây dựng Công trình Thủy | Kỹ Thuật Xây Dựng | 132 | 60 | 46 | 3 | – | 29 | DH_CQ_XD_NG_7580202_2026 |
| IE-2026-KTCSHT | Kỹ thuật Cơ sở Hạ tầng | Kỹ Thuật Xây Dựng | 132 | 62 | 45 | 4 | – | 30 | DH_CQ_XD_NG_7580210_2026 |
| TRE-2026-XDCTGT | Kỹ thuật Xây dựng Công trình Giao thông | Kỹ Thuật Xây Dựng | 132 | 69 | 40 | 5 | 2 (bắt buộc) | 26 | DH_CQ_XD_NG_7580205_2026 |
| ENV-2026-KTMTR | Kỹ thuật Môi trường | Môi trường và Tài nguyên | 132 | 77 | 40 | 5 | – | 31 | DH_CQ_MO_NG_7520320_2026 |
| NR-2026-QLTNMT | Quản lý Tài nguyên và Môi trường | Môi trường và Tài nguyên | 132 | 88 | 38 | 5 | 2 (bắt buộc) | 34 | DH_CQ_MO_NG_7850101_2026 |
| NRE-2026-KTTNTN | Kinh tế tài nguyên thiên nhiên | Môi trường và Tài nguyên | 132 | 80 | 42 | 5 | 2 (bắt buộc) | 13 | DH_CQ_MO_NG_7850102_2026 |
| BA-2026-QTKD | Quản trị kinh doanh | Quản Lý Công Nghiệp | 131 | 85 | 41 | 6 | 2 (bắt buộc) | 29 | DH_CQ_QL_NG_7340101_2026 |
| IM-2026-QLCN | Quản lý Công nghiệp | Quản Lý Công Nghiệp | 131 | 92 | 41 | 5 | 1 | 39 | DH_CQ_QL_NG_7510601_2026 |
| ISE-2026-HTCN | Kỹ thuật Hệ thống Công nghiệp | Quản Lý Công Nghiệp | 130 | 55 | 45 | 2 | – | 24 | DH_CQ_QL_NG_7520118_2026 |
| LSC-2026-LQLCCU | Logistics và Quản lý Chuỗi cung ứng | Quản Lý Công Nghiệp | 132 | 61 | 42 | 4 | 2 (bắt buộc) | 20 | DH_CQ_QL_NG_7510605_2026 |

### Chuyên ngành

| CTĐT | Chuyên ngành |
|---|---|
| MCE-2023-CDT | Kỹ thuật Robot |
| EP-2023-VLKT | Kỹ thuật Y sinh |
| CE-2023-KTMT | Hệ thống tính toán hiện đại, Internet vạn vật và An ninh mạng |
| CS-2023-KHMT | Công nghệ Dữ liệu Bảo mật và Trí tuệ Kinh doanh, Công nghệ Phần mềm, Mật mã và An ninh mạng, Trí tuệ nhân tạo ứng dụng, Xử lý ảnh và Thị giác máy tính |
| GE-2023-KTDC | Địa chất môi trường, Địa kỹ thuật, Quản lý Tài nguyên Đất và Khoáng sản |
| AR-2023-KT | Kiến trúc cảnh quan |
| IM-2023-QLCN | Quản lý Chuỗi cung ứng và vận hành, Quản trị Kinh doanh |
| HE-2024-KTN | Kỹ thuật Nhiệt - 2024, Kỹ thuật Nhiệt lạnh - 2024 |
| MCE-2024-CDT | Kỹ thuật Cơ điện tử, Kỹ thuật Robot |
| MSE-2024-KTVL | Kỹ thuật Vật liệu, Kỹ thuật Vật liệu Kim loại, Kỹ thuật Vật liệu Năng lượng, Kỹ thuật Vật liệu Polyme, Kỹ thuật Vật liệu Silicat |
| EP-2024-VLKT | Kỹ thuật Y sinh, Vật lý kỹ thuật, Vật lý tính toán |
| CE-2024-KTMT | Hệ thống tính toán nâng cao, Internet vạn vật, Thiết kế vi mạch số |
| CS-2024-KHMT | An ninh mạng và Hệ thống, Công nghệ Dữ liệu và Dữ liệu lớn, Công nghệ Phần mềm, Trí tuệ nhân tạo |
| CHE-2024-KTHH | Công nghệ Hóa dược, Công nghệ Mỹ phẩm, Kỹ thuật Hóa học |
| AR-2024-KT | Kiến trúc, Kiến trúc cảnh quan |
| IM-2024-QLCN | Quản lý Chuỗi cung ứng và Vận hành - 2024, Quản lý Công nghiệp - 2024, Quản trị kinh doanh |
| NRE-2025-KTTNTN | Kinh tế tài nguyên thiên nhiên, Kinh tế tuần hoàn |
| BA-2025-QTKD | Kinh doanh số, Quản trị kinh doanh - 2025 |
| MCE-2026-CDT | Kỹ thuật Cơ điện tử, Kỹ thuật Robot |
| MSE-2026-KTVL | Kỹ thuật Vật liệu, Kỹ thuật Vật liệu Kim loại, Kỹ thuật Vật liệu Năng lượng, Kỹ thuật Vật liệu Polyme, Kỹ thuật Vật liệu Silicat |
| EP-2026-VLKT | Kỹ thuật Y sinh, Vật lý kỹ thuật, Vật lý tính toán |
| CE-2026-KTMT | Hệ thống tính toán nâng cao, Internet vạn vật, Thiết kế vi mạch số |
| CS-2026-KHMT | An ninh hệ thống và mạng, Công nghệ Dữ liệu và Dữ liệu lớn, Công nghệ Phần mềm, Trí tuệ nhân tạo |
| CHE-2026-KTHH | Công nghệ Hóa dược, Công nghệ Mỹ phẩm, Kỹ thuật Hóa học |
| AR-2026-KT | Kiến trúc, Kiến trúc cảnh quan |
| TRE-2026-XDCTGT | CTDT Ngành Kỹ thuật Xây dựng Công trình Giao thông - Năm 2026 - chuyên ngành Đường sắt tốc độ cao và đường sắt đô thị, CTDT Ngành Kỹ thuật Xây dựng Công trình Giao thông - Năm 2026 - chuyên ngành KTXD Công trình giao thông |
| NR-2026-QLTNMT | Môi trường, An toàn và Sức khỏe, Quản lý Tài nguyên và Môi trường |
| NRE-2026-KTTNTN | Kinh tế tài nguyên thiên nhiên, Kinh tế tuần hoàn |
| BA-2026-QTKD | Kinh doanh số - 2026, Quản trị kinh doanh - 2026 |
| IM-2026-QLCN | Quản lý chuỗi cung ứng và vận hành - 2026 |
| LSC-2026-LQLCCU | Drone Logistics và Chuỗi cung ứng, Logistics và Quản lý Chuỗi Cung ứng |

## 4. Đối chiếu với danh sách AAO (`a.html`)

AAO liệt kê 68 ngành. Ký hiệu trong ô:

- mã CTĐT: có trong database;
- **= CTĐT 2024**: AAO dùng chung nhãn "Từ 2024" cho khóa 2024 và 2025, sinh viên khóa 2025 học theo CTĐT 2024 đã có;
- **✗**: AAO có PDF cho khóa đó nhưng database không có;
- **không lấy**: chương trình Việt–Pháp, tiên tiến, vừa làm vừa học (ngoài phạm vi chính quy tiêu chuẩn);
- **từ K2027**: ngành mở từ khóa 2027, ngoài phạm vi 2023–2026;
- **–**: AAO không có PDF cho khóa đó;
- ⁽¹⁾: database có nhưng AAO không có PDF cho khóa đó.

| Khoa | Ngành (AAO) | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|
| KHOA CƠ KHÍ | Bảo dưỡng Công nghiệp | `IMT-2023-BDCN` | `IMT-2024-BDCN` | = CTĐT 2024 | `IMT-2026-BDCN` |
| KHOA CƠ KHÍ | Kỹ thuật Cơ khí | `ME-2023-KTCK` | `ME-2024-KTCK` | = CTĐT 2024 | `ME-2026-KTCK` |
| KHOA CƠ KHÍ | Công nghệ Dệt, May | `TC-2023-CNDM` | `TC-2024-CNDM` | = CTĐT 2024 | `TC-2026-CNDM` |
| KHOA CƠ KHÍ | Kỹ thuật Cơ điện tử | `MCE-2023-CDT` | `MCE-2024-CDT` | = CTĐT 2024 | `MCE-2026-CDT` |
| KHOA CƠ KHÍ | Kỹ thuật Dệt | `TE-2023-KTD` | `TE-2024-KTD` | = CTĐT 2024 | `TE-2026-KTD` |
| KHOA CƠ KHÍ | Kỹ thuật Nhiệt | ✗ | `HE-2024-KTN` | = CTĐT 2024 | `HE-2026-KTN` |
| KHOA KỸ THUẬT ĐỊA CHẤT VÀ DẦU KHÍ | Kỹ thuật Địa chất | `GE-2023-KTDC` | `GE-2024-KTDC` | = CTĐT 2024 | `GE-2026-KTDC` |
| KHOA KỸ THUẬT ĐỊA CHẤT VÀ DẦU KHÍ | Kỹ thuật Dầu khí | `PE-2023-KTDK` | `PE-2024-KTDK` | = CTĐT 2024 | `PE-2026-KTDK` |
| KHOA KỸ THUẬT ĐỊA CHẤT VÀ DẦU KHÍ | Địa Kỹ thuật Xây dựng | – | `GTE-2024-DKTXD` | = CTĐT 2024 | `GTE-2026-DKTXD` |
| KHOA ĐIỆN - ĐIỆN TỬ | Kỹ thuật Điều khiển và Tự động hóa | `CA-2023-DKTDH` | `CA-2024-DKTDH` | = CTĐT 2024 | `CA-2026-DKTDH` |
| KHOA ĐIỆN - ĐIỆN TỬ | Kỹ thuật Điện tử - Viễn thông | `ET-2023-DTVT` | `ET-2024-DTVT` | = CTĐT 2024 | `ET-2026-DTVT` |
| KHOA ĐIỆN - ĐIỆN TỬ | Kỹ thuật Điện | `EE-2023-KTDIEN` | `EE-2024-KTDIEN` | = CTĐT 2024 | `EE-2026-KTDIEN` |
| KHOA ĐIỆN - ĐIỆN TỬ | Thiết kế vi mạch | `ICD-2023-TKVM` ⁽¹⁾ | `ICD-2024-TKVM` | = CTĐT 2024 | `ICD-2026-TKVM` |
| KHOA ĐIỆN - ĐIỆN TỬ | Song ngành: Kỹ thuật Điện tử - Viễn thông - Kỹ thuật Điện | `DM-2023-2DK` | ✗ | ✗ | – |
| KHOA ĐIỆN - ĐIỆN TỬ | Song ngành: Kỹ thuật Điện tử - Viễn thông - Kỹ thuật Điều khiển và Tự động hóa | `DM-2023-2DT` | ✗ | ✗ | – |
| KHOA ĐIỆN - ĐIỆN TỬ | Song ngành: Kỹ thuật Điện - Kỹ thuật Điện tử - Viễn thông | `DM-2023-2KD` | ✗ | ✗ | – |
| KHOA ĐIỆN - ĐIỆN TỬ | Song ngành: Kỹ thuật Điện - Kỹ thuật Điều khiển và Tự động hóa | `DM-2023-2KT` | ✗ | ✗ | – |
| KHOA ĐIỆN - ĐIỆN TỬ | Song ngành: Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện tử - Viễn thông | `DM-2023-2TD` | ✗ | ✗ | – |
| KHOA ĐIỆN - ĐIỆN TỬ | Song ngành: Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện | `DM-2023-2TK` | ✗ | ✗ | – |
| KHOA KỸ THUẬT GIAO THÔNG | Kỹ thuật Hàng không | `AE-2023-KTHK` | `AE-2024-KTHK` | = CTĐT 2024 | `AE-2026-KTHK` |
| KHOA KỸ THUẬT GIAO THÔNG | Kỹ thuật Ô tô | `AUT-2023-KTOT` | `AUT-2024-KTOT` | = CTĐT 2024 | `AUT-2026-KTOT` |
| KHOA KỸ THUẬT GIAO THÔNG | Kỹ thuật Tàu thủy | `NAE-2023-KTTT` | `NAE-2024-KTTT` | = CTĐT 2024 | `NAE-2026-KTTT` |
| KHOA KỸ THUẬT GIAO THÔNG | Song ngành: Kỹ thuật Tàu thủy - Hàng không | `DM-2023-THK` | `DM-2024-THK` | = CTĐT 2024 | ✗ |
| KHOA KỸ THUẬT GIAO THÔNG | Kỹ thuật Đường sắt | – | – | – | `RE-2026-KTDS` |
| KHOA KỸ THUẬT GIAO THÔNG | Kỹ thuật Phương tiện không người lái | – | – | – | từ K2027 |
| KHOA KỸ THUẬT GIAO THÔNG | Kỹ thuật Giao thông thông minh | – | – | – | từ K2027 |
| KHOA KỸ THUẬT HÓA HỌC | Công nghệ Sinh học | `BT-2023-CNSH` | `BT-2024-CNSH` | = CTĐT 2024 | `BT-2026-CNSH` |
| KHOA KỸ THUẬT HÓA HỌC | Kỹ thuật Hóa học | `CHE-2023-KTHH` | `CHE-2024-KTHH` | = CTĐT 2024 | `CHE-2026-KTHH` |
| KHOA KỸ THUẬT HÓA HỌC | Công nghệ Thực phẩm | `FT-2023-CNTP` | `FT-2024-CNTP` | = CTĐT 2024 | `FT-2026-CNTP` |
| KHOA MÔI TRƯỜNG VÀ TÀI NGUYÊN | Kỹ thuật Môi trường | `ENV-2023-KTMTR` | `ENV-2024-KTMTR` | = CTĐT 2024 | `ENV-2026-KTMTR` |
| KHOA MÔI TRƯỜNG VÀ TÀI NGUYÊN | Quản lý Tài nguyên và Môi trường | `NR-2023-QLTNMT` | `NR-2024-QLTNMT` | = CTĐT 2024 | `NR-2026-QLTNMT` |
| KHOA MÔI TRƯỜNG VÀ TÀI NGUYÊN | Kinh tế tài nguyên thiên nhiên | – | – | `NRE-2025-KTTNTN` | `NRE-2026-KTTNTN` |
| KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH | Khoa học Máy tính | `CS-2023-KHMT` | `CS-2024-KHMT` | = CTĐT 2024 | `CS-2026-KHMT` |
| KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH | Kỹ thuật máy tính | `CE-2023-KTMT` | `CE-2024-KTMT` | = CTĐT 2024 | `CE-2026-KTMT` |
| KHOA KHOA HỌC VÀ KỸ THUẬT MÁY TÍNH | Công nghệ Thông tin (Vừa Làm Vừa Học) | không lấy | – | – | – |
| KHOA QUẢN LÝ CÔNG NGHIỆP | Quản lý công nghiệp | `IM-2023-QLCN` | `IM-2024-QLCN` | = CTĐT 2024 | `IM-2026-QLCN` |
| KHOA QUẢN LÝ CÔNG NGHIỆP | Quản trị Kinh doanh | – | – | `BA-2025-QTKD` | `BA-2026-QTKD` |
| KHOA QUẢN LÝ CÔNG NGHIỆP | Kỹ thuật Hệ thống Công nghiệp | `ISE-2023-HTCN` | `ISE-2024-HTCN` | = CTĐT 2024 | `ISE-2026-HTCN` |
| KHOA QUẢN LÝ CÔNG NGHIỆP | Logistics và Quản lý Chuỗi cung ứng | `LSC-2023-LQLCCU` | `LSC-2024-LQLCCU` | = CTĐT 2024 | `LSC-2026-LQLCCU` |
| KHOA KHOA HỌC ỨNG DỤNG | Cơ Kỹ thuật | `EM-2023-CKT` | `EM-2024-CKT` | = CTĐT 2024 | `EM-2026-CKT` |
| KHOA KHOA HỌC ỨNG DỤNG | Vật lý Kỹ thuật | `EP-2023-VLKT` | `EP-2024-VLKT` | = CTĐT 2024 | `EP-2026-VLKT` |
| KHOA KHOA HỌC ỨNG DỤNG | Khoa học dữ liệu | – | `DS-2024-KHDL` | = CTĐT 2024 | `DS-2026-KHDL` |
| KHOA KHOA HỌC ỨNG DỤNG | Kỹ thuật Hạt nhân | – | – | – | `NE-2026-KTHN` |
| KHOA KHOA HỌC ỨNG DỤNG | Kỹ thuật Lượng tử | – | – | – | từ K2027 |
| KHOA CÔNG NGHỆ VẬT LIỆU | Kỹ thuật Vật liệu | `MSE-2023-KTVL` | `MSE-2024-KTVL` | = CTĐT 2024 | `MSE-2026-KTVL` |
| KHOA CÔNG NGHỆ VẬT LIỆU | Kỹ thuật Bán dẫn | – | – | – | `SCE-2026-KTBD` |
| KHOA CÔNG NGHỆ VẬT LIỆU | Kỹ thuật Chế biến khoáng sản | – | – | – | từ K2027 |
| KHOA KỸ THUẬT XÂY DỰNG | Kỹ thuật Công trình biển | `COE-2023-XDCTB` | `COE-2024-XDCTB` | = CTĐT 2024 | `COE-2026-XDCTB` |
| KHOA KỸ THUẬT XÂY DỰNG | Kỹ thuật Cơ sở hạ tầng | `IE-2023-KTCSHT` | `IE-2024-KTCSHT` | = CTĐT 2024 | `IE-2026-KTCSHT` |
| KHOA KỸ THUẬT XÂY DỰNG | Công nghệ Kỹ thuật Vật liệu Xây dựng | `CM-2023-CNVLXD` | `CM-2024-CNVLXD` | = CTĐT 2024 | `CM-2026-CNVLXD` |
| KHOA KỸ THUẬT XÂY DỰNG | Kỹ thuật Xây dựng | `CVE-2023-KTXD` | `CVE-2024-KTXD` | = CTĐT 2024 | `CVE-2026-KTXD` |
| KHOA KỸ THUẬT XÂY DỰNG | Kiến trúc | `AR-2023-KT` | `AR-2024-KT` | = CTĐT 2024 | `AR-2026-KT` |
| KHOA KỸ THUẬT XÂY DỰNG | Kỹ thuật Trắc địa - Bản đồ | `GEO-2023-TDBD` | `GEO-2024-TDBD` | = CTĐT 2024 | `GEO-2026-TDBD` |
| KHOA KỸ THUẬT XÂY DỰNG | Kỹ thuật Xây dựng Công trình Thủy | `HWE-2023-XDCTT` | `HWE-2024-XDCTT` | = CTĐT 2024 | `HWE-2026-XDCTT` |
| KHOA KỸ THUẬT XÂY DỰNG | Kỹ thuật Xây dựng Công trình Giao thông | `TRE-2023-XDCTGT` | `TRE-2024-XDCTGT` | = CTĐT 2024 | `TRE-2026-XDCTGT` |
| KHOA KỸ THUẬT XÂY DỰNG | Kinh tế Xây dựng | – | `CEM-2024-KTEXD` | = CTĐT 2024 | `CEM-2026-KTEXD` |
| VIỆT PHÁP | Kỹ thuật Cơ điện tử | không lấy | không lấy | không lấy | không lấy |
| VIỆT PHÁP | Hàng không | không lấy | không lấy | không lấy | không lấy |
| VIỆT PHÁP | Vật liệu Polymer và Composite | không lấy | không lấy | không lấy | không lấy |
| VIỆT PHÁP | Vật liệu và Năng lượng | không lấy | không lấy | không lấy | không lấy |
| VIỆT PHÁP | Viễn thông | không lấy | không lấy | không lấy | không lấy |
| VIỆT PHÁP | Hệ thống năng lượng điện | không lấy | không lấy | không lấy | không lấy |
| VIỆT PHÁP | Kỹ thuật và quản lý nước đô thị | không lấy | không lấy | không lấy | không lấy |
| VIỆT PHÁP | Xây dựng dân dụng - Công nghiệp và Hiệu quả | không lấy | không lấy | không lấy | không lấy |
| CHƯƠNG TRÌNH TIÊN TIẾN | Vi mạch - Hệ thống phần cứng | không lấy | không lấy | không lấy | không lấy |
| CHƯƠNG TRÌNH TIÊN TIẾN | Hệ thống Năng lượng | không lấy | không lấy | không lấy | không lấy |
| CHƯƠNG TRÌNH TIÊN TIẾN | Kỹ thuật Điều khiển và Tự động hoá | không lấy | không lấy | không lấy | không lấy |
| CHƯƠNG TRÌNH TIÊN TIẾN | Hệ thống Viễn thông | không lấy | không lấy | không lấy | không lấy |

Tổng: 14 ô "✗", 40 ô "= CTĐT 2024", 49 ô "không lấy".

### CTĐT trong database không khớp tên ngành nào trên AAO (4)

Thường do tên ngành trên myBK khác AAO, hoặc là biến thể myBK tách riêng (ví dụ các hướng của Kỹ thuật Vật liệu khóa 2023).

| Mã | Ngành | Nguồn myBK |
|---|---|---|
| MSE-2023-KTVL-VKH | Kỹ thuật Vật liệu Kim loại | DH_CQ_VL_VKH_2023 |
| MSE-2023-KTVL-VKN | Kỹ thuật Vật liệu Năng lượng | DH_CQ_VL_VKN_2023 |
| MSE-2023-KTVL-VPO | Kỹ thuật Vật liệu Polyme | DH_CQ_VL_VPO_2023 |
| MSE-2023-KTVL-VSI | Kỹ thuật Vật liệu Silicat | DH_CQ_VL_VSI_2023 |

### Vì sao còn ô "✗"

- **Kỹ thuật Nhiệt** (2023); **Song ngành: Kỹ thuật Điện tử - Viễn thông - Kỹ thuật Điện** (2024, 2025); **Song ngành: Kỹ thuật Điện tử - Viễn thông - Kỹ thuật Điều khiển và Tự động hóa** (2024, 2025); **Song ngành: Kỹ thuật Điện - Kỹ thuật Điện tử - Viễn thông** (2024, 2025); **Song ngành: Kỹ thuật Điện - Kỹ thuật Điều khiển và Tự động hóa** (2024, 2025); **Song ngành: Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện tử - Viễn thông** (2024, 2025); **Song ngành: Kỹ thuật Điều khiển và Tự động hóa - Kỹ thuật Điện** (2024, 2025); **Song ngành: Kỹ thuật Tàu thủy - Hàng không** (2026).
- **Kỹ thuật Nhiệt khóa 2023**: myBK không có CTĐT ngành, chỉ có bản ghi chuyên ngành Nhiệt lạnh.
- **Song ngành khoa Điện - Điện tử khóa 2024/2025**: myBK không có CTĐT song ngành nào của khoa Điện cho các khóa này.
- **Song ngành Tàu thủy - Hàng không khóa 2026**: có trên myBK (`DH_SN_GT_NG_752012SN_2026`) nhưng myBK xếp vào chương trình "SN" (song ngành), không phải "CQ" mà script đang lọc, nên chưa lấy. Muốn lấy thì thêm chương trình `SN` vào bộ lọc của `build-from-mybk.cjs`.
- **Khóa 2025** của các ngành khác: AAO và myBK đều dùng CTĐT "Từ 2024" (myBK chỉ có thêm chương trình chuyên sâu kỹ sư 30 TC cho khóa 2025, không lấy).
