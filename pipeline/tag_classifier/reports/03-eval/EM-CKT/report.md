# Evaluation: EM-CKT

28 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) |
|---|---|---|
| bge-m3-zeroshot | – | – |
| embedding | – | – |
| embedding-vi | – | – |
| keyword | – | – |
| modernbert | – | – |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.33 |
| bge-m3-zeroshot vs embedding-vi | 0.25 |
| bge-m3-zeroshot vs keyword | 0.31 |
| bge-m3-zeroshot vs modernbert | 0.67 |
| embedding vs embedding-vi | 0.71 |
| embedding vs keyword | 0.08 |
| embedding vs modernbert | 0.45 |
| embedding-vi vs keyword | 0.03 |
| embedding-vi vs modernbert | 0.38 |
| keyword vs modernbert | 0.21 |

Krippendorff's alpha per tag across models: mean 0.22; 2 of 25 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.51 | 27 | 0.00 | 1 |
| embedding | 0.40 | 27 | 0.67 | 1 |
| embedding-vi | 0.43 | 27 | 0.50 | 1 |
| keyword | 0.49 | 27 | 0.50 | 1 |
| modernbert | 0.67 | 27 | 0.50 | 1 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.61 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 1.5 | 1 | 10 | 5 |
| embedding | 4.8 | 4 | 0 | 10 |
| embedding-vi | 5.2 | 5 | 0 | 10 |
| keyword | 0.5 | 0 | 18 | 2 |
| modernbert | 2.0 | 2 | 10 | 6 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2912 | 0 | 0.0 | – |
| embedding | 2912 | 2668 | 124.5 | 0.047 |
| embedding-vi | 2912 | 2568 | 120.6 | 0.047 |
| keyword | 2800 | 2612 | 1.0 | 0.000 |
| modernbert | 2800 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
