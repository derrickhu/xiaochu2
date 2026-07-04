import { escapeHtml } from '../lib/format';

/** 表格内截断文案 + 鼠标悬浮完整内容（fixed 层，不被 table-wrap 裁剪） */
export function hoverTip(tip: string, bodyHtml: string): string {
  return `<span class="hover-tip" data-tip="${escapeHtml(tip)}">${bodyHtml}</span>`;
}

let installed = false;
let layer: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function ensureLayer(): HTMLDivElement {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'hover-tip-layer';
  layer.className = 'hover-tip-layer';
  layer.hidden = true;
  document.body.appendChild(layer);
  return layer;
}

function hideTip(): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (layer) layer.hidden = true;
}

function showTip(text: string, x: number, y: number): void {
  const el = ensureLayer();
  el.textContent = text;
  el.hidden = false;

  const pad = 12;
  const rect = el.getBoundingClientRect();
  let left = x + 14;
  let top = y + 16;
  if (left + rect.width + pad > window.innerWidth) {
    left = Math.max(pad, window.innerWidth - rect.width - pad);
  }
  if (top + rect.height + pad > window.innerHeight) {
    top = Math.max(pad, y - rect.height - 12);
  }
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

export function installHoverTipPortal(): void {
  if (installed) return;
  installed = true;

  document.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement | null)?.closest?.('.hover-tip') as HTMLElement | null;
    if (!target) return;
    const tip = target.getAttribute('data-tip');
    if (!tip) return;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    showTip(tip, e.clientX, e.clientY);
  });

  document.addEventListener('mousemove', (e) => {
    const target = (e.target as HTMLElement | null)?.closest?.('.hover-tip') as HTMLElement | null;
    if (!target || !layer || layer.hidden) return;
    const tip = target.getAttribute('data-tip');
    if (!tip) return;
    showTip(tip, e.clientX, e.clientY);
  });

  document.addEventListener('mouseout', (e) => {
    const related = e.relatedTarget as HTMLElement | null;
    const from = (e.target as HTMLElement | null)?.closest?.('.hover-tip');
    if (from && related && from.contains(related)) return;
    if ((e.target as HTMLElement | null)?.closest?.('.hover-tip')) {
      hideTimer = setTimeout(hideTip, 80);
    }
  });

  document.addEventListener('scroll', hideTip, true);
}
