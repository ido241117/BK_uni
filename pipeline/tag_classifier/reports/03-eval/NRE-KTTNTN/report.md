# Evaluation: NRE-KTTNTN

20 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) | KTTH | TNTN |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.00 | 0.00 | 0.00 | 0.00 |
| embedding | 0.00 | 0.00 | 0.00 | 0.00 |
| embedding-vi | 0.25 | 0.50 | 0.50 | 0.00 |
| keyword | 0.00 | – | 0.00 | 0.00 |
| modernbert | 0.00 | – | 0.00 | 0.00 |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.08 |
| bge-m3-zeroshot vs embedding-vi | 0.03 |
| bge-m3-zeroshot vs keyword | -0.01 |
| bge-m3-zeroshot vs modernbert | 0.35 |
| embedding vs embedding-vi | 0.59 |
| embedding vs keyword | -0.01 |
| embedding vs modernbert | 0.22 |
| embedding-vi vs keyword | -0.02 |
| embedding-vi vs modernbert | 0.10 |
| keyword vs modernbert | 0.21 |

Krippendorff's alpha per tag across models: mean 0.13; 0 of 13 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.82 | 20 | – | 0 |
| embedding | 0.54 | 20 | – | 0 |
| embedding-vi | 0.56 | 20 | – | 0 |
| keyword | 0.85 | 20 | – | 0 |
| modernbert | 0.85 | 20 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.43 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.2 | 0 | 16 | 1 |
| embedding | 1.6 | 1 | 7 | 7 |
| embedding-vi | 3.0 | 2 | 1 | 7 |
| keyword | 0.1 | 0 | 18 | 1 |
| modernbert | 0.3 | 0 | 14 | 2 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 1040 | 0 | 0.0 | – |
| embedding | 1040 | 780 | 47.0 | 0.060 |
| embedding-vi | 1040 | 756 | 31.4 | 0.042 |
| keyword | 1040 | 828 | 0.3 | 0.000 |
| modernbert | 1040 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
