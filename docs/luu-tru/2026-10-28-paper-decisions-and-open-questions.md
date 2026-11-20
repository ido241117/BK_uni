# Paper: Những vấn đề đã xác định và cần tiếp tục xác định

**Ngày cập nhật:** 2026-10-28  
**Trạng thái:** Research decision register  
**Mục tiêu:** Xác định câu hỏi nghiên cứu, baseline, dữ liệu, thí nghiệm và giới hạn kết luận

## 1. Vấn đề nghiên cứu đã xác định

Planning guide cung cấp một trình tự học mẫu do con người xây dựng. Cách này giúp sinh viên có một safe path, nhưng khó thích nghi khi sinh viên rớt môn, đăng ký khác kế hoạch hoặc môn không được mở. Nếu một hệ thống vẫn cần `recommendedSemester` hoặc một path được soạn sẵn làm input chính, giá trị thay thế planning guide bị hạn chế.

Hướng nghiên cứu hiện tại là kiểm tra khả năng sinh và cập nhật degree path từ:

- Curriculum structure.
- Graduation requirements.
- Course relations.
- Per-term capacity.
- Student academic state.
- Current enrollment và offering snapshots khi có.

Phương pháp đề xuất không nhận semester placement từ planning guide. Planning guide chỉ được dùng làm baseline hoặc reference trong thí nghiệm.

## 2. Main research question đã xác định

> **Nếu không sử dụng planning guide hoặc recommended-semester information, một hệ thống chỉ dựa trên các ràng buộc của chương trình đào tạo có thể sinh các degree path hợp lệ, đúng hạn, đa dạng và có thể cập nhật sau thay đổi ở mức nào so với các baseline?**

English draft:

> **To what extent can a curriculum-constraint-only planner, without handcrafted degree maps or recommended-semester information, generate valid, on-time, diverse, and adaptive degree paths compared with guide-informed and rule-based baselines?**

## 3. Các sub-question đã xác định

### RQ1 — Guide-independent degree planning

> Khi không dùng recommended semester, hệ thống có thể sinh full degree paths thỏa chương trình đào tạo và hoàn thành trong horizon chuẩn tương đương phương pháp có sử dụng planning guide không?

RQ1 tập trung vào:

- Academic validity.
- Completion within eight terms.
- Requirement coverage.
- Credit-load distribution.
- Path diversity.
- Runtime.
- Khác biệt so với planning guide.

### RQ2 — Adaptive replanning

> Trong các sự cố học tập được kiểm soát, một stability-aware planner có thể phục hồi path hợp lệ và đúng hạn đến mức nào, đồng thời giảm thay đổi không cần thiết so với greedy và full re-optimization?

Sự cố gồm:

- Sinh viên rớt môn.
- Sinh viên giữ một lựa chọn khác recommendation.
- Môn không được mở hoặc bị hủy.

### RQ3 — Explainability, hiện là hướng phụ

> Constraint-derived explanations có giúp người dùng và cố vấn hiểu, kiểm chứng và chấp nhận recommendation hoặc replan không?

RQ3 chưa được chốt là câu hỏi chính của paper. Trước mắt explanation là functional requirement của product và có thể được đánh giá phụ trên một mẫu nhỏ.

## 4. Phương pháp đề xuất đã xác định ở mức nghiên cứu

Phương pháp đề xuất gồm:

1. Canonical curriculum model không có `recommendedSemester`.
2. Constraint model biểu diễn course requirements, group thresholds, relations và term capacity.
3. CP-SAT tìm full degree paths.
4. Selection policy xếp hạng nghiệm khả thi bằng các tiêu chí công khai.
5. Diversity mechanism chọn một số path đại diện thay vì enumerate toàn bộ.
6. Stability-aware objective giữ phần path cũ khi replan.
7. Structured explanation dựa trên rule trace, constraint violations và plan diff.

Course-code order chỉ là deterministic final tie-break và không được xem là academic preference.

## 5. Reference và baseline đã xác định

| Ký hiệu | Phương pháp | Mục đích so sánh |
|---|---|---|
| R0 | Official planning guide | Human-authored reference path; chưa phải executable baseline |
| B1 | Greedy rule-based planner | Kiểm tra lợi ích của global constraint optimization |
| B2 | Guide-informed CP-SAT | Đo ảnh hưởng của `recommendedSemester` prior |
| B3 | Fresh CP-SAT re-optimization | Đo giá trị của stability-aware replanning |
| Proposed | Guide-independent, stability-aware CP-SAT | Phương pháp đề xuất |

### 5.1 Greedy baseline dự kiến

Mỗi kỳ:

