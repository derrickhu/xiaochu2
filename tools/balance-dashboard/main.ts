import { renderOverview } from './views/OverviewView';
import { renderPetsView } from './views/PetTableView';
import { renderStagesView } from './views/StageTableView';
import { renderMobsView } from './views/MobTableView';
import { renderEconomyView } from './views/EconomyView';
import { renderSkillsView } from './views/SkillTableView';
import { renderGlobalsView } from './views/GlobalConstantsView';
import { renderPassivesView } from './views/PassivesView';
import { renderSimulationView } from './views/SimulationView';
import { installHoverTipPortal } from './components/HoverTip';

type TabId =
  | 'overview'
  | 'pets'
  | 'stages'
  | 'mobs'
  | 'economy'
  | 'skills'
  | 'globals'
  | 'passives'
  | 'sim';

interface TabDef {
  id: TabId;
  label: string;
  render: (el: HTMLElement) => void;
}

const TABS: TabDef[] = [
  { id: 'overview', label: '总览', render: renderOverview },
  { id: 'pets', label: '灵宠', render: renderPetsView },
  { id: 'stages', label: '关卡', render: renderStagesView },
  { id: 'mobs', label: '杂怪', render: renderMobsView },
  { id: 'economy', label: '经济', render: renderEconomyView },
  { id: 'skills', label: '技能', render: renderSkillsView },
  { id: 'globals', label: '全局', render: renderGlobalsView },
  { id: 'passives', label: '被动', render: renderPassivesView },
  { id: 'sim', label: '模拟', render: renderSimulationView },
];

function renderMeta(): void {
  const meta = document.getElementById('meta');
  if (!meta) return;
  const now = new Date().toLocaleString('zh-CN');
  meta.innerHTML = `构建预览 · ${now}<br>HMR 保存 balance 后刷新即更新`;
}

function mountTabs(onSelect: (id: TabId) => void, active: TabId): void {
  const nav = document.getElementById('tabs');
  if (!nav) return;
  nav.innerHTML = '';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tab${tab.id === active ? ' active' : ''}`;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => onSelect(tab.id));
    nav.appendChild(btn);
  }
}

function showTab(id: TabId): void {
  const content = document.getElementById('content');
  if (!content) return;
  content.innerHTML = '';
  const tab = TABS.find((t) => t.id === id);
  tab?.render(content);
  mountTabs(showTab, id);
  history.replaceState(null, '', `#${id}`);
}

const initial = (location.hash.replace('#', '') as TabId) || 'overview';
installHoverTipPortal();
showTab(TABS.some((t) => t.id === initial) ? initial : 'overview');
renderMeta();
