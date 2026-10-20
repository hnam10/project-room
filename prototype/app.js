// Project Room — UI prototype. All data lives in this browser (localStorage).
// The "AI" here is a local mock adapter (see extractActionItems / detectInsight); it calls no provider.

const STORAGE_KEY = 'project-room-v1';
const CURRENT_USER = 'alex';

const MEMBERS = {
  alex: { name: 'Alex', color: '#5b4ff0' },
  jamie: { name: 'Jamie', color: '#0e9f6e' },
  taylor: { name: 'Taylor', color: '#e07a1f' },
  morgan: { name: 'Morgan', color: '#d6409f' }
};

const STATUSES = [
  { id: 'todo', label: 'To Do', color: '#9aa1b0' },
  { id: 'progress', label: 'In Progress', color: '#2f80ed' },
  { id: 'review', label: 'Review', color: '#e0a100' },
  { id: 'done', label: 'Done', color: '#16a36a' }
];
const PRIORITIES = [
  { id: 'high', label: 'High', color: '#dc4b4b' },
  { id: 'medium', label: 'Medium', color: '#e0a100' },
  { id: 'low', label: 'Low', color: '#9aa1b0' }
];
const LABELS = ['feature', 'frontend', 'backend', 'design', 'docs', 'research', 'test', 'devops'];
const CHANNELS = ['general', 'design', 'development', 'research', 'random'];
const THEMES = ['Product', 'Engagement', 'Platform'];
const PAPER = { Product: '#fdf1c4', Engagement: '#f6def8', Platform: '#dcefff' };

const ICONS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  tasks: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/>',
  filter: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 17v4"/><path d="M17 19h4"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  popout: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  dockIn: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>'
};

const seed = {
  nextTaskNum: 19,
  tasks: [
    { id: 't12', num: 12, title: 'User authentication flow', label: 'feature', priority: 'high', status: 'todo', assignee: 'jamie', due: '2026-10-22' },
    { id: 't14', num: 14, title: 'Design system setup', label: 'design', priority: 'medium', status: 'todo', assignee: 'taylor', due: '' },
    { id: 't16', num: 16, title: 'Database schema', label: 'backend', priority: 'high', status: 'todo', assignee: 'morgan', due: '2026-10-21' },
    { id: 't18', num: 18, title: 'Landing page UI', label: 'frontend', priority: 'medium', status: 'todo', assignee: '', due: '2026-10-23' },
    { id: 't8', num: 8, title: 'Homepage UI implementation', label: 'frontend', priority: 'high', status: 'progress', assignee: 'alex', due: '2026-10-21' },
    { id: 't11', num: 11, title: 'API integration (OpenAI)', label: 'backend', priority: 'high', status: 'progress', assignee: 'jamie', due: '' },
    { id: 't13', num: 13, title: 'Figma design - main screens', label: 'design', priority: 'medium', status: 'progress', assignee: 'taylor', due: '' },
    { id: 't15', num: 15, title: 'Team logo & branding', label: 'design', priority: 'low', status: 'progress', assignee: 'morgan', due: '' },
    { id: 't6', num: 6, title: 'Project proposal draft', label: 'docs', priority: 'medium', status: 'review', assignee: 'alex', due: '' },
    { id: 't9', num: 9, title: 'Demo video script', label: 'docs', priority: 'low', status: 'review', assignee: 'morgan', due: '' },
    { id: 't17', num: 17, title: 'Testing & bug fixes', label: 'test', priority: 'high', status: 'review', assignee: 'jamie', due: '' },
    { id: 't1', num: 1, title: 'Team ideation session', label: 'research', priority: 'medium', status: 'done', assignee: 'alex', due: '' },
    { id: 't2', num: 2, title: 'Competitor analysis', label: 'research', priority: 'medium', status: 'done', assignee: 'taylor', due: '' },
    { id: 't3', num: 3, title: 'Tech stack decision', label: 'docs', priority: 'high', status: 'done', assignee: 'jamie', due: '' },
    { id: 't4', num: 4, title: 'Project repository setup', label: 'devops', priority: 'medium', status: 'done', assignee: 'morgan', due: '' }
  ],
  messages: [
    { id: 'm1', channel: 'general', author: 'alex', time: '10:14', text: "Let's focus on the core features first. What do you think?" },
    { id: 'm2', channel: 'general', author: 'jamie', time: '10:15', text: "I'll work on the password reset flow." },
    { id: 'm3', channel: 'general', author: 'taylor', time: '10:15', text: 'I can handle the onboarding screens in Figma.' },
    { id: 'm4', channel: 'general', author: 'morgan', time: '10:16', text: "We still haven't decided which database to use, and the demo is due Friday." },
    { id: 'm5', channel: 'general', author: 'alex', time: '10:16', text: '@AI can you create tasks based on our discussion?' },
    { id: 'm6', channel: 'general', author: 'ai', time: '10:16', text: "I've detected the following action items:", actionSetId: 'as1' },
    { id: 'm7', channel: 'design', author: 'taylor', time: '09:40', text: 'Uploaded the first moodboard. Leaning towards a calm, light palette.' },
    { id: 'm8', channel: 'design', author: 'alex', time: '09:52', text: 'Looks great — keep the accent colour for actions only.' },
    { id: 'm9', channel: 'development', author: 'jamie', time: '11:02', text: 'Repo is set up with CI. PRs need one review before merge.' },
    { id: 'm10', channel: 'research', author: 'taylor', time: 'Fri', text: 'Competitor notes are in Files → research/competitors.pdf' },
    { id: 'm11', channel: 'random', author: 'morgan', time: 'Fri', text: 'Pizza order for Saturday night? 🍕' }
  ],
  actionSets: {
    as1: {
      status: 'pending',
      items: [
        { title: 'Implement password reset flow', assignee: 'jamie', priority: 'high', include: true },
        { title: 'Design onboarding screens in Figma', assignee: 'taylor', priority: 'medium', include: true },
        { title: 'Decide which database to use', assignee: '', priority: 'high', include: true }
      ]
    }
  },
  insights: [
    {
      id: 'in1', kind: 'decision', status: 'pending',
      title: 'Database choice is still undecided',
      why: 'Morgan raised it in #general and no decision has been recorded. Task #16 “Database schema” depends on it.',
      quote: "We still haven't decided which database to use, and the demo is due Friday.", cite: 'Morgan · #general · 10:16'
    },
    {
      id: 'in2', kind: 'risk', status: 'pending', taskId: 't18',
      title: 'Landing page UI has no owner',
      why: 'Task #18 is due Friday (Oct 23) and nobody is assigned. Alex and Morgan currently have the lightest load.',
      quote: '', cite: ''
    }
  ],
  decisions: [
    { id: 'd1', title: 'Use Next.js + Supabase for the stack', status: 'decided', by: 'jamie', date: 'Oct 15' },
    { id: 'd2', title: 'Target users: students working on group projects', status: 'decided', by: 'alex', date: 'Oct 14' }
  ],
  ideas: [
    { id: 'i1', title: 'AI-powered study planner', desc: 'Personalized schedule based on goals and deadlines.', theme: 'Product', author: 'alex', votes: 3, voted: false },
    { id: 'i2', title: 'Collaborative note-taking', desc: 'Real-time collaboration with AI summaries.', theme: 'Product', author: 'jamie', votes: 5, voted: false },
    { id: 'i3', title: 'Smart resource recommendation', desc: 'Suggest relevant papers, videos, and tools.', theme: 'Product', author: 'taylor', votes: 4, voted: false },
    { id: 'i4', title: 'Gamification', desc: 'Motivate users with streaks and achievements.', theme: 'Engagement', author: 'morgan', votes: 2, voted: false },
    { id: 'i5', title: 'Cross-platform sync', desc: 'Access your study plan anywhere.', theme: 'Platform', author: 'alex', votes: 1, voted: false }
  ]
};

