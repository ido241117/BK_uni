/** One interest a student can pick on the Clingo tab, with the courses of their program that carry it. */
export interface InterestTag {
  tag: string;
  courses: string[];
}

/**
 * Tags of `pipeline/planner/data/course-tags.json` (written by pipeline/tag_classifier/export.py) for one
 * program, restricted to its courses. The file holds one list per program family (`by_family`, all cohorts
 * of a program) and `families` {curriculum code: family}; the student's family list is used, else the
 * merged `tags` list. Tags without any course in the program are left out: picking them could not change
 * the plan. Anything malformed counts as no tags.
 */
export function interestTagsFor(file: unknown, programCodes: Set<string>, curriculumCode?: string): InterestTag[] {
  const data = (file ?? {}) as { tags?: unknown; by_family?: Record<string, unknown>; families?: Record<string, string> };
  const family = curriculumCode ? data.families?.[curriculumCode] : undefined;
  const tags = (family && data.by_family?.[family]) || data.tags;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return [];
  return Object.entries(tags as Record<string, unknown>)
    .map(([tag, codes]) => ({
      tag,
      courses: (Array.isArray(codes) ? codes : []).filter((c): c is string => typeof c === 'string' && programCodes.has(c)).sort(),
    }))
    .filter((t) => t.courses.length > 0)
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
