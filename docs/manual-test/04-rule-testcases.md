# Bộ seed testcase rule

## Mục đích

`npm run seed` tạo 3 chương trình synthetic với tổng cộng 16 học phần và 6 profile sinh viên. Dữ liệu chỉ dùng để test local, không phải chương trình đào tạo đã xác minh. Seed chạy lặp được: ID ổn định, trạng thái học phần được cập nhật theo fixture.

## Chuẩn bị

Database local hiện đã được seed. Để đăng nhập ngay:

- Mật khẩu của cả 6 profile: `RuleTest2026!`
- Admin sở hữu các chương trình: `rule-test-owner@demo.test` / `RuleTestOwner2026!`

Muốn chạy seed lại, cấu hình các giá trị sau trong `backend/.env` rồi chạy migration và seed. Có thể thay mật khẩu bằng giá trị riêng cho máy local.

```dotenv
ADMIN_SEED_EMAIL=rule-test-owner@demo.test
ADMIN_SEED_PASSWORD=RuleTestOwner2026!
DEMO_SEED_PASSWORD=RuleTest2026!
```

```powershell
Push-Location BK_uni/backend
npm run migration:run
npm run seed
Pop-Location
```

Đăng nhập profile qua ứng dụng, sau đó gọi `POST /api/v1/me/profile/analyses`; request dùng cookie phiên như các thao tác học viên khác.

## Chương trình và profile

| Chương trình | Số học phần | Profile | Trạng thái đã đạt trước |
| --- | ---: | --- | --- |
| Rule Test - Prerequisite | 5 | `prerequisite-pass@demo.test` | `PR101=completed` |
| Rule Test - Prerequisite | 5 | `prerequisite-fail@demo.test` | Chưa đạt môn nào |
| Rule Test - Minimum Credits | 5 | `credits-fail@demo.test` | `CR101=completed`, tổng 3 tín chỉ |
| Rule Test - Minimum Credits | 5 | `credits-pass@demo.test` | `CR101=completed`, `CR102=in_progress`, tổng 6 tín chỉ |
| Rule Test - AND and Electives | 6 | `combined-rule-fail@demo.test` | `AN101=completed`, tổng 3 tín chỉ |
| Rule Test - AND and Electives | 6 | `combined-rule-pass@demo.test` | `AN101=completed`, `AN102=completed`, `AN202=in_progress`, `AN-E01=completed` |

Trạng thái không liệt kê được seed là `not_started`. Cả ba chương trình có học kỳ và độ ưu tiên gợi ý; chương trình cuối có nhóm tự chọn yêu cầu cả 3 tín chỉ và 1 học phần.

## Testcase rule và output

`eligible` cho biết có đủ điều kiện học học phần hay không. Nhiều rule trên cùng học phần được kết hợp bằng AND. Mỗi reason trong response có `ruleId`, `type`, `passed`, `message`.

| ID | Profile | Điều kiện A | Rule B được kích hoạt | Output mong đợi |
| --- | --- | --- | --- | --- |
| R1 | `prerequisite-pass@demo.test` | `PR101` đã hoàn thành | `PR102` có tiên quyết `PR101` | `PR102.eligible=true`; reason `prerequisite.passed=true`, message `Đã đáp ứng môn tiên quyết PR101.` |
| R2 | `prerequisite-fail@demo.test` | `PR101=not_started` | Tiên quyết của `PR102` chưa đạt | `PR102.eligible=false`; reason `prerequisite.passed=false`, message `Chưa đáp ứng môn tiên quyết PR101.` |
| R3 | `credits-fail@demo.test` | Mới tích lũy 3 tín chỉ | `CR201` yêu cầu tối thiểu 6 tín chỉ | `CR201.eligible=false`; reason minimum_credits `passed=false`, message `Cần tối thiểu 6 tín chỉ; hiện có 3.` |
| R4 | `credits-pass@demo.test` | Tích lũy đúng 6 tín chỉ (`completed` + `in_progress`) | Ngưỡng của `CR201` là 6 | `CR201.eligible=true`; reason minimum_credits `passed=true`, message `Đã tích lũy 6 tín chỉ; yêu cầu tối thiểu 6.` |
| R5 | `combined-rule-fail@demo.test` | Đã đạt `AN101` (3 tín chỉ), chưa đạt `AN102` | `AN201` cần `AN102` và tối thiểu 6 tín chỉ | `AN201.eligible=false`; có 2 reasons: prerequisite `passed=false`, minimum_credits `passed=false`. |
| R6 | `combined-rule-pass@demo.test` | Đã đạt `AN101`, `AN102`; tổng tích lũy 12 tín chỉ | `AN201` cần `AN102` và tối thiểu 6 tín chỉ | `AN201.eligible=true`; cả hai reasons `passed=true`. Nhóm tự chọn đạt: `earnedCredits=3`, `earnedCourses=1`, `complete=true`. |

## Đối chiếu summary

| Profile | `eligibleCourses` | `ineligibleCourses` | `missingRequiredCourses` |
| --- | ---: | ---: | ---: |
| `prerequisite-pass@demo.test` | 4 | 1 | 4 |
| `prerequisite-fail@demo.test` | 3 | 2 | 5 |
| `credits-fail@demo.test` | 4 | 1 | 4 |
| `credits-pass@demo.test` | 5 | 0 | 3 |
| `combined-rule-fail@demo.test` | 5 | 1 | 3 |
| `combined-rule-pass@demo.test` | 6 | 0 | 1 |

`in_progress` được tính vào tín chỉ tích lũy và không tính là môn bắt buộc còn thiếu. `not_started` không được tính vào tín chỉ. Không cần gọi API cập nhật status trước khi chạy testcase; seed đã tạo sẵn trạng thái cho từng profile.