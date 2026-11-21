# tag_classifier: tìm tag cho môn học từ đề cương

Pipeline riêng, tách **tìm tag** (máy làm, đo được) khỏi **chọn tag** (the team decides in an Excel
workbook, `review/<code>.xlsx`). Tag cuối cùng được xuất sang `pipeline/planner/data/course-tags.json` để engine ASP dùng
(`tag/2`, `interest/2`, mục tiêu `@0`). Không chạy khi giải lộ trình.

Phạm vi: mọi môn có đề cương dùng được, xét **trong từng chương trình đào tạo**. Nguồn dữ liệu
duy nhất là database của web (đọc, không ghi).

## Cài đặt

Venv riêng (mô hình ở các bước sau nặng, không đưa vào `pipeline/.venv` của planner):

```
cd pipeline
python -m venv tag_classifier/.venv
tag_classifier/.venv/Scripts/python -m pip install -r tag_classifier/requirements.txt
```

Kết nối database lấy từ `Backend/.env` (đường dẫn trong `config.toml`, mục `[database]`).

## Các bước

| # | Lệnh (`cd pipeline`, python của venv) | Vào → ra | Trạng thái |
|---|---|---|---|
| 1a | `python -m tag_classifier.extract` | database → `data/snapshot/` | xong |
| 1b | `python -m tag_classifier.preprocess` | snapshot → `data/courses.jsonl`, `logs/preprocess.csv`, `data/preprocess_summary.json` | xong |
| 1c | `python -m tag_classifier.eda` | báo cáo dữ liệu → `reports/01-data/report.md` + biểu đồ | xong |
| 2 | `python -m tag_classifier.candidates [--curriculum MÃ]` | tag ứng viên mỗi chương trình → `data/candidates/<mã>.json`, `reports/02-candidates/<mã>.md` | done, run on KHMT 2023 only |
| 3 | `python -m tag_classifier.classify --curriculum CODE [--model ID] [--limit N]` | scores per (course, section, tag, model) → `data/scores/<code>.json`, cache `cache/scores.sqlite` | done; NLI models need Colab |
| 4 | `python -m tag_classifier.aggregate --curriculum CODE` | course tags by rule (a) → `data/tags/<code>.json` | done |
| 5 | `python -m tag_classifier.evaluate --curriculum CODE` | automatic evaluation → `reports/03-eval/<name>/report.md` + charts | done |
| 6 | `python -m tag_classifier.review --curriculum CODE`, then `export` | review workbook → `review/<code>.xlsx`; kept tags → `pipeline/planner/data/course-tags.json` | done |
| – | `python -m tag_classifier.bundle`, `notebooks/colab_classify.ipynb`, `merge_cache` | NLI scoring on a Colab GPU | done, run on Colab 2026-11-22 (0.03-0.05 s per pair on a T4) |

