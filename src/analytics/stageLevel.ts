import { STAGES } from '@/balance/stages';

/** 关卡序号（1 起），供 level_start/clear/fail 的 level_id 字段 */
export function stageLevelId(stageId: string): number {
  const idx = STAGES.findIndex((s) => s.id === stageId);
  return idx >= 0 ? idx + 1 : 0;
}
