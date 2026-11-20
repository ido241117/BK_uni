# End-to-End Functional Requirements

## 1. Purpose and System Boundary

The system is an academic planning and replanning decision-support service for one supported degree program. It reads university data, evaluates curriculum rules, generates several representative degree paths, supports Student what-if decisions, and replans future semesters when academic results or university offerings change.

The system generates paths from the official curriculum rather than from a manually prepared planning guide. A planning guide or recommended-semester field may be used only as an external evaluation baseline and shall not influence path generation or ranking. The system does not perform official course-registration transactions, generate the university-wide timetable, or modify authoritative academic records.

### End-to-end input flow

```text
University or Mock Data Provider
  -> curriculum snapshot
  -> student academic snapshot
  -> current enrollment snapshot
  -> course-offering and section-schedule snapshot
  -> normalize and validate
  -> rule and constraint model
  -> candidate generation and representative selection
  -> explanation and Student planning interface
```

### End-to-end outputs

- Current progress, remaining requirements, and course eligibility.
- Up to a configured number of representative full degree paths.
- The next registration semester derived from each path.
- Assumptions, feasibility level, metrics, warnings, and explanations.
- A replanned future after a Student decision or source-data change.
- Immutable plan versions and a comparison between versions.

## 2. FR-1. Accounts and Access

| ID | Role | Requirement |
|---|---|---|
| FR-1.1 | User / System | The prototype shall allow synthetic users to create an account using an email address and password; newly registered accounts shall receive the Student role. In a real university integration, a Student account shall be linked to an authoritative student identity before academic data is exposed. |
| FR-1.2 | User | A user shall be able to sign in to and sign out of their account. |
| FR-1.3 | System | The system shall allow only authenticated users to access protected functions and shall restrict access according to role and data ownership. |
| FR-1.4 | System | The system shall grant Admin or Advisor privileges only to authorized accounts; users shall not be able to elevate their own privileges. |

## 3. FR-2. University Data Acquisition and Quality

| ID | Role | Requirement |
|---|---|---|
| FR-2.1 | System | The system shall obtain a versioned curriculum snapshot, Student academic snapshot, current enrollment snapshot, and course-offering snapshot through a University Data Provider interface. The data contract shall identify the program-start term, current academic term, target registration term, and the term of each course attempt or enrollment. |
| FR-2.2 | System | When available, the system shall obtain section meeting times and related registration availability through the same provider boundary for conflict checking. |
| FR-2.3 | System | The prototype shall support a Mock University Data Provider that implements the same canonical data contract when a real university API or data warehouse is unavailable. |
| FR-2.4 | System | The system shall treat provider data as read-only, normalize provider-specific fields, and retain the source, version, retrieval time, and freshness of every snapshot. |
| FR-2.5 | System | The system shall validate schemas, entity references, curriculum credit reconciliation, rule consistency, prerequisite cycles, Student-state consistency, and snapshot compatibility before planning. |
| FR-2.6 | System | The system shall expose validation findings as warnings or blocking errors; a blocking error shall prevent a result from being presented as an academically valid plan. |
| FR-2.7 | System | The system shall support a configured refresh mechanism that detects newly published offering or section snapshots, identifies affected active plans, marks them stale, and notifies the affected Student that replanning is available. |

## 4. FR-3. Student Academic State and Curriculum Model

| ID | Role | Requirement |
|---|---|---|
| FR-3.1 | Student | A Student shall be able to view their profile, applicable curriculum version, completed credits, current enrollment, and remaining curriculum requirements. |
| FR-3.2 | Student | A Student shall be able to view, search, and filter courses, compulsory requirements, elective groups, and graduation conditions in the applicable curriculum. |
| FR-3.3 | System | The system shall distinguish at least `not_started`, `passed`, `failed`, `in_progress`, and `enrolled`, and shall distinguish official facts from `selected`, `self_reported`, and `plan_assigned` planning data. |
| FR-3.4 | System | The curriculum model shall represent compulsory courses, elective and free-elective thresholds, total credits, prerequisites, previous-course requirements, corequisites, curriculum recommended-before relationships such as `KN`, compound AND/OR rules, and mutually exclusive credit allocation. The supported curriculum shall explicitly define whether each relationship is a hard constraint or a soft planning preference. |
| FR-3.5 | System | The rule model shall support verified conditions such as accumulated-credit gates, academic standing, year or level, GPA-dependent credit limits, language requirements, internship conditions, and capstone conditions when present in authoritative data. |
| FR-3.6 | System | The system shall model failed attempts and retakes according to configured rules, shall not count earned credit more than once, and shall not recommend retaking a passed course unless an explicit repeat rule permits it. |
| FR-3.7 | System | An in-progress course shall not be treated as passed in the current factual state. For future planning, any conditional assumed-pass branch shall be labeled as an assumption and shall be re-evaluated when the official result arrives. |

