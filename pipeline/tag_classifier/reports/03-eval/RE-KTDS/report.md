# Evaluation: RE-KTDS

22 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.22 |
| bge-m3-zeroshot vs embedding-vi | 0.10 |
| bge-m3-zeroshot vs keyword | 0.13 |
| bge-m3-zeroshot vs modernbert | 0.58 |
| embedding vs embedding-vi | 0.66 |
| embedding vs keyword | 0.07 |
| embedding vs modernbert | 0.15 |
| embedding-vi vs keyword | 0.06 |
| embedding-vi vs modernbert | 0.10 |
| keyword vs modernbert | 0.35 |

Krippendorff's alpha per tag across models: mean 0.17; 0 of 14 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.80 | 22 | – | 0 |
| embedding | 0.51 | 22 | – | 0 |
| embedding-vi | 0.63 | 22 | – | 0 |
| keyword | 0.91 | 22 | – | 0 |
| modernbert | 0.91 | 22 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.56 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.5 | 0 | 14 | 2 |
| embedding | 2.7 | 3 | 3 | 7 |
| embedding-vi | 4.3 | 4 | 1 | 8 |
| keyword | 0.2 | 0 | 18 | 1 |
| modernbert | 0.3 | 0 | 15 | 1 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 1320 | 0 | 0.0 | – |
| embedding | 1320 | 952 | 9.7 | 0.010 |
| embedding-vi | 1320 | 890 | 9.9 | 0.011 |
| keyword | 1320 | 1000 | 0.3 | 0.000 |
| modernbert | 1320 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
