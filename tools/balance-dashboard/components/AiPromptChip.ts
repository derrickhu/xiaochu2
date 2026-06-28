import { copyText, escapeHtml } from '../lib/format';

export function aiPromptChip(source: string, field: string, current: string, hint?: string): string {
  const id = `prompt-${Math.random().toString(36).slice(2, 9)}`;
  const prompt = `[balance] ${source}:${field} | 当前 ${current}${hint ? ` | ${hint}` : ''} → 目标值 | 原因：`;
  queueMicrotask(() => {
    const btn = document.getElementById(id);
    btn?.addEventListener('click', async () => {
      const ok = await copyText(prompt);
      if (ok && btn) {
        btn.textContent = '已复制';
        btn.classList.add('ok');
        setTimeout(() => {
          btn.textContent = 'AI';
          btn.classList.remove('ok');
        }, 1500);
      }
    });
  });
  return `<button type="button" class="btn-copy" id="${id}" title="${escapeHtml(prompt)}">AI</button>`;
}

export function panelTitle(title: string, subtitle?: string): string {
  return subtitle
    ? `<h2>${escapeHtml(title)}</h2><p class="sub">${escapeHtml(subtitle)}</p>`
    : `<h2>${escapeHtml(title)}</h2>`;
}
