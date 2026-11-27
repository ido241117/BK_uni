# Evaluation: DS-KHDL

19 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding-vi | 0.22 |
| bge-m3-zeroshot vs keyword | 0.13 |
| bge-m3-zeroshot vs modernbert | 0.61 |
| embedding vs embedding-vi | 0.64 |
| embedding vs keyword | 0.14 |
| embedding vs modernbert | 0.10 |
| embedding-vi vs keyword | 0.07 |
| embedding-vi vs modernbert | 0.07 |
| keyword vs modernbert | -0.02 |

Krippendorff's alpha per tag across models: mean 0.18; 0 of 9 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.39 | 18 | 0.00 | 1 |
| embedding | 0.61 | 18 | 0.33 | 1 |
| embedding-vi | 0.50 | 18 | 0.50 | 1 |
| keyword | 0.83 | 18 | 1.00 | 1 |
| modernbert | 0.50 | 18 | 1.00 | 1 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.54 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.6 | 1 | 9 | 2 |
| embedding | 1.3 | 1 | 4 | 3 |
| embedding-vi | 2.2 | 2 | 1 | 4 |
| keyword | 0.1 | 0 | 17 | 1 |
| modernbert | 0.5 | 0 | 10 | 2 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 684 | 0 | 0.0 | – |
| embedding | 684 | 552 | 5.6 | 0.010 |
| embedding-vi | 684 | 508 | 7.2 | 0.014 |
| keyword | 684 | 628 | 0.4 | 0.001 |
| modernbert | 684 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
