# Evaluation: MSE-KTVL-VSI

17 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.25 |
| bge-m3-zeroshot vs embedding-vi | 0.16 |
| bge-m3-zeroshot vs keyword | 0.16 |
| bge-m3-zeroshot vs modernbert | 0.45 |
| embedding vs embedding-vi | 0.67 |
| embedding vs keyword | 0.05 |
| embedding vs modernbert | 0.38 |
| embedding-vi vs keyword | 0.03 |
| embedding-vi vs modernbert | 0.20 |
| keyword vs modernbert | 0.13 |

Krippendorff's alpha per tag across models: mean 0.22; 0 of 8 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.65 | 16 | – | 0 |
| embedding | 0.69 | 16 | – | 0 |
| embedding-vi | 0.68 | 16 | – | 0 |
| keyword | 0.75 | 16 | – | 0 |
| modernbert | 0.72 | 16 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.62 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.6 | 0 | 10 | 3 |
| embedding | 1.8 | 2 | 4 | 5 |
| embedding-vi | 2.9 | 3 | 2 | 6 |
| keyword | 0.1 | 0 | 16 | 1 |
| modernbert | 0.8 | 1 | 8 | 3 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 536 | 0 | 0.0 | – |
| embedding | 536 | 177 | 5.3 | 0.030 |
| embedding-vi | 536 | 177 | 5.0 | 0.029 |
| keyword | 528 | 240 | 0.1 | 0.000 |
| modernbert | 528 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
