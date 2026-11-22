# Evaluation: IMT-BDCN

10 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding-vi | 0.22 |
| bge-m3-zeroshot vs keyword | 0.00 |
| bge-m3-zeroshot vs modernbert | 0.74 |
| embedding vs embedding-vi | 0.45 |
| embedding vs keyword | 0.00 |
| embedding vs modernbert | 0.28 |
| embedding-vi vs keyword | 0.00 |
| embedding-vi vs modernbert | 0.14 |
| keyword vs modernbert | 0.00 |

Krippendorff's alpha per tag across models: mean 0.14; 0 of 9 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.85 | 10 | – | 0 |
| embedding | 0.36 | 10 | – | 0 |
| embedding-vi | 0.53 | 10 | – | 0 |
| keyword | 1.00 | 10 | – | 0 |
| modernbert | 0.95 | 10 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.38 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.5 | 0 | 7 | 2 |
| embedding | 1.6 | 2 | 2 | 3 |
| embedding-vi | 2.9 | 2 | 0 | 6 |
| keyword | 0.0 | 0 | 10 | 0 |
| modernbert | 0.3 | 0 | 8 | 2 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 360 | 0 | 0.0 | – |
| embedding | 360 | 316 | 5.5 | 0.018 |
| embedding-vi | 360 | 288 | 3.9 | 0.014 |
| keyword | 360 | 316 | 0.1 | 0.000 |
| modernbert | 360 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
