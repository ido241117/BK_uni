# Evaluation: PE-KTDK

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
| bge-m3-zeroshot vs embedding | 0.70 |
| bge-m3-zeroshot vs embedding-vi | 0.55 |
| bge-m3-zeroshot vs keyword | 0.41 |
| bge-m3-zeroshot vs modernbert | 0.40 |
| embedding vs embedding-vi | 0.73 |
| embedding vs keyword | 0.24 |
| embedding vs modernbert | 0.49 |
| embedding-vi vs keyword | 0.24 |
| embedding-vi vs modernbert | 0.62 |
| keyword vs modernbert | 0.47 |

Krippendorff's alpha per tag across models: mean 0.42; 1 of 7 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.77 | 10 | – | 0 |
| embedding | 0.53 | 10 | – | 0 |
| embedding-vi | 0.49 | 10 | – | 0 |
| keyword | 0.90 | 10 | – | 0 |
| modernbert | 0.70 | 10 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.55 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.7 | 0 | 6 | 3 |
| embedding | 1.2 | 0 | 5 | 4 |
| embedding-vi | 1.6 | 1 | 1 | 5 |
| keyword | 0.2 | 0 | 8 | 1 |
| modernbert | 0.6 | 0 | 6 | 3 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 280 | 0 | 0.0 | – |
| embedding | 280 | 236 | 10.2 | 0.043 |
| embedding-vi | 280 | 232 | 7.4 | 0.032 |
| keyword | 240 | 240 | 0.1 | 0.001 |
| modernbert | 240 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
