# Evaluation: EE-KTDIEN

29 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.24 |
| bge-m3-zeroshot vs embedding-vi | 0.21 |
| bge-m3-zeroshot vs keyword | 0.32 |
| bge-m3-zeroshot vs modernbert | 0.61 |
| embedding vs embedding-vi | 0.67 |
| embedding vs keyword | 0.16 |
| embedding vs modernbert | 0.26 |
| embedding-vi vs keyword | 0.11 |
| embedding-vi vs modernbert | 0.22 |
| keyword vs modernbert | 0.25 |

Krippendorff's alpha per tag across models: mean 0.29; 2 of 23 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.64 | 29 | – | 0 |
| embedding | 0.54 | 29 | – | 0 |
| embedding-vi | 0.45 | 29 | – | 0 |
| keyword | 0.60 | 29 | – | 0 |
| modernbert | 0.64 | 29 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.61 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 1.2 | 1 | 7 | 3 |
| embedding | 4.6 | 5 | 0 | 7 |
| embedding-vi | 6.3 | 6 | 0 | 11 |
| keyword | 0.8 | 1 | 13 | 4 |
| modernbert | 1.2 | 1 | 9 | 5 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2668 | 0 | 0.0 | – |
| embedding | 2668 | 1916 | 53.9 | 0.028 |
| embedding-vi | 2668 | 1768 | 91.8 | 0.052 |
| keyword | 2552 | 1964 | 1.2 | 0.001 |
| modernbert | 2552 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