1. Lấy các môn đủ điều kiện.
2. Ưu tiên môn bắt buộc.
3. Ưu tiên môn mở khóa nhiều môn khác.
4. Chọn đến giới hạn tín chỉ.
5. Dùng course code làm tie-break.

### 5.2 Guide-informed CP-SAT

Baseline này được phép dùng semester placement từ planning guide và phạt assignment nằm xa kỳ khuyến nghị. Trường này chỉ tồn tại trong thí nghiệm, không nằm trong input của product đề xuất.

### 5.3 Fresh CP-SAT

Sau sự cố, baseline bỏ future path cũ và tối ưu lại từ đầu. So sánh với Proposed sẽ cho biết stability objective có giảm collateral changes mà vẫn bảo toàn feasibility và completion hay không.

## 6. Thiết kế dữ liệu đã xác định

Paper sử dụng **hybrid dataset** thay vì tuyên bố có dữ liệu vận hành thật hoàn chỉnh.

### 6.1 Thành phần dữ liệu thật

- Một curriculum chính thức.
- Course codes, credits và requirement groups.
- Các quan hệ học phần sau khi được chuẩn hóa và xác nhận.
- Planning guide chính thức làm reference/baseline.

### 6.2 Thành phần dữ liệu tổng hợp

- Student academic snapshots.
- Current enrollment snapshots.
- Offering snapshots theo publication stage; registration round là metadata optional của mock nếu cần mô phỏng quy trình từng đợt.
- Course failure events.
- Manual-deviation events.
- Course-unavailability events.

### 6.3 Cách mô tả dữ liệu trong paper

> We evaluate the proposed method using a hybrid dataset comprising an officially published curriculum and constraint-consistent synthetic student trajectories, enrollment states, and controlled academic disruption scenarios.

Không được mô tả mock snapshots là dữ liệu vận hành thật của trường.

## 7. Cách sinh synthetic scenarios đã xác định

1. Tạo một tập base paths hợp lệ.
2. Kiểm tra bằng validator độc lập.
3. Cắt path sau các checkpoint để tạo student states ở nhiều giai đoạn.
4. Chuyển phần trước checkpoint thành `passed`, kỳ hiện tại thành `in_progress` hoặc `enrolled`, phần sau thành future plan.
5. Tiêm event theo loại và mức độ.
6. Chạy mọi baseline trên cùng scenario.
7. Lưu seed, input snapshot và output để tái lập.

Để giảm bias do proposed solver tự tạo dữ liệu đánh giá, base states nên kết hợp:

- Prefix từ planning guide.
- Feasible paths được sinh khi tắt objective riêng của proposed method.
- Một số profiles hoặc paths được chuyên gia kiểm tra.

### 7.1 Failure scenarios

Chọn course theo criticality thấp, trung bình và cao. Criticality có thể dựa trên số descendant trong prerequisite graph hoặc blocking factor đã định nghĩa rõ.

### 7.2 Manual-deviation scenarios

- Khác recommendation một môn.
- Khác hai đến ba môn.
- Một kỳ gần như hoàn toàn khác recommendation.

Lựa chọn của sinh viên phải hợp lệ tại thời điểm được khóa.

### 7.3 Offering scenarios

- Một môn không mở trong một kỳ.
- Một môn không mở hai kỳ liên tiếp.
- Một critical course không mở.
- Một elective không mở.

### 7.4 Quy mô thí nghiệm ban đầu

Một ma trận khả thi:

```text
10 base paths
× 5 checkpoints
× 3 event types
× 3 severity levels
= 450 scenarios
```

Con số cuối cùng chưa được chốt; ưu tiên thiết kế scenario có lý do và tái lập được hơn là tăng số lượng tùy ý.

## 8. Metrics đã xác định

### 8.1 Correctness và feasibility

- **Validity rate:** tỷ lệ output đã trả về thỏa toàn bộ hard constraints; mục tiêu kỹ thuật phải là 100% nhưng metric này không thay thế coverage.
- **Solution-found rate / feasible-case coverage:** trong các trạng thái đã được xác nhận còn nghiệm, phương pháp tìm được ít nhất một nghiệm trong time limit bao nhiêu lần.
- **Completion@8:** tỷ lệ path hoàn thành trước hoặc tại kỳ 8 tính từ khi sinh viên bắt đầu chương trình, không phải tám kỳ mới tính từ thời điểm lập kế hoạch.
- **Requirement coverage:** mức hoàn thành required courses và group thresholds.
- **Correct infeasibility diagnosis:** phân loại đúng feasible/infeasible.

### 8.2 Replanning

