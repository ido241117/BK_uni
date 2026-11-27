# Evaluation: DM-THK

33 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

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
| bge-m3-zeroshot vs embedding | 0.36 |
| bge-m3-zeroshot vs embedding-vi | 0.29 |
| bge-m3-zeroshot vs keyword | 0.05 |
| bge-m3-zeroshot vs modernbert | 0.68 |
| embedding vs embedding-vi | 0.76 |
| embedding vs keyword | 0.01 |
| embedding vs modernbert | 0.50 |
| embedding-vi vs keyword | 0.01 |
| embedding-vi vs modernbert | 0.42 |
| keyword vs modernbert | 0.07 |

Krippendorff's alpha per tag across models: mean 0.30; 0 of 19 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.67 | 33 | – | 0 |
| embedding | 0.64 | 33 | – | 0 |
| embedding-vi | 0.56 | 33 | – | 0 |
| keyword | 0.70 | 33 | – | 0 |
| modernbert | 0.67 | 33 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.67 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.9 | 1 | 16 | 3 |
| embedding | 3.1 | 3 | 3 | 8 |
| embedding-vi | 3.4 | 3 | 3 | 9 |
| keyword | 0.1 | 0 | 29 | 1 |
| modernbert | 1.4 | 1 | 11 | 5 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2640 | 0 | 0.0 | – |
| embedding | 2640 | 1752 | 18.2 | 0.010 |
| embedding-vi | 2640 | 1656 | 11.4 | 0.007 |
| keyword | 2640 | 1752 | 0.4 | 0.000 |
| modernbert | 2640 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
