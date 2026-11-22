# Evaluation: ME-KTCK

14 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.05 |
| bge-m3-zeroshot vs embedding-vi | 0.01 |
| bge-m3-zeroshot vs keyword | -0.01 |
| bge-m3-zeroshot vs modernbert | 0.49 |
| embedding vs embedding-vi | 0.66 |
| embedding vs keyword | -0.01 |
| embedding vs modernbert | 0.07 |
| embedding-vi vs keyword | -0.01 |
| embedding-vi vs modernbert | 0.11 |
| keyword vs modernbert | -0.01 |

Krippendorff's alpha per tag across models: mean 0.15; 0 of 14 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.57 | 14 | – | 0 |
| embedding | 0.69 | 14 | – | 0 |
| embedding-vi | 0.57 | 14 | – | 0 |
| keyword | 0.86 | 14 | – | 0 |
| modernbert | 0.71 | 14 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.48 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.5 | 0 | 7 | 1 |
| embedding | 2.2 | 1 | 6 | 10 |
| embedding-vi | 3.5 | 2 | 2 | 9 |
| keyword | 0.1 | 0 | 13 | 1 |
| modernbert | 0.4 | 0 | 10 | 2 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 840 | 0 | 0.0 | – |
| embedding | 840 | 740 | 42.3 | 0.057 |
| embedding-vi | 840 | 640 | 35.0 | 0.055 |
| keyword | 840 | 740 | 0.3 | 0.000 |
| modernbert | 840 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
