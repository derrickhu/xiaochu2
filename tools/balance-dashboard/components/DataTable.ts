import { escapeHtml } from '../lib/format';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => string;
  sortValue?: (row: T) => string | number;
}

export interface DataTableOptions<T> {
  columns: Column<T>[];
  rows: readonly T[];
  searchText?: (row: T) => string;
  rowDetail?: (row: T) => string;
}

export function mountDataTable<T>(
  container: HTMLElement,
  opts: DataTableOptions<T>,
): { refresh: (rows: readonly T[]) => void } {
  let sortKey = '';
  let sortAsc = true;
  let filter = '';
  let data = [...opts.rows];

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '搜索…';
  search.addEventListener('input', () => {
    filter = search.value.trim().toLowerCase();
    renderBody();
  });
  toolbar.appendChild(search);
  container.appendChild(toolbar);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'data';
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  wrap.appendChild(table);
  container.appendChild(wrap);

  function renderHead(): void {
    thead.innerHTML = '';
    const tr = document.createElement('tr');
    for (const col of opts.columns) {
      const th = document.createElement('th');
      const arrow = sortKey === col.key ? (sortAsc ? ' ▲' : ' ▼') : '';
      th.textContent = col.label + arrow;
      th.addEventListener('click', () => {
        if (sortKey === col.key) sortAsc = !sortAsc;
        else { sortKey = col.key; sortAsc = true; }
        renderHead();
        renderBody();
      });
      tr.appendChild(th);
    }
    thead.appendChild(tr);
  }

  function filteredRows(): T[] {
    let rows = data;
    if (filter && opts.searchText) {
      rows = rows.filter((r) => opts.searchText!(r).toLowerCase().includes(filter));
    }
    if (sortKey) {
      const col = opts.columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        rows = [...rows].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          const cmp = va < vb ? -1 : va > vb ? 1 : 0;
          return sortAsc ? cmp : -cmp;
        });
      }
    }
    return rows;
  }

  function renderBody(): void {
    tbody.innerHTML = '';
    for (const row of filteredRows()) {
      const tr = document.createElement('tr');
      for (const col of opts.columns) {
        const td = document.createElement('td');
        td.innerHTML = col.render(row);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
      if (opts.rowDetail) {
        const detail = opts.rowDetail(row);
        if (detail) {
          const trd = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = opts.columns.length;
          td.innerHTML = `<details class="row-detail"><summary>展开详情</summary><div class="pre-block">${escapeHtml(detail)}</div></details>`;
          trd.appendChild(td);
          tbody.appendChild(trd);
        }
      }
    }
  }

  renderHead();
  renderBody();

  return {
    refresh(rows: readonly T[]) {
      data = [...rows];
      renderBody();
    },
  };
}
