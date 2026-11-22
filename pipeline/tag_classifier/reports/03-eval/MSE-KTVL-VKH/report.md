# Evaluation: MSE-KTVL-VKH

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
| bge-m3-zeroshot vs embedding-vi | 0.14 |
| bge-m3-zeroshot vs keyword | 0.27 |
| bge-m3-zeroshot vs modernbert | 0.52 |
| embedding vs embedding-vi | 0.66 |
| embedding vs keyword | 0.06 |
| embedding vs modernbert | 0.20 |
| embedding-vi vs keyword | 0.03 |
| embedding-vi vs modernbert | 0.16 |
| keyword vs modernbert | 0.32 |

Krippendorff's alpha per tag across models: mean 0.17; 0 of 6 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.76 | 17 | – | 0 |
| embedding | 0.71 | 17 | – | 0 |
| embedding-vi | 0.57 | 17 | – | 0 |
| keyword | 1.00 | 17 | – | 0 |
| modernbert | 0.79 | 17 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.70 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.4 | 0 | 11 | 1 |
| embedding | 1.5 | 2 | 5 | 3 |
| embedding-vi | 2.2 | 3 | 2 | 4 |
| keyword | 0.1 | 0 | 16 | 1 |
| modernbert | 0.3 | 0 | 12 | 1 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 408 | 0 | 0.0 | – |
| embedding | 408 | 204 | 7.6 | 0.037 |
| embedding-vi | 408 | 204 | 7.2 | 0.035 |
| keyword | 408 | 204 | 0.1 | 0.001 |
| modernbert | 408 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
