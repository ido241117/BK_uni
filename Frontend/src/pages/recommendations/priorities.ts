import type { PlanPriorityId } from '@/types';
import { trLive } from '@/i18n/live';

export interface PriorityItem {
    id: PlanPriorityId;
    on: boolean;
}

/**
 * Giai đoạn 12 (12.3, W5, W12; 23/11): sinh viên chỉ thấy và sắp 3 mục; mục trên quan trọng hơn, tắt được.
 * Học phí và sở thích để sau (hiện mờ). Các mục khác của bộ giải giữ bên trong theo thứ tự cố định `HIDDEN_ORDER`.
 */
export const PRIORITY_LABEL: Partial<Record<PlanPriorityId, string>> = trLive({
    S1: 'Ra trường sớm nhất',
    S8: 'Mỗi kỳ chính 15–18 TC',
    S2: 'Không học dư môn tự chọn',
});

export const VISIBLE_PRIORITIES: PlanPriorityId[] = ['S1', 'S8', 'S2'];

/** Mục không hiện trên trang, gửi sau 3 mục của sinh viên (thứ tự mặc định cũ, bỏ S5 và S10 vì mặc định tắt). */
export const HIDDEN_ORDER: PlanPriorityId[] = ['S6', 'S4', 'OH', 'S3'];

/** Gợi ý mặc định (W12, chưa chốt): ra trường sớm > 15–18 TC > không học dư, cả 3 bật. */
export const DEFAULT_PRIORITIES: PriorityItem[] = VISIBLE_PRIORITIES.map(id => ({ id, on: true }));

/** Payload cho bộ giải: `order` = mục bật theo thứ tự sinh viên rồi mục ẩn; `disabled` = S2/S8 bị tắt. */
export const priorityPayload = (items: PriorityItem[]) => ({
    order: [...items.filter(p => p.on).map(p => p.id), ...HIDDEN_ORDER],
    disabled: items.filter(p => !p.on && (p.id === 'S2' || p.id === 'S8')).map(p => p.id),
});

/** Cài đặt cũ (trước giai đoạn 12) có mục khác: về mặc định. */
export const normalizePriorities = (raw: unknown): PriorityItem[] => {
    if (!Array.isArray(raw)) return DEFAULT_PRIORITIES;
    const items = raw.filter((p): p is PriorityItem => !!p && VISIBLE_PRIORITIES.includes((p as PriorityItem).id));
    return items.length === VISIBLE_PRIORITIES.length ? items : DEFAULT_PRIORITIES;
};
