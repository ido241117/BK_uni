# Evaluation: DM-2DK

35 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.33 |
| bge-m3-zeroshot vs embedding-vi | 0.25 |
| bge-m3-zeroshot vs keyword | 0.18 |
| bge-m3-zeroshot vs modernbert | 0.54 |
| embedding vs embedding-vi | 0.72 |
| embedding vs keyword | 0.12 |
| embedding vs modernbert | 0.23 |
| embedding-vi vs keyword | 0.09 |
| embedding-vi vs modernbert | 0.20 |
| keyword vs modernbert | 0.24 |

Krippendorff's alpha per tag across models: mean 0.25; 0 of 14 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.65 | 34 | 0.00 | 1 |
| embedding | 0.65 | 34 | 0.67 | 1 |
| embedding-vi | 0.59 | 34 | 0.40 | 1 |
| keyword | 0.72 | 34 | 1.00 | 1 |
| modernbert | 0.79 | 34 | 1.00 | 1 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.60 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.8 | 1 | 16 | 3 |
| embedding | 3.0 | 3 | 5 | 8 |
| embedding-vi | 3.9 | 4 | 2 | 9 |
| keyword | 0.3 | 0 | 25 | 1 |
| modernbert | 0.6 | 0 | 22 | 4 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2240 | 0 | 0.0 | – |
| embedding | 2240 | 2200 | 129.7 | 0.059 |
| embedding-vi | 2240 | 2200 | 127.5 | 0.058 |
| keyword | 1960 | 1920 | 1.3 | 0.001 |
| modernbert | 1960 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
