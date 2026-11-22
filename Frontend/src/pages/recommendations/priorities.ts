import type { PlanPriorityId } from '@/types';

export interface PriorityItem {
    id: PlanPriorityId;
    on: boolean;
}

/** Sprint 11 (Q15c, 22/11): các mục sinh viên tự sắp; mục trên quan trọng hơn. Mặc định giống thứ tự cũ. */
export const PRIORITY_LABEL: Record<PlanPriorityId, string> = {
    S1: 'Ra trường sớm',
    S6: 'Theo kế hoạch giảng dạy',
    S4: 'Môn mình chọn trước',
    S5: 'Các kỳ đều tải',
    S10: 'Hạn chế học hè',
    OH: 'Theo lịch sử mở lớp',
    S3: 'Giữ gần mốc đã lưu',
};

export const DEFAULT_PRIORITIES: PriorityItem[] = [
    { id: 'S1', on: true }, { id: 'S6', on: true }, { id: 'S4', on: true }, { id: 'OH', on: true },
    { id: 'S5', on: false }, { id: 'S3', on: true }, { id: 'S10', on: false },
];
