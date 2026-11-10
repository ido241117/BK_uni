/** Phạm vi môn của một khối yêu cầu. */
export enum CourseGroupScope {
  /** Danh sách môn cố định do nhóm khai báo. */
  LISTED = 'listed',
  /** Mọi môn trong danh mục (tự chọn tự do), không cần khai báo thành viên. */
  ANY = 'any',
}