let state = loadState();
const ui = {
  view: 'board',
  channel: 'general',
  chatTab: 'chat',
  ideaTab: 'ideas',
  ideaFilter: 'all',
  groupBy: 'status',
  assigneeFilter: 'all',
  query: '',
  editingTaskId: null,
  editingActionSetId: null,
  onTaskSaved: null
};

/* ---------- Helpers ---------- */

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...structuredClone(seed), ...JSON.parse(saved) } : structuredClone(seed);
  } catch {
    return structuredClone(seed);
  }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: keep in memory */ }
}

const $ = (id) => document.getElementById(id);

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function avatar(memberId) {
  if (memberId === 'ai') return `<span class="avatar ai">${icon('sparkle')}</span>`;
  const m = MEMBERS[memberId];
  if (!m) return '<span class="avatar empty" title="Unassigned">?</span>';
  return `<span class="avatar" style="--c:${m.color}" title="${esc(m.name)}">${esc(m.name[0])}</span>`;
}

function memberName(id) {
  return MEMBERS[id]?.name || 'Unassigned';
}

function nowTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function shortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toast(text) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = text;
  $('toast-region').appendChild(node);
  setTimeout(() => node.remove(), 3000);
}

function confirmAction(title, text, okLabel = 'Confirm') {
  const dialog = $('confirm-dialog');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = okLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true }));
}

