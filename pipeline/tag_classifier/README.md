# tag_classifier: tìm tag cho môn học từ đề cương

Pipeline riêng, tách **tìm tag** (máy làm, đo được) khỏi **chọn tag** (nhóm quyết định trong file
CSV). Tag cuối cùng được xuất sang `pipeline/planner/data/course-tags.json` để engine ASP dùng
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
| 6 | `python -m tag_classifier.review --curriculum CODE`, then `export` | review CSV → `review/<code>.csv`; kept tags → `pipeline/planner/data/course-tags.json` | done |
| – | `python -m tag_classifier.bundle`, `notebooks/colab_classify.ipynb`, `merge_cache` | NLI scoring on a Colab GPU | done, not yet run on Colab |

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
cannot invent tags. Three sources, all within one curriculum (thresholds in `config.toml`,
`[candidates]`):

| Source | Candidates | Coverage (courses of the curriculum) |
|---|---|---|
| `structure` | Specializations (key = **specialization code**, e.g. `TNT`; Vietnamese name looked up from the code), block and category names with the generic parts removed ("nhóm A", "(học kỳ 5)", "- 2026", "(bắt buộc)"); names that are only generic ("Tự chọn tự do") are dropped | Courses the faculty listed under it |
| `profile` | Noun phrases of the program profile (overview + career opportunities, English) | Courses close in meaning: cosine(course text, phrase) ≥ 0.40 |
| `syllabus` | Each course's top noun phrases (cosine with the syllabus × catalogue rarity, MMR), pooled over the curriculum's courses and **clustered by meaning** (average linkage, cosine ≥ 0.70); one cluster = one candidate, labelled by its most central phrase | Courses where the cluster's phrases are top phrases or appear verbatim |

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
  ≥ 0.50, be close (≥ 0.40) to ≥ 2 courses, and have a **peaked** match: best minus median over the
  curriculum ≥ 0.23. Vague phrases are a little similar to everything ("seminars" peak 0.21), topics
  strongly to a few ("artificial intelligence" 0.30, "big data" 0.56). Company names fail here too.
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

All thresholds were measured on KHMT 2023 (values in the config comments). Every candidate keeps its
sources, course lists (`members`, `semantic`, `syllabus_courses`, `lexical_courses`, `coverage`) and
evidence sentences; the report also lists every rejected phrase with its scores.

**Quality numbers** (in the report and the JSON, no human labels needed): candidates by origin, share
with an evidence sentence, labels missing or suggested, pairs of candidates sharing ≥ 60% of courses,
and **syllabus cluster purity**: the share of a cluster's specialization courses that fall in its single
best specialization (1.0 = the cluster stays inside one faculty grouping, though the clustering never
sees those groupings).

Modules: `common.py` (config, file I/O, the topic-section list, loaders shared by all steps), `models.py`
(lazy embedding model, also used by the embedding scorer, and spaCy), `phrases.py` (section text, template lines, noun phrases cached
per line in `data/line_phrases.jsonl.gz`, rebuilt when the phraser settings change; catalogue rarity;
MMR), `structure.py` (structure candidates, specialization lists, elective set), `candidates.py` (sources, clustering, merge, labels,
coverage, quality, CLI), `candidates_report.py` (Markdown).

Run time (CPU): first run ~2.5 min (noun phrases of 51,442 lines, then cached), then ~1 min per
curriculum.

### KHMT 2023 result (2026-11-21)

