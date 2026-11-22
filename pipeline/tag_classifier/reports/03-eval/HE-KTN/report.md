# Evaluation: HE-KTN

25 courses scored, models: bge-m3-zeroshot, embedding, embedding-vi, keyword, modernbert. No human labels: every number below comes from the faculty's own course lists or from comparing scorers with each other.

## Specialization recall

Each specialization's course list (written by the faculty) is a partial answer key. Recall = share of listed courses that got the specialization tag. Precision is a lower bound: a course outside the list may still deserve the tag.

![Specialization recall](figures/01-specialization-recall.png)

| Model | Recall | Precision (lb) | KTN | KTNL |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.30 | 1.00 | 0.60 | 0.00 |
| embedding | 0.50 | 0.74 | 0.70 | 0.30 |
| embedding-vi | 0.50 | 0.71 | 0.60 | 0.40 |
| keyword | 0.70 | 0.78 | 0.70 | – |
| modernbert | 0.50 | 0.83 | 0.50 | – |

## Agreement between models

![Agreement](figures/02-kappa.png)

| Pair | Cohen's kappa |
|---|---|
| bge-m3-zeroshot vs embedding | 0.41 |
| bge-m3-zeroshot vs embedding-vi | 0.37 |
| bge-m3-zeroshot vs keyword | 0.47 |
| bge-m3-zeroshot vs modernbert | 0.72 |
| embedding vs embedding-vi | 0.73 |
| embedding vs keyword | 0.26 |
| embedding vs modernbert | 0.48 |
| embedding-vi vs keyword | 0.23 |
| embedding-vi vs modernbert | 0.46 |
| keyword vs modernbert | 0.37 |

Krippendorff's alpha per tag across models: mean 0.38; 4 of 22 tags reach 0.667 (tags every model left out of every course have no defined alpha).

## Section consistency

Tags from the summary alone vs tags from the other sections (Jaccard, 1 = same tags). Low agreement flags syllabi whose sections disagree; copied summaries (the provider's error) are counted apart.

| Model | Jaccard | Courses | Copied summaries: Jaccard | Courses |
|---|---|---|---|---|
| bge-m3-zeroshot | 0.77 | 25 | – | 0 |
| embedding | 0.56 | 25 | – | 0 |
| embedding-vi | 0.49 | 25 | – | 0 |
| keyword | 0.66 | 25 | – | 0 |
| modernbert | 0.73 | 25 | – | 0 |

## Language stability

| Same scorer, English vs Vietnamese text | Jaccard of course tags |
|---|---|
| embedding vs embedding-vi | 0.54 |

## Tags per course

![Tags per course](figures/03-tags-per-course.png)

| Model | Mean | Median | Courses with no tag | Max |
|---|---|---|---|---|
| bge-m3-zeroshot | 1.8 | 1 | 7 | 7 |
| embedding | 4.4 | 4 | 6 | 11 |
| embedding-vi | 5.2 | 4 | 1 | 11 |
| keyword | 1.0 | 1 | 12 | 5 |
| modernbert | 1.9 | 1 | 11 | 7 |

## Run time

![Run time](figures/04-runtime.png)

| Model | Pairs | Scored this run | Seconds | Seconds per pair |
|---|---|---|---|---|
| bge-m3-zeroshot | 2200 | 0 | 0.0 | – |
| embedding | 2200 | 2116 | 39.5 | 0.019 |
| embedding-vi | 2200 | 2060 | 107.2 | 0.052 |
| keyword | 2000 | 1956 | 1.2 | 0.001 |
| modernbert | 2000 | 0 | 0.0 | – |

Times are from the machine that ran `classify` (this laptop's CPU unless noted); pairs already in the cache cost nothing and are not timed.