function options(list, selected) {
  return list.map(([value, label]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

const memberOptions = () => [['', 'Unassigned'], ...Object.entries(MEMBERS).map(([id, m]) => [id, m.name])];

/* ---------- Sidebar & header ---------- */

function renderChrome() {
  $('member-stack').innerHTML = Object.keys(MEMBERS).map(avatar).join('');
  $('project-list').innerHTML = `<button class="side-link active"><span class="project-dot" style="background:#2f80ed"></span>Hackathon 2026</button>`;
  $('channel-list').innerHTML = CHANNELS.map((c) => `
    <button class="side-link${c === ui.channel && ui.chatTab === 'chat' ? ' active' : ''}" data-channel="${c}">
      ${icon('hash')}${c}
    </button>`).join('');

  document.querySelectorAll('[data-view]').forEach((el) => el.classList.toggle('active', el.dataset.view === ui.view));
  $('filter-select').innerHTML = options([['all', 'Filter: Everyone'], ...Object.entries(MEMBERS).map(([id, m]) => [id, m.name]), ['', 'Unassigned']], ui.assigneeFilter);
}

function renderProgress() {
  const done = state.tasks.filter((t) => t.status === 'done').length;
  const total = state.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('progress').innerHTML = `
    <small>${done}/${total} tasks</small>
    <div class="progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${pct}%"></div></div>
    <span>${pct}%</span>`;
}

/* ---------- Board ---------- */

function groupColumns() {
  if (ui.groupBy === 'priority') return PRIORITIES;
  if (ui.groupBy === 'assignee') {
    return [...Object.entries(MEMBERS).map(([id, m]) => ({ id, label: m.name, color: m.color })), { id: '', label: 'Unassigned', color: '#c4c8d2' }];
  }
  return STATUSES;
}

function visibleTasks() {
  const q = ui.query.trim().toLowerCase();
  return state.tasks.filter((t) =>
    (ui.assigneeFilter === 'all' || t.assignee === ui.assigneeFilter) &&
    (!q || t.title.toLowerCase().includes(q) || `#${t.num}` === q || t.label.includes(q)));
}

function taskCard(t) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = t.due && t.due < today && t.status !== 'done';
  const marker = t.status === 'done'
    ? `<span class="done-check" title="Done">${icon('check')}</span>`
    : avatar(t.assignee);
  return `
    <article class="task-card${t.fromAI ? ' from-ai' : ''}" draggable="true" tabindex="0" data-task="${t.id}" aria-label="${esc(t.title)}">
      <h3 class="${t.status === 'done' ? 'done-title' : ''}">${esc(t.title)}</h3>
      <div class="task-side">${marker}<span class="task-num">#${t.num}</span></div>
      <div class="task-tags">
        <span class="tag ${t.label}">${esc(t.label)}</span>
        <span class="tag ${t.priority}">${esc(t.priority)}</span>
        ${t.due ? `<span class="task-due${overdue ? ' overdue' : ''}">${overdue ? 'Overdue · ' : ''}${shortDate(t.due)}</span>` : ''}
      </div>
    </article>`;
}

function renderBoard() {
  const tasks = visibleTasks();
  $('board').innerHTML = groupColumns().map((col) => {
    const items = tasks.filter((t) => t[ui.groupBy] === col.id);
    return `
      <section class="column" style="--col:${col.color}" data-column="${esc(col.id)}">
        <header class="column-head"><span class="column-dot"></span>${esc(col.label)}<span class="column-count">${items.length}</span></header>
        <div class="column-body">
          ${items.length ? items.map(taskCard).join('') : `<div class="column-empty">${ui.query ? 'No matching tasks' : 'Drop tasks here'}</div>`}
        </div>
        <button class="add-in-column" data-add-task="${esc(col.id)}">${icon('plus')}Add task</button>
      </section>`;
  }).join('');
  renderProgress();
}

/* ---------- Chat dock ---------- */

function formatMessage(text) {
  return esc(text).replace(/@(AI|team|alex|jamie|taylor|morgan)\b/gi, '<span class="mention">@$1</span>');
}

function actionSetBlock(id) {
  const set = state.actionSets[id];
  if (!set) return '';
  const rows = set.items.map((item) => `
    <div class="action-item${item.include ? '' : ' off'}">
      <span class="check">${icon(item.include ? 'check' : 'x')}</span>
      <span>${esc(item.title)}</span>
      <span class="action-owner">${icon('arrow')}${esc(memberName(item.assignee))}</span>
      <span class="action-prio ${item.priority}">(${esc(item.priority[0].toUpperCase() + item.priority.slice(1))})</span>
    </div>`).join('');
  let footer;
  if (set.status === 'approved') {
    footer = `<span class="action-result approved">${icon('check')}Added ${set.added} task${set.added === 1 ? '' : 's'} to the board</span>`;
  } else if (set.status === 'dismissed') {
    footer = `<span class="action-result dismissed">Dismissed</span>`;
  } else {
    footer = `
      <p class="action-question">Would you like to add these to the board?</p>
      <div class="action-buttons">
        <button class="btn success sm" data-approve-set="${id}">${icon('check')}Add to Board</button>
        <button class="btn sm" data-edit-set="${id}">${icon('pencil')}Edit</button>
        <button class="btn sm" data-dismiss-set="${id}">${icon('x')}Dismiss</button>
      </div>`;
  }
  return `<div class="action-card">${rows}</div>${footer}`;
}

function renderChatTab() {
  const msgs = state.messages.filter((m) => m.channel === ui.channel);
  const list = msgs.map((m) => {
    const author = m.author === 'ai'
      ? `<span class="msg-author ai"><span class="ai-badge">${icon('sparkle')}</span>AI</span>`
      : `<span class="msg-author" style="--c:${MEMBERS[m.author]?.color}">${esc(memberName(m.author))}</span>`;
    const body = m.typing ? '<span class="typing">thinking…</span>' : formatMessage(m.text);
    const extra = m.actionSetId ? `<div class="msg-extra">${actionSetBlock(m.actionSetId)}</div>` : '';
    return `<div class="msg"><time>${esc(m.time)}</time>${author}<span class="msg-text">${body}</span>${extra}</div>`;
  }).join('');
  return `
    <div class="channel-title">${icon('hash')}${esc(ui.channel)} <small>· ${Object.keys(MEMBERS).length} members + AI</small></div>
    <div class="messages">${list || '<div class="empty-state">No messages yet. Say hi to your team.</div>'}</div>`;
}

function renderAssistantTab() {
  const pending = state.insights.filter((i) => i.status === 'pending');
  const kinds = {
    decision: { label: 'Decision needed', icon: 'flag', color: '#a06c00', action: 'Log as open decision' },
    risk: { label: 'Deadline risk', icon: 'alert', color: '#dc4b4b', action: 'Assign owner' }
  };
  const cards = pending.map((i) => {
    const k = kinds[i.kind];
    return `
      <article class="insight">
        <span class="insight-type" style="--t:${k.color}">${icon(k.icon)}${k.label}</span>
        <h3>${esc(i.title)}</h3>
        <p><strong>Why:</strong> ${esc(i.why)}</p>
        ${i.quote ? `<blockquote>“${esc(i.quote)}”<cite>${esc(i.cite)}</cite></blockquote>` : ''}
        <div class="action-buttons">
          <button class="btn primary sm" data-insight-act="${i.id}">${k.action}</button>
          <button class="btn sm" data-insight-dismiss="${i.id}">Dismiss</button>
        </div>
      </article>`;
  }).join('');
  return `
    <div class="list-pad">
      <div class="mock-note">${icon('sparkle')}Mock AI mode — suggestions come from simple local rules. Nothing changes until you confirm.</div>
      ${cards || '<div class="empty-state">You’re all caught up. New suggestions appear here as the team talks.</div>'}
    </div>`;
}

function renderDecisionsTab() {
  const rows = state.decisions.map((d) => `
    <div class="decision">
      ${avatar(d.by)}
      <div><strong>${esc(d.title)}</strong><span class="sub">${d.status === 'decided' ? `Decided by ${esc(memberName(d.by))} · ${esc(d.date)}` : `Raised by ${esc(memberName(d.by))} · ${esc(d.date)}`}</span></div>
      ${d.status === 'decided'
        ? '<span class="status-pill decided">Decided</span>'
        : `<button class="btn sm" data-decide="${d.id}">Mark decided</button>`}
    </div>`).join('');
  return `<div class="list-pad">${rows || '<div class="empty-state">No decisions recorded yet.</div>'}</div>`;
}

function renderChatDock() {
  document.querySelectorAll('[data-chat-tab]').forEach((b) => b.classList.toggle('active', b.dataset.chatTab === ui.chatTab));
  const pending = state.insights.filter((i) => i.status === 'pending').length;
  $('insight-count').textContent = pending || '';
  $('composer').hidden = ui.chatTab !== 'chat';
  const body = $('chat-body');
  body.innerHTML = ui.chatTab === 'assistant' ? renderAssistantTab() : ui.chatTab === 'decisions' ? renderDecisionsTab() : renderChatTab();
  if (ui.chatTab === 'chat') body.scrollTop = body.scrollHeight;
}

/* ---------- Brainstorm dock ---------- */

function renderIdeas() {
  document.querySelectorAll('[data-idea-tab]').forEach((b) => b.classList.toggle('active', b.dataset.ideaTab === ui.ideaTab));
  const body = $('idea-body');
  if (ui.ideaTab !== 'ideas') {
    body.innerHTML = `<div class="empty-state">${ui.ideaTab === 'mindmap' ? 'Mind map' : 'Notes'} isn’t built yet — planned for a later iteration.</div>`;
    return;
  }
  const ideas = state.ideas.filter((i) => ui.ideaFilter === 'all' || i.theme === ui.ideaFilter);
  body.innerHTML = `
    <div class="idea-head">
      <div><h2>${icon('sparkle')}AI Brainstorming</h2><p>Turn your ideas into structured plans.</p></div>
      <label class="select-btn"><select id="idea-filter" aria-label="Filter ideas">${options([['all', 'All ideas'], ...THEMES.map((t) => [t, t])], ui.ideaFilter)}</select></label>
      <button class="btn primary" data-add-idea>${icon('plus')}Add Idea</button>
    </div>
    <div class="idea-grid">
      ${ideas.map((i) => `
        <article class="idea" style="--paper:${PAPER[i.theme] || PAPER.Product}">
          ${i.taskId ? '<span class="idea-converted">✓ On the board</span>' : `<button class="idea-convert" data-convert="${i.id}">${icon('arrow')}Make task</button>`}
          <h3>${esc(i.title)}</h3>
          <p>${esc(i.desc)}</p>
          <div class="idea-foot">
            ${avatar(i.author)}${esc(memberName(i.author))}
            <span class="idea-meta">
              <button class="${i.voted ? 'voted' : ''}" data-vote="${i.id}" aria-label="Vote for ${esc(i.title)}">${icon('heart')}${i.votes}</button>
            </span>
          </div>
        </article>`).join('')}
      <button class="idea-add" data-add-idea><span>${icon('plus')}Add Idea</span></button>
    </div>`;
}

/* ---------- Views ---------- */

const PLACEHOLDERS = {
  calendar: ['calendar', 'Calendar', 'Deadlines and meetings will live here. Not built yet.'],
  files: ['file', 'Files', 'Shared project files will live here. Uploads aren’t configured yet.'],
  overview: ['tasks', 'Overview', 'A project summary dashboard is planned for a later iteration.'],
  team: ['users', 'Team', 'Member roles and workload will live here. Not built yet.'],
  settings: ['settings', 'Settings', 'Project settings are not built yet.']
};

function setView(view) {
  ui.view = view;
  const main = $('main');
  main.dataset.view = view;
  const placeholder = PLACEHOLDERS[view];
  main.classList.toggle('placeholder-mode', Boolean(placeholder));
  $('placeholder').hidden = !placeholder;
  if (placeholder) {
    const [ic, title, text] = placeholder;
    $('placeholder').innerHTML = `<div>${icon(ic)}<h2>${title}</h2><p>${text}</p></div>`;
  }
  renderChrome();
}

function render() {
  renderChrome();
  renderBoard();
  renderChatDock();
  renderIdeas();
}

/* ---------- Task dialog ---------- */

function openTask(task, preset = {}) {
  ui.editingTaskId = task?.id || null;
  const t = task || { title: '', status: 'todo', priority: 'medium', assignee: '', label: 'feature', due: '', ...preset };
  $('task-dialog-title').textContent = task ? `Edit task #${task.num}` : 'New task';
  $('task-title').value = t.title;
  $('task-status').innerHTML = options(STATUSES.map((s) => [s.id, s.label]), t.status);
  $('task-priority').innerHTML = options(PRIORITIES.map((p) => [p.id, p.label]), t.priority);
  $('task-assignee').innerHTML = options(memberOptions(), t.assignee);
  $('task-label').innerHTML = options(LABELS.map((l) => [l, l]), t.label);
  $('task-due').value = t.due || '';
  $('delete-task-button').hidden = !task;
  $('task-dialog').showModal();
}

function createTask(fields) {
  const task = { id: `t${Date.now()}${Math.random().toString(36).slice(2, 5)}`, num: state.nextTaskNum++, label: 'feature', due: '', ...fields };
  state.tasks.push(task);
  return task;
}

$('task-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  const title = $('task-title').value.trim();
  if (!title) return $('task-title').focus();
  const fields = {
    title,
    status: $('task-status').value,
    priority: $('task-priority').value,
    assignee: $('task-assignee').value,
    label: $('task-label').value,
    due: $('task-due').value
  };
  let task;
  if (ui.editingTaskId) {
    task = state.tasks.find((t) => t.id === ui.editingTaskId);
    Object.assign(task, fields);
    toast(`Updated #${task.num}`);
  } else {
    task = createTask(fields);
    toast(`Created #${task.num}`);
  }
  ui.onTaskSaved?.(task);
  ui.onTaskSaved = null;
  save();
  $('task-dialog').close();
  render();
});

$('task-dialog').addEventListener('close', () => { ui.onTaskSaved = null; });

$('delete-task-button').addEventListener('click', async () => {
  const task = state.tasks.find((t) => t.id === ui.editingTaskId);
  if (!task) return;
  $('task-dialog').close();
  if (await confirmAction('Delete task?', `“${task.title}” (#${task.num}) will be removed from the board. This can’t be undone.`, 'Delete')) {
    state.tasks = state.tasks.filter((t) => t.id !== task.id);
    save();
    render();
    toast('Task deleted');
  }
});

/* ---------- Board interactions ---------- */

$('board').addEventListener('click', (event) => {
  const add = event.target.closest('[data-add-task]');
  if (add) return openTask(null, { [ui.groupBy]: add.dataset.addTask });
  const card = event.target.closest('[data-task]');
  if (card) openTask(state.tasks.find((t) => t.id === card.dataset.task));
});

$('board').addEventListener('keydown', (event) => {
  const card = event.target.closest('[data-task]');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openTask(state.tasks.find((t) => t.id === card.dataset.task));
  }
});