## 5. FR-4. Eligibility and Requirement Analysis

| ID | Role | Requirement |
|---|---|---|
| FR-4.1 | Student | A Student shall be able to request an analysis using their current academic state and applicable curriculum version. |
| FR-4.2 | System | The system shall determine whether each uncompleted course is currently eligible and shall identify the conditions supporting or preventing eligibility. |
| FR-4.3 | System | The system shall identify incomplete compulsory courses, elective-group thresholds, total-credit requirements, and other graduation conditions. |
| FR-4.4 | Student / System | A Student shall be able to submit a proposed set of courses, and the system shall validate eligibility, credit load, duplicate credit, offering availability, and timetable conflicts when the required data is available. |
| FR-4.5 | System | The system shall save each analysis together with the curriculum, Student, enrollment, offering, schedule, and rule versions that informed it. |

## 6. FR-5. Full Degree-Path Generation and Selection

| ID | Role | Requirement |
|---|---|---|
| FR-5.1 | Student | A Student shall be able to request full degree paths from the current academic state through curriculum completion. |
| FR-5.2 | System | The system shall display a complete eight-semester timeline from program start: completed semesters as fixed history, the current semester as in-progress or enrolled, and only the remaining semesters as generated decisions. No summer semester shall be assumed unless explicitly configured. |
| FR-5.3 | System | Path generation shall use curriculum requirements, Student state, credit policies, academic relationships, and available offering data without using a planning guide, recommended semester, or course-code order as an academic preference. |
| FR-5.4 | System | Every academically feasible path shall satisfy all encoded hard constraints across all semesters. Every planned course shall satisfy an unmet requirement or be clearly marked as an extra course allowed by policy. |
| FR-5.5 | System | The system shall distinguish academic feasibility from operational feasibility. A path using unknown future offerings shall be labeled feasible under stated assumptions; only terms supported by confirmed offering and compatible-section data may be labeled operationally confirmed. |
| FR-5.6 | System | The system shall return no more than a configured top-k number of representative paths, normally three to five, and shall state whether other candidates were found and whether the exact total number of feasible paths was computed. |
| FR-5.7 | System | Near-duplicate candidates shall be collapsed using a versioned diversity measure and threshold based on dimensions such as elective set, semester placement, credit-load distribution, and completion semester. |
| FR-5.8 | System | Representative paths shall be selected by an explicit, versioned policy whose criteria, priority order, and input provenance are recorded. Supported criteria may include timely completion, stability, balanced credit load, prerequisite-unlocking value, and Student-declared elective interests. Difficulty or success predictions shall not be used without an approved dataset and separately validated model. |
| FR-5.9 | System | If candidates remain equivalent under every supported criterion, the system may use course code or another stable identifier only as a deterministic final tie-break and shall not describe that tie-break as evidence of path quality. |
| FR-5.10 | System | If no path can complete the curriculum by semester eight during initial generation, the system shall report that result, solve separately for the earliest feasible later completion, and display semesters nine and later as an explicit extension of the standard horizon. |

## 7. FR-6. Personal Planning and What-If Decisions

| ID | Role | Requirement |
|---|---|---|
| FR-6.1 | Student | A Student shall be able to inspect the next registration semester, estimated credit load, assumptions, and relevant reasons within each displayed full path. |
| FR-6.2 | Student | A Student shall be able to select one displayed path as their active personal plan. |
| FR-6.3 | Student | A Student shall be able to create a next-semester draft by adding or removing courses even when the draft does not match any generated path. |
| FR-6.4 | Student / System | Before a draft is confirmed as planning input, the system shall present its courses, assumptions, warnings, eligibility violations, offering limitations, and known timetable conflicts for Student review. |
| FR-6.5 | System | For a valid what-if request, the system shall lock the proposed registration semester as a Student assumption and regenerate representative paths for the later semesters. A recommendation, active plan, or draft shall not be represented as an official registration transaction. |
| FR-6.6 | Student | A Student shall be able to view and change supported planning preferences, such as elective interests or preferred credit range, and the system shall record which declared preferences influenced path selection. |

