# Evaluation: CS-2023-KHMT

4 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) | CNP |
|---|---|---|---|
| bge-m3-zeroshot | 0.75 | 1.00 | 0.75 |
| embedding | 0.75 | 1.00 | 0.75 |
| embedding-vi | 1.00 | 1.00 | 1.00 |
| keyword | 0.25 | 1.00 | 0.25 |
| modernbert | 1.00 | 1.00 | 1.00 |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.33 |
| bge-m3-zeroshot vs embedding-vi | 0.30 |
| bge-m3-zeroshot vs keyword | 0.38 |
| bge-m3-zeroshot vs modernbert | 0.49 |
| embedding vs embedding-vi | 0.86 |
| embedding vs keyword | 0.20 |
| embedding vs modernbert | 0.29 |
| embedding-vi vs keyword | 0.14 |
| embedding-vi vs modernbert | 0.30 |
| keyword vs modernbert | 0.20 |

Krippendorff's alpha per tag across models: mean 0.16; 2 of 23 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.39 | 3 | 1.00 | 1 |
| embedding | 0.61 | 3 | 1.00 | 1 |
| embedding-vi | 0.76 | 3 | 0.82 | 1 |
| keyword | 0.00 | 3 | 0.00 | 1 |
| modernbert | 0.49 | 3 | 0.60 | 1 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.80 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 2.5 | 2 | 0 | 4 |
| embedding | 9.5 | 9 | 0 | 10 |
| embedding-vi | 10.2 | 10 | 0 | 11 |
| keyword | 1.2 | 1 | 0 | 2 |
| modernbert | 5.2 | 5 | 0 | 7 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 928 | 928 | 1361.9 | 1.468 |
| embedding | 928 | 0 | 0.0 | – |
| embedding-vi | 928 | 0 | 0.0 | – |
| keyword | 912 | 0 | 0.0 | – |
| modernbert | 912 | 912 | 1025.4 | 1.124 |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