$('board').addEventListener('dragstart', (event) => {
  const card = event.target.closest('[data-task]');
  if (!card) return;
  event.dataTransfer.setData('text/plain', card.dataset.task);
  event.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
});
$('board').addEventListener('dragend', (event) => event.target.closest?.('[data-task]')?.classList.remove('dragging'));
$('board').addEventListener('dragover', (event) => {
  const col = event.target.closest('[data-column]');
  if (!col) return;
  event.preventDefault();
  document.querySelectorAll('.drop-target').forEach((c) => c !== col && c.classList.remove('drop-target'));
  col.classList.add('drop-target');
});
$('board').addEventListener('dragleave', (event) => {
  const col = event.target.closest('[data-column]');
  if (col && !col.contains(event.relatedTarget)) col.classList.remove('drop-target');
});
$('board').addEventListener('drop', (event) => {
  const col = event.target.closest('[data-column]');
  if (!col) return;
  event.preventDefault();
  const task = state.tasks.find((t) => t.id === event.dataTransfer.getData('text/plain'));
  if (task && task[ui.groupBy] !== col.dataset.column) {
    task[ui.groupBy] = col.dataset.column;
    save();
    toast(`#${task.num} moved to ${groupColumns().find((c) => c.id === col.dataset.column).label}`);
  }
  render();
});

