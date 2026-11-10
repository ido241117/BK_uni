import { User } from '../user/entities/user.entity';
import { AdvisorSession } from '../advisor/entities/advisor-session.entity';
import { AdvisorStep } from '../advisor/entities/advisor-step.entity';
import { CourseOutline } from '../outline/entities/course-outline.entity';
import { CourseOutlineImport } from '../outline/entities/course-outline-import.entity';
import { CourseOutlinePrerequisite } from '../outline/entities/course-outline-prerequisite.entity';
import { AuthSession } from '../auth/entities/auth-session.entity';
import { Course } from '../course/entities/course.entity';
import { CourseOpenedSemester } from '../course/entities/course-opened-semester.entity';
import { Curriculum } from '../curriculum/entities/curriculum.entity';
import { CurriculumCourse } from '../curriculum/entities/curriculum-course.entity';
import { CourseCategory } from '../curriculum/entities/course-category.entity';
import { CourseCategoryMember } from '../curriculum/entities/course-category-member.entity';
import { CourseGroup } from '../curriculum/entities/course-group.entity';
import { CourseGroupMember } from '../curriculum/entities/course-group-member.entity';
import { CourseRelation } from '../curriculum/entities/course-relation.entity';
import { CurriculumRegulation } from '../curriculum/entities/curriculum-regulation.entity';
import { CurriculumSpecialization } from '../curriculum/entities/curriculum-specialization.entity';
import { StudentProfile } from '../student/entities/student-profile.entity';
import { StudentCourse } from '../student/entities/student-course.entity';
import { StudentPlanCourse } from '../student/entities/student-plan-course.entity';
import { StudentRegulationStatusEntity } from '../student/entities/student-regulation-status.entity';

export const entities = [
  User, AuthSession, Course, CourseOpenedSemester, Curriculum, CurriculumCourse,
  CourseGroup, CourseGroupMember, CourseCategory, CourseCategoryMember, CourseRelation, CurriculumRegulation,
  CurriculumSpecialization, StudentProfile, StudentCourse, StudentPlanCourse, StudentRegulationStatusEntity,
  AdvisorSession, AdvisorStep, CourseOutline, CourseOutlinePrerequisite, CourseOutlineImport,
];
