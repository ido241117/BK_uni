# Evaluation: SCE-KTBD

13 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.06 |
| bge-m3-zeroshot vs embedding-vi | 0.03 |
| bge-m3-zeroshot vs keyword | -0.01 |
| bge-m3-zeroshot vs modernbert | 0.38 |
| embedding vs embedding-vi | 0.79 |
| embedding vs keyword | 0.08 |
| embedding vs modernbert | 0.23 |
| embedding-vi vs keyword | 0.05 |
| embedding-vi vs modernbert | 0.16 |
| keyword vs modernbert | -0.02 |

Krippendorff's alpha per tag across models: mean 0.21; 0 of 7 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.92 | 13 | – | 0 |
| embedding | 0.59 | 13 | – | 0 |
| embedding-vi | 0.62 | 13 | – | 0 |
| keyword | 0.85 | 13 | – | 0 |
| modernbert | 1.00 | 13 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.71 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.2 | 0 | 11 | 1 |
| embedding | 1.5 | 2 | 3 | 3 |
| embedding-vi | 2.0 | 2 | 1 | 3 |
| keyword | 0.1 | 0 | 12 | 1 |
| modernbert | 0.2 | 0 | 11 | 2 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 364 | 0 | 0.0 | – |
| embedding | 364 | 196 | 4.8 | 0.025 |
| embedding-vi | 364 | 176 | 4.7 | 0.027 |
| keyword | 364 | 196 | 0.1 | 0.000 |
| modernbert | 364 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