$('add-task-button').addEventListener('click', () => openTask());
$('group-select').addEventListener('change', (e) => { ui.groupBy = e.target.value; renderBoard(); });
$('filter-select').addEventListener('change', (e) => { ui.assigneeFilter = e.target.value; renderBoard(); });
$('search-input').addEventListener('input', (e) => {
  ui.query = e.target.value;
  if (ui.view !== 'board') setView('board');
  renderBoard();
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('search-input').focus();
  }
});

/* ---------- Mock AI adapter ---------- */

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Finds commitments ("I'll work on X") and open needs ("we haven't decided X") in recent messages.
function extractActionItems(messages) {
  const existing = new Set(state.tasks.map((t) => t.title.toLowerCase()));
  const items = [];
  const sentences = messages
    .filter((m) => m.author !== 'ai')
    .flatMap((m) => m.text.replace(/@\w+/g, '').split(/(?<=[.!?])\s+/).map((text) => ({ author: m.author, text: text.trim() })));
  for (const m of sentences) {
    const text = m.text;
    const urgent = /\b(friday|deadline|due|tonight|tomorrow|asap|urgent)\b/i.test(text);
    let match = text.match(/\b(?:i'll|i will|i can|i'm going to|let me)\s+(work on|handle|take care of|build|set up|write|design|fix|do)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i);
    if (match) {
      items.push({ title: capitalize(`${match[1]} ${match[2]}`), assignee: m.author, priority: urgent ? 'high' : 'medium', include: true });
      continue;
    }
    match = text.match(/\b(?:haven't|have not|didn't|did not)\s+decided?\s+(.+?)(?:[.!?,]|\band\b|$)/i);
    if (match) {
      items.push({ title: `Decide ${match[1].trim()}`, assignee: '', priority: urgent ? 'high' : 'medium', include: true });
      continue;
    }
    match = text.match(/\b(?:we need to|we still need to|someone needs to|someone should|nobody has)\s+(.+?)(?:[.!?,]|$)/i);
    if (match) items.push({ title: capitalize(match[1].trim()), assignee: '', priority: urgent ? 'high' : 'medium', include: true });
  }
  const seen = new Set();
  return items.filter((i) => {
    const key = i.title.toLowerCase();
    if (existing.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function respondAsAI(channel) {
  const channelMsgs = state.messages.filter((m) => m.channel === channel && !m.typing);
  const lastAi = channelMsgs.map((m) => m.author).lastIndexOf('ai');
  const recent = channelMsgs.slice(lastAi + 1).slice(-12);
  const items = extractActionItems(recent);
  const reply = { id: `m${Date.now()}`, channel, author: 'ai', time: nowTime() };
  if (items.length) {
    const setId = `as${Date.now()}`;
    state.actionSets[setId] = { status: 'pending', items };
    Object.assign(reply, { text: "I've detected the following action items:", actionSetId: setId });
  } else {
    reply.text = "I didn't find new action items in the recent messages. Try phrasing commitments like “I'll work on…” or open needs like “we still need to…”. (Mock AI — connect a provider for real answers.)";
  }
  state.messages = state.messages.filter((m) => !m.typing);
  state.messages.push(reply);
  save();
  renderChatDock();
}

// Proactive, non-interrupting: surfaces a suggestion in the AI Assistant tab instead of replying in chat.
function detectInsight(message) {
  const match = message.text.match(/\b(?:haven't|have not|still haven't)\s+decided\s+(.+?)(?:[.!?,]|\band\b|$)|\bshould we\s+(.+?)(?:[?.!]|$)/i);
  if (!match) return;
  const topic = (match[1] || match[2]).trim();
  state.insights.unshift({
    id: `in${Date.now()}`, kind: 'decision', status: 'pending',
    title: `Open question: ${topic}`,
    why: 'This sounds like a choice the team hasn’t settled. Logging it keeps it visible until someone decides.',
    quote: message.text, cite: `${memberName(message.author)} · #${message.channel} · ${message.time}`
  });
  toast('AI spotted an open question — see AI Assistant');
}

/* ---------- Chat interactions ---------- */

$('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('composer-input');
  const text = input.value.trim();
  if (!text) return;
  const message = { id: `m${Date.now()}`, channel: ui.channel, author: CURRENT_USER, time: nowTime(), text };
  state.messages.push(message);
  input.value = '';
  detectInsight(message);
  if (/@ai\b/i.test(text)) {
    state.messages.push({ id: `typing${Date.now()}`, channel: ui.channel, author: 'ai', time: nowTime(), text: '', typing: true });
    const channel = ui.channel;
    setTimeout(() => respondAsAI(channel), 700);
  }
  save();
  renderChatDock();
});

$('mention-ai').addEventListener('click', () => {
  const input = $('composer-input');
  if (!/@ai\b/i.test(input.value)) input.value = `@AI ${input.value}`;
  input.focus();
});
$('attach-button').addEventListener('click', () => toast('File uploads aren’t configured yet.'));

document.querySelectorAll('[data-chat-tab]').forEach((b) => b.addEventListener('click', () => {
  ui.chatTab = b.dataset.chatTab;
  renderChatDock();
  renderChrome();
}));

$('channel-list').addEventListener('click', (event) => {
  const btn = event.target.closest('[data-channel]');
  if (!btn) return;
  ui.channel = btn.dataset.channel;
  ui.chatTab = 'chat';
  if (ui.view !== 'board') setView('board');
  render();
  $('composer-input').focus();
});

$('chat-body').addEventListener('click', async (event) => {
  const approve = event.target.closest('[data-approve-set]');
  const edit = event.target.closest('[data-edit-set]');
  const dismiss = event.target.closest('[data-dismiss-set]');
  const act = event.target.closest('[data-insight-act]');
  const dismissInsight = event.target.closest('[data-insight-dismiss]');
  const decide = event.target.closest('[data-decide]');

  if (approve) {
    const set = state.actionSets[approve.dataset.approveSet];
    const chosen = set.items.filter((i) => i.include);
    if (!chosen.length) return toast('No items selected — use Edit to include some.');
    chosen.forEach((i) => createTask({ title: i.title, assignee: i.assignee, priority: i.priority, status: 'todo', fromAI: true }));
    Object.assign(set, { status: 'approved', added: chosen.length });
    save();
    render();
    toast(`Added ${chosen.length} task${chosen.length === 1 ? '' : 's'} to To Do`);
  }
  if (edit) openActionSet(edit.dataset.editSet);
  if (dismiss) {
    state.actionSets[dismiss.dataset.dismissSet].status = 'dismissed';
    save();
    renderChatDock();
  }
  if (dismissInsight) {
    state.insights.find((i) => i.id === dismissInsight.dataset.insightDismiss).status = 'dismissed';
    save();
    renderChatDock();
  }
  if (act) {
    const insight = state.insights.find((i) => i.id === act.dataset.insightAct);
    if (insight.kind === 'decision') {
      const topic = insight.title.replace(/^Open question:\s*/, '').replace(/ is still undecided$/, '');
      state.decisions.unshift({ id: `d${Date.now()}`, title: capitalize(topic), status: 'open', by: CURRENT_USER, date: 'Today' });
      insight.status = 'done';
      save();
      ui.chatTab = 'decisions';
      renderChatDock();
      toast('Logged as an open decision');
    } else {
      const task = state.tasks.find((t) => t.id === insight.taskId);
      if (!task) { insight.status = 'done'; save(); return renderChatDock(); }
      openTask(task);
      $('task-assignee').focus();
      ui.onTaskSaved = (saved) => { if (saved.assignee) insight.status = 'done'; };
    }
  }
  if (decide) {
    const d = state.decisions.find((x) => x.id === decide.dataset.decide);
    if (await confirmAction('Mark as decided?', `“${d.title}” will be recorded as an official team decision.`, 'Mark decided')) {
      Object.assign(d, { status: 'decided', by: CURRENT_USER, date: 'Today' });
      save();
      renderChatDock();
    }
  }
});

function openActionSet(id) {
  ui.editingActionSetId = id;
  const set = state.actionSets[id];
  $('action-rows').innerHTML = set.items.map((item, idx) => `
    <div class="action-row" data-row="${idx}">
      <input type="checkbox" ${item.include ? 'checked' : ''} aria-label="Include item" />
      <input class="row-title" value="${esc(item.title)}" maxlength="100" aria-label="Task title" />
      <select class="row-assignee" aria-label="Assignee">${options(memberOptions(), item.assignee)}</select>
      <select class="row-priority" aria-label="Priority">${options(PRIORITIES.map((p) => [p.id, p.label]), item.priority)}</select>
    </div>`).join('');
  $('actions-dialog').showModal();
}

$('actions-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  const set = state.actionSets[ui.editingActionSetId];
  document.querySelectorAll('#action-rows [data-row]').forEach((row) => {
    const item = set.items[row.dataset.row];
    item.include = row.querySelector('input[type="checkbox"]').checked;
    item.title = row.querySelector('.row-title').value.trim() || item.title;
    item.assignee = row.querySelector('.row-assignee').value;
    item.priority = row.querySelector('.row-priority').value;
  });
  save();
  $('actions-dialog').close();
  renderChatDock();
});

/* ---------- Brainstorm interactions ---------- */

function openIdeaDialog() {
  $('idea-form').reset();
  $('idea-theme').innerHTML = options(THEMES.map((t) => [t, t]), ui.ideaFilter === 'all' ? 'Product' : ui.ideaFilter);
  $('idea-dialog').showModal();
}

$('idea-form').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'save') return;
  event.preventDefault();
  const title = $('idea-title').value.trim();
  if (!title) return $('idea-title').focus();
  state.ideas.push({ id: `i${Date.now()}`, title, desc: $('idea-desc').value.trim(), theme: $('idea-theme').value, author: CURRENT_USER, votes: 0, voted: false });
  save();
  $('idea-dialog').close();
  renderIdeas();
  toast('Idea added');
});

