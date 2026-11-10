export enum StudentCourseStatus {
  NOT_STARTED = 'not-started',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  /** Đã học nhưng không đạt: không thỏa tiên quyết (TQ) nhưng vẫn thỏa học trước (HT). */
  FAILED = 'failed',
}
