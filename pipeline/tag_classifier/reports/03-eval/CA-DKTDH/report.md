# Evaluation: CA-DKTDH

20 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.28 |
| bge-m3-zeroshot vs embedding-vi | 0.17 |
| bge-m3-zeroshot vs keyword | 0.49 |
| bge-m3-zeroshot vs modernbert | 0.63 |
| embedding vs embedding-vi | 0.60 |
| embedding vs keyword | 0.15 |
| embedding vs modernbert | 0.36 |
| embedding-vi vs keyword | 0.10 |
| embedding-vi vs modernbert | 0.26 |
| keyword vs modernbert | 0.37 |

Krippendorff's alpha per tag across models: mean 0.24; 1 of 18 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.81 | 20 | – | 0 |
| embedding | 0.63 | 20 | – | 0 |
| embedding-vi | 0.54 | 20 | – | 0 |
| keyword | 0.80 | 20 | – | 0 |
| modernbert | 0.79 | 20 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.49 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.8 | 0 | 12 | 4 |
| embedding | 2.8 | 2 | 5 | 7 |
| embedding-vi | 4.0 | 3 | 1 | 9 |
| keyword | 0.3 | 0 | 15 | 2 |
| modernbert | 1.0 | 0 | 13 | 5 |

## Run time

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 1440 | 0 | 0.0 | – |
| embedding | 1440 | 0 | 0.0 | – |
| embedding-vi | 1440 | 0 | 0.0 | – |
| keyword | 1360 | 0 | 0.0 | – |
| modernbert | 1360 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
