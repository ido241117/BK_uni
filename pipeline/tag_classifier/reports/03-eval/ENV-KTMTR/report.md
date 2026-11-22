# Evaluation: ENV-KTMTR

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
| bge-m3-zeroshot vs embedding | 0.16 |
| bge-m3-zeroshot vs embedding-vi | 0.13 |
| bge-m3-zeroshot vs keyword | 0.06 |
| bge-m3-zeroshot vs modernbert | 0.43 |
| embedding vs embedding-vi | 0.67 |
| embedding vs keyword | 0.22 |
| embedding vs modernbert | 0.40 |
| embedding-vi vs keyword | 0.16 |
| embedding-vi vs modernbert | 0.28 |
| keyword vs modernbert | 0.12 |

Krippendorff's alpha per tag across models: mean 0.20; 0 of 24 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.62 | 27 | 0.00 | 2 |
| embedding | 0.65 | 27 | 0.25 | 2 |
| embedding-vi | 0.61 | 27 | 0.50 | 2 |
| keyword | 0.60 | 26 | 1.00 | 2 |
| modernbert | 0.48 | 26 | 0.50 | 2 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.55 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 1.0 | 0 | 15 | 5 |
| embedding | 4.4 | 6 | 6 | 9 |
| embedding-vi | 6.1 | 6 | 1 | 10 |
| keyword | 1.0 | 1 | 12 | 4 |
| modernbert | 1.8 | 2 | 9 | 7 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2900 | 0 | 0.0 | – |
| embedding | 2900 | 2645 | 75.3 | 0.029 |
| embedding-vi | 2900 | 2544 | 13.6 | 0.005 |
| keyword | 2736 | 2516 | 0.6 | 0.000 |
| modernbert | 2736 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
