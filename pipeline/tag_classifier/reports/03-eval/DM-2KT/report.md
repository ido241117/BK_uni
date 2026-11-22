# Evaluation: DM-2KT

28 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.31 |
| bge-m3-zeroshot vs embedding-vi | 0.24 |
| bge-m3-zeroshot vs keyword | 0.20 |
| bge-m3-zeroshot vs modernbert | 0.77 |
| embedding vs embedding-vi | 0.66 |
| embedding vs keyword | 0.14 |
| embedding vs modernbert | 0.26 |
| embedding-vi vs keyword | 0.08 |
| embedding-vi vs modernbert | 0.21 |
| keyword vs modernbert | 0.15 |

Krippendorff's alpha per tag across models: mean 0.25; 0 of 16 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.67 | 28 | – | 0 |
| embedding | 0.55 | 28 | – | 0 |
| embedding-vi | 0.55 | 28 | – | 0 |
| keyword | 0.64 | 28 | – | 0 |
| modernbert | 0.76 | 28 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.57 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.9 | 1 | 12 | 3 |
| embedding | 3.2 | 3 | 2 | 7 |
| embedding-vi | 4.4 | 4 | 0 | 9 |
| keyword | 0.4 | 0 | 17 | 1 |
| modernbert | 0.8 | 0 | 15 | 3 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2016 | 0 | 0.0 | – |
| embedding | 2016 | 984 | 56.1 | 0.057 |
| embedding-vi | 2016 | 984 | 41.7 | 0.042 |
| keyword | 1792 | 1116 | 0.6 | 0.001 |
| modernbert | 1792 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