`data/`, `logs/`, `cache/` không đưa vào git (sinh lại được). `reports/` đưa vào git.
`review/` (the team's decisions) and `notebooks/` are committed too.

## Bước 1a: trích database

Chỉ đọc (kết nối đặt `read_only`). Ghi `data/snapshot/`:

| File | Nội dung |
|---|---|
| `curricula.json` | Mỗi chương trình: mã, tên, khoa, khóa, `profile` (giới thiệu CTĐT myBK, vi/en), chuyên ngành (mã + tên), khối môn (`groups`, kèm mã chuyên ngành và danh sách môn), nhóm môn (`categories`), danh sách môn |
| `courses.json` | Môn có trong ít nhất một chương trình: mã, tên ("tiếng Việt / English"), tín chỉ |
| `outlines.jsonl.gz` | Mọi phiên bản đề cương của các môn đó, nội dung đầy đủ |
| `manifest.json` | Thời điểm trích, số dòng mỗi loại |

Notebook Colab (bước sau) chỉ nhận snapshot này, không nhận thông tin đăng nhập database.

## Bước 1b: tiền xử lý

Mỗi môn có trong ít nhất một chương trình được ghi một dòng vào `data/courses.jsonl`, kể cả môn
không có đề cương (`usable: false`), để các bước sau biết vì sao môn đó không có tag.

Phần đưa vào mô hình mặc định là **phần nội dung**: `summary`, `objectives`, `learning_outcomes`,
`sessions` (`sections`). Phần về cách tổ chức môn (`assessment_activities`, `teaching_methods`,
`references`, `study_guide`, `notes`) giữ trong `extra`, chỉ dùng khi đánh giá "tất cả các phần".

Quy tắc (ngưỡng và mẫu trong `config.toml`, mục `[preprocess]`). Mỗi thay đổi ghi một dòng vào
`logs/preprocess.csv` (UTF-8 có BOM, mở bằng Excel được):

| Quy tắc (`rule`) | Làm gì |
|---|---|
| làm sạch (không ghi log) | Bỏ HTML, ký tự ẩn (`﻿`), dấu trích dẫn `[1], [2]`, gạch đầu dòng, tiền tố "Chapter/Chương/Part N", đánh số "1.1."; nối dòng bị xuống giữa câu (dòng bắt đầu bằng chữ thường) |
| `multiple_versions` | Nhiều phiên bản một mã môn: giữ bản mới nhất (`applies_from`, rồi `version`) |
| `en_is_vi` | Dòng tiếng Việt nằm ở ô `en` (tỉ lệ chữ có dấu ≥ 0.08): chuyển sang ô `vi`, hoặc bỏ nếu ô `vi` đã có. Ô `en` là đầu vào của mô hình tiếng Anh nên phải sạch |
| `vi_is_en` | Dòng tiếng Anh (tỉ lệ ≤ 0.01) ở ô `vi`: chuyển sang ô `en` chỉ khi ô `en` trống. Dòng tiếng Việt lẫn thuật ngữ Anh giữ nguyên |
| `placeholder` | Dòng buổi học chỉ là chỗ trống hoặc thủ tục ("Topic 1", "Midterm exam", "Ôn tập", "Giới thiệu về môn học", "Thông tin thầy/cô"): bỏ. Các mẫu thủ tục buổi đầu thêm từ bảng `repeated_lines` |
| `boilerplate` | Dòng thủ tục lặp lại ("Yêu cầu tự học: 6 giờ"): bỏ |
| `identical_content` | Nhiều mã môn có phần nội dung giống hệt: **giữ cả** (mỗi môn vẫn cần tag), ghi nhóm (`identical_with`); bước phân loại tính một lần |
| `copied_summary` | Tóm tắt giống hệt môn khác nhưng phần còn lại khác (vd CO3129 chép tóm tắt CO3015): giữ nguyên, chỉ đánh dấu (`summary_same_as`), vì đó là lỗi của nguồn |
| `no_syllabus` | Môn không có đề cương |
| `unusable` | Phần nội dung của mọi ngôn ngữ dưới `min_topic_chars` (200 ký tự) sau khi làm sạch |

Cờ ngôn ngữ của mỗi môn: `en_missing` / `vi_missing` (phần nội dung ngôn ngữ đó dưới 200 ký tự);
`available` liệt kê ngôn ngữ có trong từng phần.

`data/preprocess_summary.json`: số môn theo trạng thái, theo khoa, theo ngôn ngữ, số dòng mỗi quy
tắc, và bảng `repeated_lines` (dòng xuất hiện ở ≥ 15 môn; chỉ báo cáo, để bổ sung mẫu có căn cứ).

### Kết quả lần chạy 21/11/2026

| | Số |
|---|---|
| Chương trình | 132 (12 khoa) |
| Môn trong ít nhất một chương trình | 1626 |
| Có đề cương | 1127 (1317 phiên bản; bỏ 190 bản cũ) |
| Dùng được | 1127 (1126 đủ hai ngôn ngữ; 1 chỉ tiếng Việt: EN3109) |
| Không có đề cương | 499 |
| `copied_summary` / `identical_content` | 54 / 6 môn |
| Dòng bỏ: `placeholder` / `boilerplate` | 1570 / 238 |
| Dòng chuyển hoặc bỏ do sai ô ngôn ngữ: `en_is_vi` / `vi_is_en` | 2482 / 175 (phần lớn ở `references`, nguồn chép tiếng Việt vào cả hai ô) |

## Bước 1c: báo cáo dữ liệu (EDA)

`reports/01-data/report.md`: tổng quan, đề cương theo khoa, độ phủ đề cương trong từng chương trình
(mọi môn và môn tự chọn), độ dài văn bản, phần nội dung theo ngôn ngữ, số buổi học, thay đổi của
tiền xử lý theo quy tắc, trùng lặp, nguồn tag ứng viên. Mỗi biểu đồ có bảng số đi kèm. Số liệu tính
lại từ `data/` mỗi lần chạy.

## Step 2: candidate tags

Candidates are the tag list the classifier (step 3) scores courses against; zero-shot classifiers
cannot invent tags. Three sources, all within one curriculum and, with `electives_only` (`[scope]`),
only its **elective** courses: syllabus phrases, profile matching and the faculty's course lists ignore
compulsory courses (a course can be elective in one program and compulsory in another, so this is
decided per program; catalogue-wide statistics such as phrase rarity still use every syllabus).
Thresholds in `config.toml`, `[candidates]`:

| Source | Candidates | Coverage (courses of the curriculum) |
|---|---|---|
| `structure` | Specializations (key = **specialization code**, e.g. `TNT`; Vietnamese name looked up from the code), block and category names with the generic parts removed ("nhóm A", "(học kỳ 5)", "- 2026", "(bắt buộc)"); names that are only generic ("Tự chọn tự do") are dropped | Courses the faculty listed under it |
| `profile` | Noun phrases of the program profile (overview + career opportunities, English) | Courses close in meaning: cosine(course text, phrase) ≥ `semantic_threshold` |
| `syllabus` | Each course's top noun phrases (cosine with the syllabus × catalogue rarity, MMR), pooled over the curriculum's courses and **clustered by meaning** (average linkage, cosine ≥ `cluster_threshold`); one cluster = one candidate, labelled by its most central phrase | Courses where the cluster's phrases are top phrases or appear verbatim |

Filters:

- **Noun phrases** (spaCy `en_core_web_sm`): consecutive nouns / adjectives / proper nouns ending in
  a noun, so words are never joined across a removed word and verb phrases never appear. Filler
  adjectives ("appropriate", "suitable", "relevant") are stop words. ORG entities are kept because the
  small model tags "Artificial Intelligence", "IoT", "Big Data" as ORG.
- **Template lines**: sentences of ≥ 8 words repeated verbatim in ≥ 3 courses ("an ability to
  identify, formulate, and solve complex engineering problems ...") are skipped when extracting
  phrases (215 lines). Short repeated lines are topic headings and stay.
- **Generic across the catalogue**: phrases in more than 5% of all usable syllabi ("methods", "design",
  "data") are excluded. This does not prevent broad tags inside one curriculum.
- **Clearly about some course**: a profile phrase or a cluster label must have a best course match
  ≥ `min_best_match`, cover ≥ `min_courses` courses, and have a **peaked** match: best minus median
  over the curriculum ≥ `min_peak` (vague phrases are a little similar to everything, topics strongly
  to a few). A course is covered when its syllabus is close to the phrase (cosine ≥ `semantic_threshold`)
  or, for a syllabus cluster, when its phrases are among that course's top phrases: a niche topic is
  rarely close to a whole syllabus, even the one teaching it ("build web" came from 3 courses but was
  close to only 1 syllabus, and was rejected before this rule).
- **Merge** candidates with the same meaning (label cosine ≥ 0.85, multilingual
  `paraphrase-multilingual-MiniLM-L12-v2`). A Vietnamese name that merges with an English phrase takes
  it as its English label (`TNT` ← "artificial intelligence" from the profile).
- **Suggested English label**: a structure name still without one gets the closest English phrase of
  the curriculum's own profile and syllabi if cosine ≥ 0.65 (`XLA` → "computer vision" 0.83), marked
  as a suggestion to confirm. Single-word names get none (the model gave "Toán" → "iot", 0.85).
  **No machine translation**: `Helsinki-NLP/opus-mt-vi-en` mistranslated ("Trí tuệ nhân tạo ứng
  dụng" → "U.S. Intelligence Applications"), `VietAI/envit5-translation` does not load with
  transformers 5.
- **Coverage below 2 courses**: dropped, with the reason in `dropped`.

**Calibration** (`calibrate.py`, settings in `[calibrate]`): `min_best_match`, `min_peak`,
`semantic_threshold` and `cluster_threshold` are measured from data, without human labels, over the
curricula with ≥ `min_courses_to_tag` courses to tag. Topic vs vague: positives are phrases the pipeline
picked as a course's top topic phrases, negatives are generic phrases (common across the catalogue);
phrase about a course: positive pairs are (top phrase, its course), negatives (top phrase, a course
whose syllabus does not contain it). Each threshold passes the most positives while letting through at
most `max_false_positive_rate` of the negatives (best match and peak are chosen together, since the rule
applies both). `cluster_threshold` is the value with the highest mean syllabus purity of the candidates
built with those thresholds. Two criteria were tried and dropped on KHMT 2023: maximising TPR - FPR
(let one generic phrase in three through, 56 candidates with 43 overlapping pairs) and the silhouette
score for clustering (favoured large clusters that merged distinct topics). Report, figures and values:
`reports/02-candidates/calibration/`. The other thresholds (template lines, catalogue rarity, merge,
suggested labels) are measured as noted in the config comments. Every candidate keeps its
sources, course lists (`members`, `semantic`, `syllabus_courses`, `lexical_courses`, `coverage`) and
evidence sentences; the report also lists every rejected phrase with its scores.

**Quality numbers** (in the report and the JSON, no human labels needed): candidates by origin, share
with an evidence sentence, labels missing or suggested, pairs of candidates sharing ≥ 60% of courses,
and **syllabus cluster purity**: the share of a cluster's specialization courses that fall in its single
best specialization (1.0 = the cluster stays inside one faculty grouping, though the clustering never
sees those groupings).

Modules: `common.py` (config, file I/O, the topic-section list, loaders shared by all steps),
`calibrate.py` (threshold calibration), `models.py`
(lazy embedding model, also used by the embedding scorer, and spaCy), `phrases.py` (section text, template lines, noun phrases cached
per line in `data/line_phrases.jsonl.gz`, rebuilt when the phraser settings change; catalogue rarity;
MMR), `structure.py` (structure candidates, specialization lists, elective set), `candidates.py` (sources, clustering, merge, labels,
coverage, quality, CLI), `candidates_report.py` (Markdown).

Run time (CPU): first run ~2.5 min (noun phrases of 51,442 lines, then cached), then ~1 min per
curriculum.

### KHMT 2023 result (2026-11-21, electives only)

33 candidates from the 55 electives with a usable syllabus: 7 structure, 7 profile, 19 syllabus
clusters; cluster purity 0.78. Examples: the 5 specializations (`TNT` "artificial intelligence",
suggested `CNP` "software technical", `XLA` "computer vision", `CND` "business intelligence system",
`MMA` "security"); "software design", "big data applications", "practical database systems",
"application architectures", "network threat models", "software testing techniques". Compulsory blocks
(mathematics, natural sciences, languages, politics) no longer produce candidates. Suggested English
labels still need checking in the review (e.g. "software technical", "management management tools").
Full list: `reports/02-candidates/CS-2023-KHMT.md`.

## Step 3: classify (score every course × section × tag)

`classify.py` scores each topic section of each **elective** course (`electives_only` in `[scope]`: the
ASP engine uses tags only for electives) against every candidate tag of the curriculum, with each scorer in
`config.toml` (`[[classify.models]]`):

| id | Kind | Reads | Notes |
|---|---|---|---|
| `modernbert` | NLI, `MoritzLaurer/ModernBERT-large-zeroshot-v2.0` | English text and labels | P(entailment) of "This course is about {label}." |
| `bge-m3-zeroshot` | NLI, `MoritzLaurer/bge-m3-zeroshot-v2.0` | English text, else Vietnamese; English label, else Vietnamese | the only model that scores Vietnamese-only tags |
| `embedding` / `embedding-vi` | cosine of `paraphrase-multilingual-MiniLM-L12-v2` embeddings | English / Vietnamese text | cheap, independent signal; the pair measures language stability |
| `keyword` | label or cluster phrase appears verbatim | English text | cheap, high precision |

English labels: the label, else the suggested one; tags with only a Vietnamese label are skipped by
English-only models. `facebook/bart-large-mnli` was dropped after the CPU pilot.

Scores are cached in `cache/scores.sqlite` by (model, section-text hash, label): re-runs, identical
syllabi and courses shared by several curricula are scored once. `--limit N` scores the first N
courses only (pilot); `--batch-size` overrides the NLI batch size (64 on a GPU). Output:
`data/scores/<code>.json` (`scores[model][course][section][tag]`, plus run time per model).

**CPU cost (this laptop, i7-8550U, measured 2026-11-21)**: full KHMT runs took 1.73 s per pair for
ModernBERT and 1.58 s for bge-m3 (12,500 pairs each, about 5 hours per model); embedding 0.003 s, keyword
~0. KHMT now has 55 electives × 4 sections × 33 tags ≈ 7,200 pairs per model; the cache keeps every
scored (section text, label) pair, so only new tags or renamed labels cost time. A whole-catalogue run
still needs Colab (below).

## Step 4: aggregate (rule (a))

`aggregate.py`: per model and course, each section's top `section_top_k` (10) tags scoring at least
the model's `min_score` are picked; a tag is kept for the course if picked in at least
`min_section_share` (half) of its sections. `min_score`: 0.5 for NLI and keyword; 0.689 for the
embedding scorers, i.e. cosine 0.377 = `semantic_threshold` (measured by `calibrate.py`). Output:
`data/tags/<code>.json`.

## Step 5: evaluate (automatic, no human labels)

`evaluate.py` (metric functions in `metrics.py`, tested against published examples) writes
`reports/03-eval/<scores file>/report.md`, `metrics.json` and charts:

| Check | Meaning |
|---|---|
| Specialization recall | The faculty's specialization course lists are a partial answer key: recall, and precision as a lower bound (the lists are incomplete) |
| Agreement | Cohen's kappa for every pair of models; Krippendorff's alpha per tag across models (≥ 0.667 = "tentatively reliable") |
| Section consistency | Tags from the summary alone vs from the other sections; copied summaries counted apart |
| Language stability | Same scorer on English vs Vietnamese text (`stability_pairs`) |
| Tags per course, run time | Distribution per model; seconds per pair on the machine that ran it |

Not measured yet: topic sections vs all sections (would need the extra sections scored as well).

## Step 6: review and export

`review.py` writes **`review/<code>.xlsx`**, an Excel workbook (layout in `workbook.py`). A real Excel
file rather than a CSV: saving it in Excel keeps Vietnamese text, line breaks and the dropdown (a CSV
re-saved by Excel can come back tab-separated in the Windows codepage, with Vietnamese letters lost).

- Sheet **Tags**, one row per candidate. Team columns first: **Keep** (dropdown Keep / Drop), **Rename**
  (English name), **Note**. Then the tag name (the English label the models scored; "Name source" says
  when it is only a suggestion to check), the Vietnamese name, the courses the primary model (first of
  `primary_models` present) assigned it to, one per line as "CODE name", the course count,
  Krippendorff's alpha across models, which models assigned it, sources, and evidence (best-scoring
  section of the top courses). Rows below the reliable bar (`reliable_alpha`) are shaded and sorted
  first; tags with no scored course come last. Header and team columns stay in view (frozen), with
  filters on every column.
- Sheet **Courses**: each scored elective with its tags (renamed names where given), to check course by
  course. Not read back.

Regenerating keeps Keep / Rename / Note (matched by the Key column). Close the workbook in Excel before
running `review` or `export`. **The workbooks are the team's decisions and are committed** (git shows
them as binary: changes are not readable in a diff, and two branches editing the same workbook cannot
be merged).

**Two kinds of rename.**

- **Display name** (the quick way): type the new name, choose Keep, export. The courses stay the ones in
  the row, chosen under the old name; export lists the tag under `renamed_not_rescored` in
  `course-tags.json` ({curriculum: {new name: old name}}) and prints it. No re-scoring, no second review.
- **Change of meaning** (the course list should follow the new name): after renaming, run `classify`
  (CPU: about 220 pairs per renamed tag for KHMT, ~6 min per NLI model; or build a **new** Colab bundle,
  which carries the workbook and therefore the renames), then `review`, which lists the courses for the
  new name, and decide on those. Edit course lines by hand only after the last re-scoring: `review`
  rebuilds the Courses column.

Order of work: Rename where needed, then Keep / Drop (and Note), then `export --dry-run`, `export`.
Re-score only the renames that change meaning.

`export.py` reads `review/*.xlsx` and writes `pipeline/planner/data/course-tags.json`: rows with Keep,
named by Rename, else the Tag column; the course list is the first word of each line of the Courses
column. Any Keep value other than Keep, Drop or empty stops the export with the rows listed. A kept row
with no courses is skipped with a warning, and kept renames that classify has not re-scored are listed
under `renamed_not_rescored`. `--dry-run` validates and prints without writing. `"tags"` is the format `solve_asp.py` reads
today (all curricula merged; the adapter only uses the student's own curriculum courses);
`"by_curriculum"` keeps the per-curriculum split for a later adapter change. Students see the exported
tags as interests on the Clingo tab of the planner page (`GET /api/plans/interest-tags`).

## Colab (NLI scoring on a GPU)

1. Locally, **after the last change to candidates or renames** (the bundle carries the candidate files;
   a bundle made earlier scores the old tags): `python -m tag_classifier.bundle` →
   `data/colab_bundle.zip` (code, config, cleaned courses,
   curricula, candidates, review workbooks (for renames), current score cache; **no `.env`, no raw snapshot**).
2. Colab: open `notebooks/colab_classify.ipynb`, T4 runtime, upload the bundle, run the cells. Scoring
   resumes from the cache if the session stops. Download `colab_scores.zip`.
3. Locally: unzip `colab_scores.zip` into `data/colab/<date>/` (git-ignored; keep the zip there too),
   then `python -m tag_classifier.merge_cache data/colab/<date>/tag_classifier/cache/scores.sqlite`. It
   adds the Colab scores without overwriting local ones and prints, per curriculum, how many pairs of the
   current candidates are still unscored (non-zero: the bundle was older than the candidates; make a new
   one). Then `classify` (all models; NLI pairs come from the cache), `evaluate`, `review`.

Model downloads: set `HF_HOME` to choose where models are stored (this laptop used `D:/hf-cache`;
drive C is nearly full).

### Status (2026-11-21)

Steps 1-6 and the notebook are written and tested. KHMT 2023 (restarted 2026-11-21 with electives-only
candidates and calibrated thresholds): all five scorers done on 50 candidates (NLI on Colab,
2026-11-22), evaluation in `reports/03-eval/CS-2023-KHMT/`, review workbook ready for the team's
decisions. Other curricula: candidates not generated yet.

## Kiểm thử

```
cd pipeline
tag_classifier/.venv/Scripts/python -m pytest tag_classifier/tests -q
```
