/** 格式化工具 */

export function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('zh-CN');
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtProfile(obj: Record<string, number> | undefined): string {
  if (!obj || Object.keys(obj).length === 0) return '—';
  return Object.entries(obj).map(([k, v]) => `${k}×${v}`).join(' ');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
