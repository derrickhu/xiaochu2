import { describe, expect, it } from 'vitest';
import { compareCodexPetOrder } from '../codexSort';

function row(
  id: string,
  opts: { owned?: boolean; star?: number; level?: number; rarity?: number },
) {
  return {
    id,
    owned: opts.owned ?? true,
    star: opts.star ?? 1,
    level: opts.level ?? 1,
    rarity: opts.rarity ?? 1,
  };
}

describe('compareCodexPetOrder', () => {
  it('已有排未获前面，星级/等级/稀有度从高到低', () => {
    const list = [
      row('r1', { star: 1, level: 1, rarity: 1 }),
      row('sr30', { star: 2, level: 30, rarity: 2 }),
      row('ssr', { star: 1, level: 1, rarity: 3 }),
      row('locked-ur', { owned: false, rarity: 4 }),
    ];
    list.sort(compareCodexPetOrder);
    expect(list.map((p) => p.id)).toEqual(['sr30', 'ssr', 'r1', 'locked-ur']);
  });
});
