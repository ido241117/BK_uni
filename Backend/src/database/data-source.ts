import 'dotenv/config';
import { DataSource } from 'typeorm';
import { entities } from './entities';
import { InitialAuth1700000000000 } from './migrations/1700000000000-initial-auth';
import { EducationSchema1794213759571 } from './migrations/1794213759571-education-schema';
import { SnakeCaseAndCascade1794300000000 } from './migrations/1794300000000-snake-case-and-cascade';
import { ElectivePoolsAndGroupCredits1794400000000 } from './migrations/1794400000000-elective-pools-and-group-credits';
import { CourseCatalogFields1794500000000 } from './migrations/1794500000000-course-catalog-fields';
import { CourseCategories1794600000000 } from './migrations/1794600000000-course-categories';
import { CurriculumSpecializations1794700000000 } from './migrations/1794700000000-curriculum-specializations';
import { PriorCorequisiteRelations1794800000000 } from './migrations/1794800000000-prior-corequisite-relations';
import { DropCourseStandardSemester1794900000000 } from './migrations/1794900000000-drop-course-standard-semester';
import { MultipleSpecializationGroups1795000000000 } from './migrations/1795000000000-multiple-specialization-groups';
import { Advisor1795100000000 } from './migrations/1795100000000-advisor';
import { CourseOutlines1795200000000 } from './migrations/1795200000000-course-outlines';
import { getDatabaseOptions } from './database-options';

export default new DataSource({
  ...getDatabaseOptions(process.env),
  entities,
  migrations: [
    InitialAuth1700000000000,
    EducationSchema1794213759571,
    SnakeCaseAndCascade1794300000000,
    ElectivePoolsAndGroupCredits1794400000000,
    CourseCatalogFields1794500000000,
    CourseCategories1794600000000,
    CurriculumSpecializations1794700000000,
    PriorCorequisiteRelations1794800000000,
    DropCourseStandardSemester1794900000000,
    MultipleSpecializationGroups1795000000000,
    Advisor1795100000000,
    CourseOutlines1795200000000,
  ],
});