$('idea-body').addEventListener('click', (event) => {
  if (event.target.closest('[data-add-idea]')) return openIdeaDialog();
  const vote = event.target.closest('[data-vote]');
  if (vote) {
    const idea = state.ideas.find((i) => i.id === vote.dataset.vote);
    idea.voted = !idea.voted;
    idea.votes += idea.voted ? 1 : -1;
    save();
    return renderIdeas();
  }
  const convert = event.target.closest('[data-convert]');
  if (convert) {
    const idea = state.ideas.find((i) => i.id === convert.dataset.convert);
    const task = createTask({ title: idea.title, assignee: '', priority: 'medium', status: 'todo', label: 'feature' });
    idea.taskId = task.id;
    save();
    render();
    toast(`“${idea.title}” is now task #${task.num}`);
  }
});

$('idea-body').addEventListener('change', (event) => {
  if (event.target.id === 'idea-filter') {
    ui.ideaFilter = event.target.value;
    renderIdeas();
  }
});

document.querySelectorAll('[data-idea-tab]').forEach((b) => b.addEventListener('click', () => {
  ui.ideaTab = b.dataset.ideaTab;
  renderIdeas();
}));

/* ---------- Dock layout: detachable chat + chat/brainstorm split ---------- */

const LAYOUT_KEY = 'project-room-layout';
const PANEL_MIN_W = 300;
const FLOAT_MIN = { w: 340, h: 280 };

