# Evaluation: AE-KTHK

27 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs keyword | 0.23 |
| bge-m3-zeroshot vs modernbert | 0.58 |
| embedding vs embedding-vi | 0.65 |
| embedding vs keyword | 0.06 |
| embedding vs modernbert | 0.38 |
| embedding-vi vs keyword | 0.04 |
| embedding-vi vs modernbert | 0.29 |
| keyword vs modernbert | 0.18 |

Krippendorff's alpha per tag across models: mean 0.25; 0 of 24 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.63 | 27 | – | 0 |
| embedding | 0.49 | 27 | – | 0 |
| embedding-vi | 0.47 | 27 | – | 0 |
| keyword | 0.53 | 27 | – | 0 |
| modernbert | 0.60 | 27 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.54 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.9 | 0 | 15 | 4 |
| embedding | 4.4 | 4 | 1 | 11 |
| embedding-vi | 5.9 | 5 | 0 | 11 |
| keyword | 0.3 | 0 | 19 | 1 |
| modernbert | 1.6 | 1 | 10 | 6 |

## Run time

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2592 | 0 | 0.0 | – |
| embedding | 2592 | 0 | 0.0 | – |
| embedding-vi | 2592 | 0 | 0.0 | – |
| keyword | 2484 | 0 | 0.0 | – |
| modernbert | 2484 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