- **Recovery@8:** tỷ lệ tìm được path hoàn thành kỳ 8 trong những scenario mà một path kỳ 8 thực sự còn tồn tại.
- **Graduation delay:** số kỳ trễ so với target.
- **Unnecessary delay:** `completionTerm(method) - earliestFeasibleCompletionTerm`.
- **Collateral change rate:** tỷ lệ course không trực tiếp bị event ảnh hưởng nhưng bị đổi term hoặc thay thế.
- **Plan retention:** tỷ lệ future course-term assignments được giữ nguyên.
- **Solve time:** median, p95 và timeout rate.

### 8.3 Path quality và diversity

- Credit-load deviation.
- Số kỳ chạm maximum load.
- Critical-course delay.
- Pairwise assignment distance giữa các path được hiển thị.
- Số representative paths không bị dominated.

### 8.4 Expert evaluation nếu thực hiện

- Academic appropriateness, thang 1–5.
- Explanation correctness, thang 1–5.
- Stability acceptability, thang 1–5.
- Có chấp nhận dùng path làm tư vấn hay không.
- Inter-rater agreement nếu có ít nhất hai người chấm.

## 9. Ground truth đã xác định

- Một validator có code path riêng, không dùng objective/ranking của solver, kiểm tra lại mọi output từ rule catalog. Validator vẫn phụ thuộc vào độ đúng của các luật đã chuẩn hóa nên không tự nó là ground truth học vụ.
- Một feasibility solve không có soft objective xác định scenario còn path kỳ 8 hay không.
- Earliest feasible completion `T*` được dùng để tính unnecessary delay.
- Planning guide là reference của con người, không mặc định là nghiệm tối ưu hoặc ground truth duy nhất.
- Expert review được dùng để đánh giá tính hợp lý thực hành, không thay thế constraint validation.

## 10. Những kết luận paper được phép và chưa được phép đưa ra

### 10.1 Có thể kết luận với hybrid dataset

- Solver sinh path có đúng curriculum rules hay không.
- Việc bỏ recommended-semester prior ảnh hưởng đến validity, completion và structure của path thế nào.
- Phương pháp nào phục hồi path tốt hơn trong controlled scenarios.
- Stability objective có giảm collateral changes không.
- Runtime và khả năng mở rộng trong phạm vi curriculum được thử nghiệm.
- Hệ thống có phát hiện đúng structural infeasibility không.

### 10.2 Chưa thể kết luận nếu không có dữ liệu thật hoặc user study

- Hệ thống giúp sinh viên thực tế đạt điểm cao hơn.
- Recommendation làm tăng tỷ lệ tốt nghiệp đúng hạn trong thực tế.
- Độ khó course hoặc xác suất pass được dự đoán đúng.
- Sinh viên và cố vấn thực tế sẽ chấp nhận product.
- Mock API phản ánh chính xác API và data quality của trường.
- Hệ thống đã sẵn sàng tích hợp production.

## 11. Những vấn đề paper cần tiếp tục xác định

### 11.1 Trọng tâm và độ rộng của research question

- Paper chính tập trung RQ1, RQ2 hay cả hai.
- Explainability là contribution độc lập hay chỉ là product feature và evaluation phụ.
- Maintenance effort khi curriculum thay đổi có được đưa thành một metric chính không.
- “Comparable to planning guide” được định nghĩa bằng những metric nào.

### 11.2 Novelty

- Khác biệt cụ thể với `Constraint Programming for Optimized Degree Paths` là gì.
- Khác biệt với commercial auto-planning như uAchieve ở mức mô hình và đánh giá là gì.
- Contribution chính là guide-independent planning, stability-aware replan, explainability hay benchmark.
- Có thể tuyên bố “replace planning guide” hay chỉ “reduce dependence on handcrafted semester maps”.

### 11.3 Formal model

- Chính xác tập hard constraints được đưa vào paper.
- Semantics của `KN` và tác động của lựa chọn hard/soft.
- Objective được giải lexicographically hay weighted sum.
- Công thức criticality và load balance.
- Cách định nghĩa path diversity và representative selection.
- Cách xử lý elective groups chồng lắp.
- Cách xử lý in-progress assumption trong thí nghiệm.

### 11.4 Baseline implementation

- Nếu muốn nâng planning guide từ reference thành executable baseline, cần định nghĩa rõ cách sửa guide khi student đã lệch path; nếu chưa có thuật toán này thì chỉ dùng guide làm reference.
- Guide-informed CP-SAT dùng penalty nào cho recommended semester.
- Greedy baseline có lookahead hay chỉ quyết định từng kỳ.
- Fresh CP-SAT có cùng objective với Proposed ngoại trừ stability term hay không.
- Solver time limit và optimality gap áp dụng thống nhất thế nào.

### 11.5 Dataset và external validity