const layout = (() => {
  const defaults = { chatW: null, detached: false, brainstormClosed: false, float: { x: null, y: null, w: 460, h: 540 } };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(LAYOUT_KEY)) }; } catch { return defaults; }
})();

function saveLayout() {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* storage unavailable */ }
}

function clampFloat() {
  const f = layout.float;
  f.w = Math.max(FLOAT_MIN.w, Math.min(f.w, innerWidth - 16));
  f.h = Math.max(FLOAT_MIN.h, Math.min(f.h, innerHeight - 16));
  if (f.x == null) f.x = innerWidth - f.w - 24;
  if (f.y == null) f.y = innerHeight - f.h - 24;
  f.x = Math.max(8, Math.min(f.x, innerWidth - f.w - 8));
  f.y = Math.max(8, Math.min(f.y, innerHeight - 48));
}

function applyLayout() {
  const dock = $('dock');
  const panel = $('chat-panel');
  if (layout.detached) {
    clampFloat();
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    panel.classList.add('floating');
    Object.assign(panel.style, { left: `${layout.float.x}px`, top: `${layout.float.y}px`, width: `${layout.float.w}px`, height: `${layout.float.h}px` });
  } else {
    if (panel.parentElement !== dock) dock.insertBefore(panel, $('split-resizer'));
    panel.classList.remove('floating');
    panel.removeAttribute('style');
  }
  dock.classList.toggle('chat-detached', layout.detached);
  dock.classList.toggle('brainstorm-closed', layout.brainstormClosed);
  $('main').classList.toggle('dock-empty', layout.detached && layout.brainstormClosed);
  if (layout.chatW) dock.style.setProperty('--chat-w', `${layout.chatW}%`);
  else dock.style.removeProperty('--chat-w');
  $('reopen-brainstorm').hidden = !layout.brainstormClosed;
  const toggle = $('toggle-detach');
  toggle.innerHTML = icon(layout.detached ? 'dockIn' : 'popout');
  toggle.setAttribute('aria-label', layout.detached ? 'Dock chat' : 'Detach chat');
  toggle.title = layout.detached ? 'Dock chat' : 'Detach chat';
}

function setLayout(changes) {
  Object.assign(layout, changes);
  saveLayout();
  applyLayout();
}

$('close-brainstorm').addEventListener('click', () => setLayout({ brainstormClosed: true }));
$('reopen-brainstorm').addEventListener('click', () => setLayout({ brainstormClosed: false }));
$('toggle-detach').addEventListener('click', () => setLayout({ detached: !layout.detached }));

