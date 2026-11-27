# Evaluation: NE-KTHN

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
| bge-m3-zeroshot vs embedding | 0.26 |
| bge-m3-zeroshot vs embedding-vi | 0.08 |
| bge-m3-zeroshot vs keyword | 0.00 |
| bge-m3-zeroshot vs modernbert | 0.78 |
| embedding vs embedding-vi | 0.59 |
| embedding vs keyword | -0.00 |
| embedding vs modernbert | 0.33 |
| embedding-vi vs keyword | 0.00 |
| embedding-vi vs modernbert | 0.15 |
| keyword vs modernbert | 0.00 |

Krippendorff's alpha per tag across models: mean 0.17; 0 of 3 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.70 | 10 | – | 0 |
| embedding | 0.50 | 10 | – | 0 |
| embedding-vi | 0.48 | 10 | – | 0 |
| keyword | 1.00 | 10 | – | 0 |
| modernbert | 0.80 | 10 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.60 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.3 | 0 | 7 | 1 |
| embedding | 0.8 | 1 | 3 | 2 |
| embedding-vi | 1.4 | 1 | 1 | 2 |
| keyword | 0.0 | 0 | 10 | 0 |
| modernbert | 0.2 | 0 | 8 | 1 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 120 | 0 | 0.0 | – |
| embedding | 120 | 20 | 0.5 | 0.027 |
| embedding-vi | 120 | 8 | 0.3 | 0.040 |
| keyword | 120 | 20 | 0.0 | 0.001 |
| modernbert | 120 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
