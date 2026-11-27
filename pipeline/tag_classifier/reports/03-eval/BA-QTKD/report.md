# Evaluation: BA-QTKD

29 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) | KDS | QTKD |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.38 | 0.55 | 0.75 | 0.00 |
| embedding | 0.18 | 1.00 | 0.25 | 0.11 |
| embedding-vi | 0.22 | 0.50 | 0.00 | 0.44 |
| keyword | 0.00 | – | 0.00 | 0.00 |
| modernbert | 0.36 | 0.72 | 0.50 | 0.22 |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.30 |
| bge-m3-zeroshot vs embedding-vi | 0.18 |
| bge-m3-zeroshot vs keyword | 0.19 |
| bge-m3-zeroshot vs modernbert | 0.68 |
| embedding vs embedding-vi | 0.61 |
| embedding vs keyword | 0.11 |
| embedding vs modernbert | 0.38 |
| embedding-vi vs keyword | 0.07 |
| embedding-vi vs modernbert | 0.25 |
| keyword vs modernbert | 0.18 |

Krippendorff's alpha per tag across models: mean 0.26; 1 of 23 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.59 | 27 | 0.50 | 1 |
| embedding | 0.54 | 27 | 1.00 | 1 |
| embedding-vi | 0.49 | 27 | 0.33 | 1 |
| keyword | 0.78 | 27 | 1.00 | 1 |
| modernbert | 0.59 | 27 | 0.00 | 1 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.56 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 1.7 | 1 | 2 | 4 |
| embedding | 3.3 | 2 | 4 | 9 |
| embedding-vi | 4.8 | 4 | 1 | 12 |
| keyword | 0.3 | 0 | 20 | 1 |
| modernbert | 1.8 | 1 | 3 | 7 |

## Run time

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2760 | 0 | 0.0 | – |
| embedding | 2760 | 0 | 0.0 | – |
| embedding-vi | 2760 | 0 | 0.0 | – |
| keyword | 2760 | 0 | 0.0 | – |
| modernbert | 2760 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