function isOverDock(x, y) {
  const dock = $('dock');
  if (!dock.offsetParent) return false;
  const r = dock.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// Drag the chat tab bar out of the dock to detach it; drag the floating window back onto the dock to re-attach.
$('chat-tabs').addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('#toggle-detach, #reopen-brainstorm')) return;
  if (matchMedia('(max-width: 1100px)').matches && !layout.detached) return;
  const panel = $('chat-panel');
  const start = { x: event.clientX, y: event.clientY };
  let grab = null;
  let moved = false;

  const move = (e) => {
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
    if (!moved) {
      moved = true;
      document.body.classList.add('moving-panel');
    }
    if (!layout.detached) {
      if (isOverDock(e.clientX, e.clientY)) return;
      clampFloat();
      const w = layout.float.w;
      grab = { dx: Math.min(Math.max(start.x - panel.getBoundingClientRect().left, 40), w - 40), dy: 20 };
      setLayout({ detached: true });
    }
    if (!grab) {
      const r = panel.getBoundingClientRect();
      grab = { dx: start.x - r.left, dy: start.y - r.top };
    }
    layout.float.x = e.clientX - grab.dx;
    layout.float.y = e.clientY - grab.dy;
    clampFloat();
    panel.style.left = `${layout.float.x}px`;
    panel.style.top = `${layout.float.y}px`;
    $('dock').classList.toggle('drop-target', isOverDock(e.clientX, e.clientY));
  };

  const stop = (e) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    document.body.classList.remove('moving-panel');
    $('dock').classList.remove('drop-target');
    if (!moved) return;
    // Swallow the click that follows a drag so it doesn't switch tabs.
    window.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true });
    if (layout.detached && e.type === 'pointerup' && isOverDock(e.clientX, e.clientY)) layout.detached = false;
    saveLayout();
    applyLayout();
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
});

$('float-resize').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  const panel = $('chat-panel');
  const start = { x: event.clientX, y: event.clientY, w: layout.float.w, h: layout.float.h };
  document.body.classList.add('moving-panel');
  const move = (e) => {
    layout.float.w = Math.max(FLOAT_MIN.w, Math.min(start.w + e.clientX - start.x, innerWidth - layout.float.x - 8));
    layout.float.h = Math.max(FLOAT_MIN.h, Math.min(start.h + e.clientY - start.y, innerHeight - layout.float.y - 8));
    panel.style.width = `${layout.float.w}px`;
    panel.style.height = `${layout.float.h}px`;
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    document.body.classList.remove('moving-panel');
    saveLayout();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
});

function setChatWidth(px) {
  const width = $('dock').getBoundingClientRect().width;
  const clamped = Math.max(PANEL_MIN_W, Math.min(px, width - PANEL_MIN_W));
  setLayout({ chatW: Math.round((clamped / width) * 1000) / 10 });
}

$('split-resizer').addEventListener('pointerdown', (event) => {
  const resizer = event.currentTarget;
  const left = $('dock').getBoundingClientRect().left;
  resizer.setPointerCapture(event.pointerId);
  resizer.classList.add('dragging');
  document.body.classList.add('col-resizing');
  const move = (e) => setChatWidth(e.clientX - left);
  const stop = () => {
    resizer.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    resizer.removeEventListener('pointermove', move);
  };
  resizer.addEventListener('pointermove', move);
  resizer.addEventListener('pointerup', stop, { once: true });
  resizer.addEventListener('pointercancel', stop, { once: true });
});

$('split-resizer').addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 80 : 20;
  const current = $('chat-panel').getBoundingClientRect().width;
  if (event.key === 'ArrowLeft') setChatWidth(current - step);
  else if (event.key === 'ArrowRight') setChatWidth(current + step);
  else return;
  event.preventDefault();
});

$('split-resizer').addEventListener('dblclick', () => setLayout({ chatW: null }));

window.addEventListener('resize', () => {
  if (layout.detached) applyLayout();
});

/* ---------- Navigation & placeholders ---------- */

document.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => setView(el.dataset.view)));
$('share-button').addEventListener('click', () => toast('Sharing isn’t configured — this demo stores data in your browser only.'));
$('invite-button').addEventListener('click', () => toast('Invitations aren’t configured yet.'));
$('new-project').addEventListener('click', () => toast('Creating projects is planned for a later iteration.'));
$('add-channel').addEventListener('click', () => toast('Creating channels is planned for a later iteration.'));
$('workspace-switch').addEventListener('click', () => toast('You have one workspace: Project Room.'));

/* ---------- Board / dock resizer ---------- */

const DOCK_KEY = 'project-room-dock-height';
const DOCK_MIN = 180;
const BOARD_MIN = 230; // matches .board min-height in styles.css

function setDockHeight(px) {
  const main = $('main');
  const max = main.getBoundingClientRect().bottom - $('board').getBoundingClientRect().top - BOARD_MIN;
  const height = Math.round(Math.max(DOCK_MIN, Math.min(px, max)));
  main.style.setProperty('--dock-h', `${height}px`);
  try { localStorage.setItem(DOCK_KEY, height); } catch { /* storage unavailable */ }
}

$('dock-resizer').addEventListener('pointerdown', (event) => {
  const resizer = event.currentTarget;
  const bottom = $('main').getBoundingClientRect().bottom;
  resizer.setPointerCapture(event.pointerId);
  resizer.classList.add('dragging');
  document.body.classList.add('resizing');
  const move = (e) => setDockHeight(bottom - e.clientY);
  const stop = () => {
    resizer.classList.remove('dragging');
    document.body.classList.remove('resizing');
    resizer.removeEventListener('pointermove', move);
  };
  resizer.addEventListener('pointermove', move);
  resizer.addEventListener('pointerup', stop, { once: true });
  resizer.addEventListener('pointercancel', stop, { once: true });
});

$('dock-resizer').addEventListener('keydown', (event) => {
  const step = event.shiftKey ? 80 : 20;
  if (event.key === 'ArrowUp') setDockHeight($('dock').offsetHeight + step);
  else if (event.key === 'ArrowDown') setDockHeight($('dock').offsetHeight - step);
  else return;
  event.preventDefault();
});

$('dock-resizer').addEventListener('dblclick', () => {
  $('main').style.removeProperty('--dock-h');
  try { localStorage.removeItem(DOCK_KEY); } catch { /* storage unavailable */ }
});

document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
setView('board');
applyLayout();
try {
  const savedDock = Number(localStorage.getItem(DOCK_KEY));
  if (savedDock) $('main').style.setProperty('--dock-h', `${savedDock}px`);
} catch { /* storage unavailable */ }
render();
