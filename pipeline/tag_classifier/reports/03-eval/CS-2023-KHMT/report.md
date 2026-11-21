# Evaluation: CS-2023-KHMT

55 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) | CND | CNP | MMA | TNT | XLA |
|---|---|---|---|---|---|---|---|
| bge-m3-zeroshot | 0.34 | 0.68 | 0.08 | 0.78 | 0.50 | 0.20 | 0.12 |
| embedding | 0.35 | 0.62 | 0.25 | 0.78 | 0.25 | 0.33 | 0.12 |
| embedding-vi | 0.49 | 0.54 | 0.42 | 0.89 | 0.25 | 0.67 | 0.25 |
| keyword | 0.30 | 0.84 | 0.08 | 0.33 | 0.75 | 0.20 | 0.12 |
| modernbert | 0.38 | 0.64 | 0.17 | 0.89 | 0.38 | 0.33 | 0.12 |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.32 |
| bge-m3-zeroshot vs embedding-vi | 0.29 |
| bge-m3-zeroshot vs keyword | 0.35 |
| bge-m3-zeroshot vs modernbert | 0.56 |
| embedding vs embedding-vi | 0.67 |
| embedding vs keyword | 0.14 |
| embedding vs modernbert | 0.30 |
| embedding-vi vs keyword | 0.11 |
| embedding-vi vs modernbert | 0.30 |
| keyword vs modernbert | 0.22 |

Krippendorff's alpha per tag across models: mean 0.30; 5 of 53 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.48 | 51 | 0.42 | 4 |
| embedding | 0.44 | 51 | 0.78 | 4 |
| embedding-vi | 0.42 | 51 | 0.42 | 4 |
| keyword | 0.54 | 51 | 0.00 | 4 |
| modernbert | 0.56 | 51 | 0.20 | 4 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.54 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 2.5 | 2 | 2 | 6 |
| embedding | 6.6 | 7 | 0 | 13 |
| embedding-vi | 8.3 | 9 | 1 | 12 |
| keyword | 0.9 | 1 | 21 | 5 |
| modernbert | 3.9 | 4 | 4 | 9 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 12702 | 11310 | 17920.0 | 1.584 |
| embedding | 12702 | 12238 | 32.3 | 0.003 |
| embedding-vi | 12702 | 12296 | 27.5 | 0.002 |
| keyword | 12483 | 12027 | 1.5 | 0.000 |
| modernbert | 12483 | 11115 | 19271.9 | 1.734 |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
