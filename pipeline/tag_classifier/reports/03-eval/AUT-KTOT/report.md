# Evaluation: AUT-KTOT

34 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.21 |
| bge-m3-zeroshot vs embedding-vi | 0.13 |
| bge-m3-zeroshot vs keyword | 0.22 |
| bge-m3-zeroshot vs modernbert | 0.45 |
| embedding vs embedding-vi | 0.67 |
| embedding vs keyword | 0.05 |
| embedding vs modernbert | 0.19 |
| embedding-vi vs keyword | 0.03 |
| embedding-vi vs modernbert | 0.11 |
| keyword vs modernbert | 0.19 |

Krippendorff's alpha per tag across models: mean 0.21; 0 of 24 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.73 | 33 | 1.00 | 1 |
| embedding | 0.54 | 33 | 0.00 | 1 |
| embedding-vi | 0.54 | 33 | 0.29 | 1 |
| keyword | 0.67 | 33 | 1.00 | 1 |
| modernbert | 0.68 | 33 | 1.00 | 1 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.54 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.7 | 0 | 17 | 3 |
| embedding | 4.0 | 3 | 4 | 10 |
| embedding-vi | 5.9 | 6 | 1 | 12 |
| keyword | 0.1 | 0 | 30 | 1 |
| modernbert | 0.5 | 0 | 21 | 2 |

## Run time

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 3536 | 0 | 0.0 | – |
| embedding | 3536 | 0 | 0.0 | – |
| embedding-vi | 3536 | 0 | 0.0 | – |
| keyword | 3536 | 0 | 0.0 | – |
| modernbert | 3536 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
