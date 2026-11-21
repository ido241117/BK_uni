/** One interest a student can pick on the Clingo tab, with the courses of their program that carry it. */
export interface InterestTag {
  tag: string;
  courses: string[];
}

/**
 * Tags of `pipeline/planner/data/course-tags.json` (`{ "tags": { name: [course codes] } }`, written by
 * pipeline/tag_classifier/export.py) restricted to the courses of one program. Tags without any course in
 * the program are left out: picking them could not change the plan. Anything malformed counts as no tags.
 */
export function interestTagsFor(file: unknown, programCodes: Set<string>): InterestTag[] {
  const tags = (file as { tags?: unknown } | null)?.tags;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return [];
  return Object.entries(tags as Record<string, unknown>)
    .map(([tag, codes]) => ({
      tag,
      courses: (Array.isArray(codes) ? codes : []).filter((c): c is string => typeof c === 'string' && programCodes.has(c)).sort(),
    }))
    .filter((t) => t.courses.length > 0)
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