## 8. FR-7. Course Offerings, Timetables, and Replanning

| ID | Role | Requirement |
|---|---|---|
| FR-7.1 | System | The system shall distinguish available offering states such as `unknown`, `planned`, `confirmed`, `at_risk`, `cancelled`, `full`, and `not_offered`, and shall display the snapshot or publication stage supporting each state. |
| FR-7.2 | System | During an early registration stage, the system may use unknown future offerings only as visible assumptions. When section schedules become available, the system shall detect course and section conflicts without generating the university timetable itself. |
| FR-7.3 | Student / System | A Student shall be able to request the newest snapshots. The system shall compare them with the versions used by the active plan, mark the plan stale when a material input changed, identify the triggering changes, and offer a replan action. |
| FR-7.4 | System | Replanning shall support changes in official pass or fail results, current enrollment, Student decisions, course offerings, and section schedules. |
| FR-7.5 | System | Replanning shall preserve completed history and confirmed current facts, retain accepted future decisions that remain valid, and minimize unnecessary changes according to the versioned stability policy. |
| FR-7.6 | System | When a course becomes cancelled, full, unavailable, or impossible to schedule, the system shall seek a valid replacement or later placement and shall state whether completion time or other material outcomes changed. |
| FR-7.7 | System | If no valid continuation exists, the system shall not bypass hard academic rules. It shall return an infeasibility explanation and may show an earliest-feasible completion or minimum-repair scenario, which shall be labeled as a repair scenario rather than a feasible current path. |

## 9. FR-8. Explanations and Plan History

| ID | Role | Requirement |
|---|---|---|
| FR-8.1 | System | The system shall explain why a course is eligible or ineligible, which requirement it satisfies, which later requirements it enables, and why it appears in a particular semester when supported by rule or policy evidence. |
| FR-8.2 | System | The system shall explain why each displayed path was selected as a representative, expose its measurable trade-offs, and clearly state when a deterministic tie-break selected among policy-equivalent candidates. |
| FR-8.3 | System | When no feasible plan exists, the system shall identify relevant conflicting conditions and explain any earliest-feasible or minimum-repair result. |
| FR-8.4 | System | Explanations shall be generated from structured rule, constraint, policy, and solver evidence. An optional language model may rephrase that evidence but shall not create academic facts or solver conclusions. |
| FR-8.5 | System | The system shall save generated and confirmed plans as immutable versions, identify one active version, and retain the input snapshots, policy version, assumptions, metrics, and warnings used to create each version. |
| FR-8.6 | Student | A Student shall be able to review plan history and compare two versions by semester assignment, credit load, electives, completion outcome, and triggering input change. |
| FR-8.7 | System | The system shall clearly distinguish official university facts, system recommendations, Student-confirmed decisions, self-reported data, and unresolved assumptions in storage and presentation. |

## 10. FR-9. Administration and Advisor Support

| ID | Role | Requirement |
|---|---|---|
| FR-9.1 | Admin | An Admin shall be able to inspect synchronization status, snapshot freshness, validation findings, unresolved mappings, and curriculum reconciliation errors without modifying authoritative university records. |
| FR-9.2 | Admin | In the prototype, an Admin shall be able to change mock offering or section states to demonstrate stale-plan detection and replanning; the system shall clearly label these changes as simulated data. |
| FR-9.3 | Admin | An Admin shall be able to define, activate, and version the supported path-selection policy, including the permitted criteria and their priority order; the system shall retain the policy version used by every generated plan. |
| FR-9.4 | Advisor / System | Where the Advisor role is enabled, an authorized Advisor shall be able to view an assigned Student's progress, active plan, warnings, and explanations and run a non-binding what-if scenario without modifying official records or the Student's active plan. |

## 11. Explicit Functional Exclusions

The current system shall not:

- Send add, drop, or registration commands to the official registration system.
- Replace the university's official registration system.
- Create the university-wide class, room, lecturer, or timetable schedule.
- Predict grades, course difficulty, or probability of passing without an approved dataset and separately validated model.
- Optimize course allocation for the entire Student population at once.
- Use a manually prepared planning guide or recommended-semester assignment as planning input.
- Silently correct inconsistent source data or present mock data as official data.