58 candidates: 11 structure, 9 profile, 38 syllabus clusters; cluster purity 0.79. Good: the 5
specializations (`TNT` "artificial intelligence", `CNP` "software systems", suggested `XLA` "computer
vision", `CND` "business intelligence system", `MMA` "security"); "big data applications", "software
design", "application development"; clusters such as "logic", "practical database systems", "artificial
neural network", "applied cryptography", "web programming", "parallel processing model". Remaining
noise: clusters joined by a shared surface word ("large language models" with "uml modeling language"),
a few odd labels ("semantic processor"). Left to step 3 (model agreement) and the review CSV.

## Step 3: classify (score every course × section × tag)

`classify.py` scores each topic section of each **elective** course (`electives_only`: the ASP engine
uses tags only for electives) against every candidate tag of the curriculum, with each scorer in
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

**CPU cost (this laptop, i7-8550U, measured 2026-11-21)**: BART 2.1 s per pair (incl. load), ModernBERT
3.8 s per pair (steady), embedding 0.003 s, keyword ~0. KHMT has 55 elective courses × 4 sections ×
58 tags ≈ 12,700 pairs per model, i.e. 13 hours per NLI model on this CPU. The NLI models therefore run
on Colab (below); the cheap scorers run locally in about a minute.

## Step 4: aggregate (rule (a))

`aggregate.py`: per model and course, each section's top `section_top_k` (10) tags scoring at least
the model's `min_score` are picked; a tag is kept for the course if picked in at least
`min_section_share` (half) of its sections. `min_score`: 0.5 for NLI and keyword; 0.70 for the
embedding scorer, i.e. cosine 0.40, the coverage threshold measured in step 2. Output:
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

`review.py` writes `review/<code>.csv` (UTF-8 with BOM, opens in Excel), one row per candidate: labels,
suggested English label, sources, the courses the primary model (first of `primary_models` present)
assigned it to, Krippendorff's alpha and a reliable flag, which models assigned it anywhere, three
evidence lines (course, best-scoring section, text), and empty `keep` / `rename` / `note`. Sorted
doubtful first; tags with no scored course last. Regenerating keeps `keep` / `rename` / `note` (by tag
key). **These CSVs are the team's decisions and are committed.**

**Renaming re-scores the tag.** A `rename` is the English name the models score from then on:
`classify` reads the column, scores only the renamed tags under their new names (about 220 pairs per
tag for KHMT: ~6-7 min per NLI model on this CPU, under a minute for the cheap scorers), and records the
renames each model scored. Then `review` lists the courses for the new names. While the column and the
scores disagree, `review` prints a warning naming the models to re-run. The `courses` column is
regenerated on every `review` run, so edit course lists by hand only after the last re-scoring.

Order of work:

1. Fill in `rename` where a name is wrong or vague (the course lists follow the name).
2. `classify` (all models, or `--model` for some; Colab for many renames), then `review`.
3. Fill in `keep` (y or 1 / n or 0), adjust `courses` by hand if needed, `note` for the reason.
4. `export --dry-run`, then `export`.

`export.py` reads the CSVs and writes `pipeline/planner/data/course-tags.json`: only kept rows
(`keep` = y or 1), named by `rename`, else the English label, else the Vietnamese one, with the
`courses` column as the course list. Any `keep` value other than y / 1, n / 0 or empty stops the export
with the rows listed. A kept row with no courses is skipped with a warning, and renames that classify
has not re-scored yet are warned about. The CSVs are read as written by `review` or as re-saved by
Excel (tab-separated or Windows codepage, with a warning); save from Excel as "CSV UTF-8". `--dry-run` validates and prints without writing. `"tags"` is the format
`solve_asp.py` reads today (all curricula merged; the adapter only uses the student's own curriculum
courses); `"by_curriculum"` keeps the per-curriculum split for a later adapter change.

## Colab (NLI scoring on a GPU)

1. Locally: `python -m tag_classifier.bundle` → `data/colab_bundle.zip` (code, config, cleaned courses,
   curricula, candidates, review CSVs (for renames), current score cache; **no `.env`, no raw snapshot**).
2. Colab: open `notebooks/colab_classify.ipynb`, T4 runtime, upload the bundle, run the cells. Scoring
   resumes from the cache if the session stops. Download `colab_scores.zip`.
3. Locally: `python -m tag_classifier.merge_cache <unzipped>/tag_classifier/cache/scores.sqlite` (adds
   the Colab scores without overwriting local ones), then `classify` (all models; NLI pairs come from the
   cache), `evaluate`, `review`.

Model downloads: set `HF_HOME` to choose where models are stored (this laptop used `D:/hf-cache`;
drive C is nearly full).

### Status (2026-11-21)

Steps 1-6 and the notebook are written and tested (61 tests). KHMT 2023: cheap scorers run on all 55
electives; NLI models only on a 4-course CPU sample (pipeline check, too small for conclusions).
The full NLI run waits for Colab access.

## Kiểm thử

```
cd pipeline
tag_classifier/.venv/Scripts/python -m pytest tag_classifier/tests -q
```