- Curriculum đã được đối soát đầy đủ 128 tín chỉ chưa.
- Có thể thêm curriculum thứ hai hoặc thứ ba không.
- Ai xác nhận normalized rules.
- Có thể lấy một số hồ sơ đã ẩn danh hay chỉ dùng synthetic profiles.
- Có bao nhiêu expert raters và có thể dành thời gian chấm bao nhiêu outputs.
- Scenario distribution dựa trên thiết kế cân bằng hay cố gắng phản ánh tần suất thực tế.
- Cách công bố dữ liệu khi source curriculum có hạn chế bản quyền hoặc quyền truy cập.

### 11.6 Experimental design và thống kê

- Đơn vị phân tích là scenario, student state hay generated path.
- Số base paths/checkpoints/events đủ power hay chưa.
- Cách xử lý scenario vốn structurally impossible within eight terms.
- Binary metrics dùng paired comparison nào.
- Continuous metrics báo confidence interval và effect size nào.
- Có pre-register hypotheses và acceptance thresholds hay không.
- Cách báo timeout, infeasible và suboptimal solution công bằng giữa các phương pháp.

### 11.7 Explanation evaluation

- Explanation chỉ kiểm tra fidelity hay có user comprehension study.
- Cách tạo independent expected explanation cho một số test case.
- Có đánh giá minimal conflict/minimum repair hay chỉ rule trace.
- Nếu dùng LLM diễn đạt, cách bảo đảm nội dung không vượt khỏi structured evidence.

### 11.8 Reproducibility

- Publish canonical schema, rule catalog và scenario generator ở mức nào.
- Fixed seeds và solver version.
- Lưu input/output artifacts cho từng experiment.
- Tách training/tuning/evaluation nếu sau này thêm learned component.
- Có thể công khai code, dataset đã chuẩn hóa và experiment scripts hay không.

## 12. Giả thuyết nghiên cứu dự kiến

Các giả thuyết dưới đây chưa phải kết quả và cần được chốt trước thí nghiệm:

- **H1:** Guide-independent CP-SAT duy trì validity và Completion@8 gần với guide-informed CP-SAT trên các trạng thái còn khả thi. Nếu kiểm định theo hướng non-inferiority, margin và phương pháp thống kê phải được chốt trước khi chạy full experiment.
- **H2:** Proposed method có Recovery@8 cao hơn greedy baseline.
- **H3:** Stability-aware replanning có collateral change thấp hơn fresh CP-SAT mà không làm tăng unnecessary delay đáng kể.
- **H4:** Proposed method trả kết quả trong thời gian phù hợp với một interactive planning service cho một sinh viên.

## 13. Những câu cần hỏi thầy về paper

1. Câu hỏi nghiên cứu nên tập trung vào việc bỏ planning guide prior hay adaptive replanning?
2. Có chấp nhận dùng planning guide/recommended semester làm baseline nhưng không đưa vào phương pháp đề xuất không?
3. Hybrid dataset gồm curriculum thật và student/event data tổng hợp có phù hợp với kỳ vọng của đề tài không?
4. Một curriculum được xem là case study đủ cho đồ án; để hướng tới paper có cần thêm curriculum khác không?
5. Ai có thể xác nhận normalized rules và chấm một mẫu generated paths?
6. Explainability nên là contribution chính hay chỉ là supporting feature?
7. Thầy đánh giá contribution nào khả thi nhất: guide-independent model, stability-aware replan, benchmark hay explanation?
8. Có yêu cầu venue hoặc timeline cụ thể để định mức độ thực nghiệm cần thiết không?

## 14. Các bước tiếp theo cho paper

1. Chốt một main RQ và tối đa hai sub-RQ chính.
2. Hoàn thành normalized curriculum và independent validator.
3. Viết formal problem statement và objective hierarchy.
4. Định nghĩa executable baselines.
5. Xây scenario generator và đóng băng evaluation protocol trước khi tối ưu kết quả.
6. Chạy pilot experiment để kiểm tra metric và phát hiện lỗi thiết kế.
7. Xin expert review trên một mẫu nhỏ.
8. Chạy full experiment, thống kê và phân tích failure cases.
9. Viết limitations theo đúng loại dữ liệu đã sử dụng.

## 15. Tiêu chí để research design đủ rõ

Một người đọc research protocol phải trả lời được:

1. Phương pháp đề xuất khác baseline chính xác ở đâu.
2. Dữ liệu nào thật, dữ liệu nào tổng hợp và được sinh thế nào.
3. Ground truth cho validity, feasibility và earliest completion đến từ đâu.
4. “Replan tốt” được đo bằng metric nào.
5. Scenario nào được đưa vào và scenario nào bị loại.
6. Kết luận nào được phép rút ra từ experiment.
7. Hạn chế external validity của một curriculum và mock operational data là gì.

