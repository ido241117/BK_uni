# Evaluation: CE-KTMT

30 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) | HTH | IVV | TKVMS | TTNC |
|---|---|---|---|---|---|---|
| bge-m3-zeroshot | 0.16 | 0.70 | 0.50 | 0.12 | 0.00 | 0.00 |
| embedding | 0.27 | 0.58 | 0.38 | 0.12 | 0.25 | 0.33 |
| embedding-vi | 0.78 | 0.63 | 0.75 | 0.38 | 1.00 | 1.00 |
| keyword | 0.00 | – | 0.00 | 0.00 | 0.00 | 0.00 |
| modernbert | 0.10 | 0.83 | 0.12 | 0.12 | 0.00 | 0.17 |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.35 |
| bge-m3-zeroshot vs embedding-vi | 0.28 |
| bge-m3-zeroshot vs keyword | 0.14 |
| bge-m3-zeroshot vs modernbert | 0.65 |
| embedding vs embedding-vi | 0.59 |
| embedding vs keyword | 0.09 |
| embedding vs modernbert | 0.36 |
| embedding-vi vs keyword | 0.07 |
| embedding-vi vs modernbert | 0.30 |
| keyword vs modernbert | 0.13 |

Krippendorff's alpha per tag across models: mean 0.26; 2 of 27 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.60 | 30 | – | 0 |
| embedding | 0.29 | 30 | – | 0 |
| embedding-vi | 0.49 | 30 | – | 0 |
| keyword | 0.67 | 30 | – | 0 |
| modernbert | 0.65 | 30 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.50 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 2.2 | 2 | 8 | 5 |
| embedding | 4.4 | 4 | 2 | 11 |
| embedding-vi | 6.5 | 7 | 0 | 11 |
| keyword | 0.3 | 0 | 21 | 2 |
| modernbert | 2.3 | 2 | 9 | 8 |

## Run time

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 3240 | 0 | 0.0 | – |
| embedding | 3240 | 0 | 0.0 | – |
| embedding-vi | 3240 | 0 | 0.0 | – |
| keyword | 3240 | 0 | 0.0 | – |
| modernbert | 3240 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
