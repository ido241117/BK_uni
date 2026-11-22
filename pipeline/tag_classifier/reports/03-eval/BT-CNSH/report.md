# Evaluation: BT-CNSH

21 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.32 |
| bge-m3-zeroshot vs embedding-vi | 0.18 |
| bge-m3-zeroshot vs keyword | 0.43 |
| bge-m3-zeroshot vs modernbert | 0.50 |
| embedding vs embedding-vi | 0.62 |
| embedding vs keyword | 0.25 |
| embedding vs modernbert | 0.19 |
| embedding-vi vs keyword | 0.14 |
| embedding-vi vs modernbert | 0.12 |
| keyword vs modernbert | 0.39 |

Krippendorff's alpha per tag across models: mean 0.22; 1 of 25 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.51 | 20 | 0.00 | 1 |
| embedding | 0.37 | 20 | 0.43 | 1 |
| embedding-vi | 0.60 | 20 | 0.83 | 1 |
| keyword | 0.53 | 20 | 0.00 | 1 |
| modernbert | 0.70 | 20 | 1.00 | 1 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.54 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 1.1 | 1 | 8 | 3 |
| embedding | 3.8 | 4 | 3 | 10 |
| embedding-vi | 6.2 | 7 | 2 | 11 |
| keyword | 0.6 | 0 | 14 | 3 |
| modernbert | 0.6 | 0 | 11 | 2 |

## Run time

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2184 | 0 | 0.0 | – |
| embedding | 2184 | 0 | 0.0 | – |
| embedding-vi | 2184 | 0 | 0.0 | – |
| keyword | 2184 | 0 | 0.0 | – |
| modernbert | 2184 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
