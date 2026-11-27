# Evaluation: TRE-XDCTGT

13 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) | CTGT |
|---|---|---|---|
| bge-m3-zeroshot | 0.00 | – | 0.00 |
| embedding | 0.60 | 1.00 | 0.60 |
| embedding-vi | 0.80 | 1.00 | 0.80 |
| keyword | – | – | – |
| modernbert | – | – | – |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.55 |
| bge-m3-zeroshot vs embedding-vi | 0.35 |
| bge-m3-zeroshot vs keyword | 0.34 |
| bge-m3-zeroshot vs modernbert | 0.85 |
| embedding vs embedding-vi | 0.75 |
| embedding vs keyword | 0.21 |
| embedding vs modernbert | 0.55 |
| embedding-vi vs keyword | 0.15 |
| embedding-vi vs modernbert | 0.35 |
| keyword vs modernbert | 0.38 |

Krippendorff's alpha per tag across models: mean 0.35; 1 of 19 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.86 | 13 | – | 0 |
| embedding | 0.49 | 13 | – | 0 |
| embedding-vi | 0.66 | 13 | – | 0 |
| keyword | 0.69 | 13 | – | 0 |
| modernbert | 0.93 | 13 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.59 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 2.5 | 3 | 4 | 6 |
| embedding | 4.2 | 4 | 2 | 10 |
| embedding-vi | 4.8 | 5 | 0 | 10 |
| keyword | 0.7 | 0 | 7 | 3 |
| modernbert | 2.2 | 2 | 5 | 6 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 988 | 0 | 0.0 | – |
| embedding | 988 | 796 | 7.5 | 0.009 |
| embedding-vi | 988 | 790 | 6.6 | 0.008 |
| keyword | 884 | 698 | 0.2 | 0.000 |
| modernbert | 884 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
