# Evaluation: FT-CNTP

17 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding-vi | 0.13 |
| bge-m3-zeroshot vs keyword | 0.32 |
| bge-m3-zeroshot vs modernbert | 0.54 |
| embedding vs embedding-vi | 0.64 |
| embedding vs keyword | 0.13 |
| embedding vs modernbert | 0.22 |
| embedding-vi vs keyword | 0.07 |
| embedding-vi vs modernbert | 0.13 |
| keyword vs modernbert | 0.28 |

Krippendorff's alpha per tag across models: mean 0.20; 0 of 20 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.40 | 17 | – | 0 |
| embedding | 0.50 | 17 | – | 0 |
| embedding-vi | 0.55 | 17 | – | 0 |
| keyword | 0.71 | 17 | – | 0 |
| modernbert | 0.65 | 17 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.56 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.8 | 1 | 6 | 3 |
| embedding | 4.3 | 3 | 0 | 9 |
| embedding-vi | 6.9 | 6 | 0 | 10 |
| keyword | 0.5 | 0 | 10 | 2 |
| modernbert | 0.6 | 1 | 8 | 2 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 1360 | 0 | 0.0 | – |
| embedding | 1360 | 1084 | 7.3 | 0.007 |
| embedding-vi | 1360 | 1044 | 7.0 | 0.007 |
| keyword | 1206 | 1006 | 0.2 | 0.000 |
| modernbert | 1206 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
