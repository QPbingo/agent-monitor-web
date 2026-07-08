import { restoreSession, showApp, doLogout, wireUnauthorizedAutoLogout } from './ui/auth'
import { authStore } from './state/auth'
import { agentStore } from './state/agent'
import { hierarchyStore } from './state/hierarchy'
import { registryStore } from './state/registry'
import { sessionsStore, SESSION_STATUSES } from './state/sessions'
import { SSEManager, sseStatusBus, type SSEStatus, type SSEEvent } from './sse/manager'
import { renderSidebar, bindTreeHandlers } from './ui/sidebar'
import { renderSessionList, renderSessionDetail, bindSessionHandlers } from './ui/sessionCard'
import { bindTimelineHandlers } from './ui/timeline'
import { renderAgentPanel, renderExecHistory, renderAgentSessionList, renderAgentTopicOptions } from './ui/agentPanel'
import { renderAgentsView } from './ui/agentsView'
import { closeModal } from './ui/modals'
import { toast } from './ui/toast'
import './styles/main.css'

let sse: SSEManager | null = null

// Uptime tracking — page load timestamp for the uptime stat card.
const pageLoadTime = Date.now()

// rAF-based render coalescing: rapid store notifications (e.g. SSE delta
// storms) only flush to the DOM once per animation frame.
let renderPending = false
function scheduleRender(fn: () => void): void {
  if (renderPending) return
  renderPending = true
  requestAnimationFrame(() => {
    renderPending = false
    fn()
  })
}

function handleSSE(event: SSEEvent): void {
  if (event.type === 'agent_error' && (event as { __auth?: boolean }).__auth) {
    if (sse) { sse.close(); sse = null }
    authStore.clear()
    import('./ui/auth').then(({ renderAuth }) => renderAuth('login'))
    toast.warn('Session expired — please sign in again')
    return
  }
  hierarchyStore.applyEvent(event)
  sessionsStore.applyEvent(event)
  agentStore.applyEvent(event)
  registryStore.applyEvent(event)
}

function connectSSE(): void {
  if (sse) sse.close()
  sse = new SSEManager()
  sse.on(handleSSE)
  sse.connect()
}

// ── Shell rendering ──
let currentView: 'dashboard' | 'sessions' | 'agents' = 'sessions'

function renderShell(): void {
  const root = document.getElementById('app')
  if (!root) return
  root.innerHTML = `
    <!-- Skip link for keyboard users -->
    <a href="#main-content" class="skip-link">Skip to main content</a>

    <!-- Top Navigation -->
    <nav class="top-nav" aria-label="Main navigation">
      <div class="logo">AGENT<span>//MON</span></div>
      <button class="nav-item active" id="nav-sessions-btn" data-view="sessions">SESSIONS</button>
      <button class="nav-item" id="nav-dashboard-btn" data-view="dashboard">DASHBOARD</button>
      <button class="nav-item" id="nav-agents-btn" data-view="agents">AGENTS</button>
      <div class="nav-spacer"></div>
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark/light theme">☽ MODE</button>
      <div class="user-dropdown-wrap" id="user-dropdown-wrap">
        <div class="user-avatar" id="user-avatar" title="User menu">U</div>
        <div class="user-dropdown" id="user-dropdown">
          <div class="user-info">
            <span class="avatar-lg" id="user-avatar-lg">U</span>
            <div>
              <div class="user-name" id="user-fullname">User</div>
              <div class="user-role"><span class="dot"></span> Admin</div>
            </div>
          </div>
          <button class="menu-item" id="menu-permissions">Permissions</button>
          <button class="menu-item" id="menu-agent-panel">Agent Panel</button>
          <div class="menu-sep"></div>
          <button class="menu-item danger" id="menu-signout">Sign Out</button>
        </div>
        <div class="user-dropdown-backdrop" id="user-backdrop"></div>
      </div>
    </nav>

    <!-- Main area -->
    <main class="main-area" id="main-content">
      <aside class="sidebar" id="sidebar" aria-label="Project navigation">
        <div class="sidebar-body">
          <div class="ws-selector" id="ws-selector">
            <button class="ws-selector-btn" id="ws-selector-btn">
              <span class="ws-dot"></span>
              <span class="ws-name" id="ws-name">Workspace</span>
              <span class="ws-chevron">▼</span>
            </button>
            <div class="ws-selector-dropdown" id="ws-selector-dropdown">
              <div id="ws-options"></div>
              <div class="ws-selector-footer">
                <button id="ws-new-btn">+ New Workspace</button>
              </div>
            </div>
          </div>

          <div class="side-nav-item active" id="nav-sessions" data-view="sessions">
            <span class="side-nav-icon">◆</span>
            <span class="side-nav-label">Sessions</span>
            <span class="side-nav-badge" id="sess-badge">0</span>
          </div>
          <div class="side-nav-item" data-view="dashboard" id="nav-dashboard">
            <span class="side-nav-icon">◆</span>
            <span class="side-nav-label">Dashboard</span>
          </div>

          <div class="tree-separator"></div>

          <div class="sidebar-header">
            Projects
            <span class="add-btn" id="sidebar-add-project" title="Add Project" role="button" tabindex="0">+</span>
          </div>
          <div id="sidebar-tree"></div>

          <div class="sidebar-section" style="margin-top:var(--space-4)">
            <div class="sidebar-label">Status</div>
            <div class="sidebar-status-item" id="sidebar-daemon">
              <span class="status-dot active">●</span> daemon :9101
            </div>
            <div class="sidebar-status-item" id="sidebar-sess-count">
              <span class="status-dot active">●</span> <span id="sidebar-active-label">0 active</span> · <span id="sidebar-total-label">0 total</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- Dashboard View -->
      <div class="view-panel" id="view-dashboard">
        <main class="full-main">
          <div>
            <h1 style="font-family:var(--font-pixel);font-size:11px;color:var(--neon-cyan);text-shadow:var(--cyan-glow);text-transform:uppercase">Dashboard</h1>
            <div id="dash-ws-subtitle" style="font-size:11px;color:var(--text-tertiary);margin-top:4px"></div>
          </div>
          <div class="stats-row" id="stats-row"></div>
          <div class="detail-section-title">Recent Activity</div>
          <div id="recent-activity"></div>
        </main>
      </div>

      <!-- Sessions View -->
      <div class="view-panel active" id="view-sessions">
        <div class="stats-row" id="session-stats"></div>
        <div class="session-panel">
          <div class="session-list-panel" id="session-list-panel">
            <div class="session-list-header"><span>SESSIONS</span><span class="list-count" id="list-count">0</span></div>
            <div class="filter-group" id="filter-group"></div>
            <div class="session-list-body" id="session-list-body"></div>
          </div>
          <div class="session-detail-panel" id="session-detail-panel">
            <div class="empty-state" id="detail-empty">
              <h3>Select a session</h3>
              <p>Choose a session from the list to view its timeline and details.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Agents View -->
      <div class="view-panel" id="view-agents">
        <div id="agents-view-container"></div>
      </div>
    </main>
    <!-- Agent panel: slide-out drawer -->
    <div id="agent-panel" class="agent-drawer" style="display:none" role="complementary" aria-label="Agent control panel"></div>`

  // Overlays
  const modalOverlay = document.createElement('div')
  modalOverlay.className = 'modal-overlay'
  modalOverlay.id = 'modal-overlay'
  modalOverlay.style.display = 'none'
  modalOverlay.innerHTML = '<div class="modal-box" id="modal-box"></div>'
  modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal() }
  document.body.appendChild(modalOverlay)

  const authOverlay = document.createElement('div')
  authOverlay.id = 'auth-overlay'
  authOverlay.style.display = 'none'
  document.body.prepend(authOverlay)

  // ── Wire UI ──
  wireTopNav()
  wireSidebarNav()
  bindTreeHandlers()
  bindSessionHandlers()
  bindTimelineHandlers()
  renderAgentPanel()

  // ── Theme ──
  const saved = localStorage.getItem('agent-monitor-theme')
  const themeToggle = document.getElementById('theme-toggle')
  if (themeToggle) {
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
      themeToggle.innerHTML = '☀ MODE'
    } else {
      // Default dark: keep the html[data-theme="dark"] from index.html, or set it if missing.
      if (!document.documentElement.getAttribute('data-theme')) {
        document.documentElement.setAttribute('data-theme', 'dark')
      }
      themeToggle.innerHTML = '☽ MODE'
    }
    themeToggle.onclick = () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light'
      if (isLight) {
        document.documentElement.setAttribute('data-theme', 'dark')
        themeToggle.innerHTML = '☽ MODE'
        localStorage.setItem('agent-monitor-theme', 'dark')
      } else {
        document.documentElement.setAttribute('data-theme', 'light')
        themeToggle.innerHTML = '☀ MODE'
        localStorage.setItem('agent-monitor-theme', 'light')
      }
    }
  }

  // ── Store subscriptions ──
  // For batched SSE notifications: coalesce DOM writes into one rAF frame.
  // For user actions (flushSync): render immediately in the current frame.
  let lastWsId = hierarchyStore.selectedWorkspaceId
  let lastTopicId = hierarchyStore.selectedTopicId
  let lastStoryId = hierarchyStore.selectedStoryId
  let lastDetailKey: string | null = null
  let lastDetailHash = ''

  function renderShellDeferred() {
    scheduleRender(() => {
      renderSidebar(); renderSessionList(); renderTopNav(); renderFilters(); renderStatsRow(); renderDashboard(); renderAgentSessionList(); renderAgentTopicOptions()
    })
  }
  function renderShellNow() {
    renderSidebar(); renderSessionList(); renderTopNav(); renderFilters(); renderStatsRow(); renderDashboard(); renderAgentSessionList(); renderAgentTopicOptions()
  }

  hierarchyStore.subscribe(() => {
    if (hierarchyStore.selectedWorkspaceId !== lastWsId ||
        hierarchyStore.selectedTopicId !== lastTopicId ||
        hierarchyStore.selectedStoryId !== lastStoryId) {
      lastWsId = hierarchyStore.selectedWorkspaceId
      lastTopicId = hierarchyStore.selectedTopicId
      lastStoryId = hierarchyStore.selectedStoryId
      sessionsStore.selectedSessionKey = null
    }
    hierarchyStore._sync ? renderShellNow() : renderShellDeferred()
  })

  sessionsStore.subscribe(() => {
    if (sessionsStore._sync) {
      // User action — synchronous full render. Detail panel always updates
      // (skips hash check) so toggle-turn / toggle-tool / toggle-entry work.
      renderShellNow()
      const key = sessionsStore.selectedSessionKey
      const sess = key ? sessionsStore.sessions[key] : null
      const h = key ? hashSessionForDetail(sess) : 'empty'
      if (key !== lastDetailKey || h !== lastDetailHash) {
        lastDetailKey = key
        lastDetailHash = h
      }
      renderSessionDetail()
    } else {
      // SSE delta — batch shell + detail into ONE rAF callback. Two separate
      // scheduleRender calls would drop the second due to renderPending dedup
      // (BUG-002: detail panel never updated on SSE deltas).
      scheduleRender(() => {
        renderSidebar(); renderSessionList(); renderTopNav(); renderFilters(); renderStatsRow(); renderDashboard(); renderAgentSessionList(); renderAgentTopicOptions()
        const key = sessionsStore.selectedSessionKey
        const sess = key ? sessionsStore.sessions[key] : null
        const h = key ? hashSessionForDetail(sess) : 'empty'
        if (key !== lastDetailKey || h !== lastDetailHash) {
          lastDetailKey = key
          lastDetailHash = h
          renderSessionDetail()
        }
      })
    }
  })
  agentStore.subscribe(() => {
    agentStore._sync ? renderExecHistory() : scheduleRender(() => renderExecHistory())
  })
  sseStatusBus.subscribe(() => updateConnIndicator(sseStatusBus.current()))
  updateConnIndicator('disconnected')
  // Render stats immediately so cards are visible even before first SSE snapshot.
  renderStatsRow()
}

// ── Top nav wiring ──
let topNavWired = false
function wireTopNav(): void {
  if (topNavWired) return
  topNavWired = true
  // Workspace selector in sidebar
  const wsBtn = document.getElementById('ws-selector-btn')
  const wsDropdown = document.getElementById('ws-selector-dropdown')
  if (wsBtn && wsDropdown) {
    wsBtn.onclick = (e) => {
      e.stopPropagation()
      wsDropdown.classList.toggle('open')
    }
    document.addEventListener('click', (e) => {
      if (!wsDropdown.contains(e.target as Node) && e.target !== wsBtn) {
        wsDropdown.classList.remove('open')
      }
    })
  }

  // User avatar dropdown in header
  const userAvatar = document.getElementById('user-avatar')
  const userDropdown = document.getElementById('user-dropdown')
  const userBackdrop = document.getElementById('user-backdrop')
  if (userAvatar && userDropdown && userBackdrop) {
    userAvatar.onclick = (e) => {
      e.stopPropagation()
      userDropdown.classList.toggle('open')
      userBackdrop.classList.toggle('open')
    }
    userBackdrop.onclick = () => { userDropdown.classList.remove('open'); userBackdrop.classList.remove('open') }
  }

  const signoutBtn = document.getElementById('menu-signout')
  if (signoutBtn) signoutBtn.onclick = () => { userDropdown?.classList.remove('open'); userBackdrop?.classList.remove('open'); doLogout() }

  const permBtn = document.getElementById('menu-permissions')
  if (permBtn) permBtn.onclick = () => {
    userDropdown?.classList.remove('open'); userBackdrop?.classList.remove('open')
    const wid = hierarchyStore.selectedWorkspaceId ?? 1
    import('./ui/modals').then(({ showPermissionModal }) => showPermissionModal('workspace', wid))
  }

  const agentMenuBtn = document.getElementById('menu-agent-panel')
  if (agentMenuBtn) {
    agentMenuBtn.onclick = () => {
      userDropdown?.classList.remove('open'); userBackdrop?.classList.remove('open')
      const ap = document.getElementById('agent-panel')
      if (ap) {
        const visible = ap.style.display === 'block'
        ap.style.display = visible ? 'none' : 'block'
      }
    }
  }

  const wsNewBtn = document.getElementById('ws-new-btn')
  if (wsNewBtn) {
    wsNewBtn.onclick = () => {
      wsDropdown?.classList.remove('open')
      import('./ui/modals').then(({ showCreateModal }) => showCreateModal('workspace', 0))
    }
  }

  const sidebarAddProj = document.getElementById('sidebar-add-project')
  if (sidebarAddProj) {
    sidebarAddProj.onclick = () => {
      import('./ui/modals').then(({ showCreateModal }) => {
        const wid = hierarchyStore.selectedWorkspaceId ?? 1
        showCreateModal('project', wid)
      })
    }
  }

  // Header nav-item buttons (SESSIONS / DASHBOARD)
  document.querySelectorAll('.top-nav .nav-item').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.top-nav .nav-item').forEach(b => b.classList.remove('active'))
      el.classList.add('active')
      const view = (el as HTMLElement).dataset.view || 'sessions'
      switchView(view)
    })
  })
}

// ── Sidebar view switching ──
function wireSidebarNav(): void {
  document.querySelectorAll('.side-nav-item').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.side-nav-item').forEach(b => b.classList.remove('active'))
      el.classList.add('active')
      const view = (el as HTMLElement).dataset.view || 'sessions'
      // Sync header nav-item active state
      document.querySelectorAll('.top-nav .nav-item').forEach(b => b.classList.remove('active'))
      const headerNav = document.getElementById('nav-' + view + '-btn')
      if (headerNav) headerNav.classList.add('active')
      switchView(view)
    })
  })
}

function switchView(view: string): void {
  currentView = view as 'dashboard' | 'sessions' | 'agents'
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'))
  const panel = document.getElementById('view-' + view)
  if (panel) panel.classList.add('active')
  // Sync sidebar + header nav active state
  document.querySelectorAll('.side-nav-item').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.top-nav .nav-item').forEach(b => b.classList.remove('active'))
  const sideNav = document.querySelector(`.side-nav-item[data-view="${view}"]`)
  const headerNav = document.getElementById('nav-' + view + '-btn')
  if (sideNav) sideNav.classList.add('active')
  if (headerNav) headerNav.classList.add('active')
  if (view === 'dashboard') renderDashboard()
  if (view === 'agents') renderAgentsPanel()
}

// ── Render functions ──
function renderTopNav(): void {
  // Workspace selector in sidebar
  const wsName = document.getElementById('ws-name')
  if (wsName && hierarchyStore.tree) {
    const ws = hierarchyStore.tree.workspaces?.find(w => w.workspace.id === hierarchyStore.selectedWorkspaceId)
    if (ws) wsName.textContent = ws.workspace.name
  }

  const wsOptions = document.getElementById('ws-options')
  if (wsOptions && hierarchyStore.tree?.workspaces) {
    wsOptions.innerHTML = hierarchyStore.tree.workspaces.map(w => `
      <button class="ws-selector-option${w.workspace.id === hierarchyStore.selectedWorkspaceId ? ' selected' : ''}" data-wid="${w.workspace.id}">
        <span class="ws-dot"></span> ${esc(w.workspace.name)}
        <span class="ws-info">${(w.projects || []).length}</span>
      </button>`).join('')
    wsOptions.querySelectorAll('.ws-selector-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const wid = parseInt((btn as HTMLElement).dataset.wid || '0')
        hierarchyStore.selectWorkspace(wid)
        document.getElementById('ws-selector-dropdown')?.classList.remove('open')
      })
    })
  }

  // User avatar in header
  const uav = document.getElementById('user-avatar')
  const uavLg = document.getElementById('user-avatar-lg')
  const ufull = document.getElementById('user-fullname')
  if (authStore.user) {
    const un = authStore.user.username
    const initial = un.charAt(0).toUpperCase()
    if (uav) uav.textContent = initial
    if (uavLg) uavLg.textContent = initial
    if (ufull) ufull.textContent = un
  }

  // Active count
  const active = Object.values(sessionsStore.sessions).filter(s => s.status === 'active').length

  // Sessions badge + sidebar status
  const total = Object.keys(sessionsStore.sessions).length
  const badgeEl = document.getElementById('sess-badge')
  if (badgeEl) badgeEl.textContent = String(total)
  const listCount = document.getElementById('list-count')
  if (listCount) listCount.textContent = String(total)

  const activeLabel = document.getElementById('sidebar-active-label')
  if (activeLabel) activeLabel.textContent = `${active} active`
  const totalLabel = document.getElementById('sidebar-total-label')
  if (totalLabel) totalLabel.textContent = `${total} total`
}

function updateConnIndicator(status: SSEStatus): void {
  const live = status === 'connected'
  // Sidebar daemon status dot
  const sDot = document.querySelector('#sidebar-daemon .status-dot') as HTMLElement | null
  if (sDot) {
    sDot.classList.remove('active', 'error')
    sDot.classList.add(live ? 'active' : 'error')
  }
  const sAddr = document.querySelector('#sidebar-daemon') as HTMLElement | null
  if (sAddr && sAddr.childNodes.length > 1) {
    sAddr.childNodes[1].textContent = live ? ' daemon :9101' : ' daemon reconnecting…'
  }
}

// JS hover tracking for filter pills — survives innerHTML rebuilds.
let hoveredFilter: string | null = null

function initFilterHoverTracking(host: HTMLElement): void {
  if ((host as unknown as { _hoverWired?: boolean })._hoverWired) return
  ;(host as unknown as { _hoverWired?: boolean })._hoverWired = true
  host.addEventListener('mouseover', (e) => {
    const pill = (e.target as HTMLElement).closest<HTMLElement>('.filter-pill')
    if (!pill) return
    const f = pill.dataset.filter
    if (!f || f === hoveredFilter) return
    if (hoveredFilter) {
      host.querySelector(`.filter-pill[data-filter="${CSS.escape(hoveredFilter)}"]`)?.classList.remove('hover')
    }
    hoveredFilter = f
    pill.classList.add('hover')
  })
  host.addEventListener('mouseout', (e) => {
    const pill = (e.target as HTMLElement).closest<HTMLElement>('.filter-pill')
    if (!pill) return
    const related = (e as MouseEvent).relatedTarget as HTMLElement | null
    if (related && pill.contains(related)) return
    const f = pill.dataset.filter
    if (f && f === hoveredFilter) {
      pill.classList.remove('hover')
      hoveredFilter = null
    }
  })
}

function renderFilters(): void {
  const host = document.getElementById('filter-group')
  if (!host) return
  initFilterHoverTracking(host)
  const counts = sessionsStore.statusCounts()
  const agentCounts = sessionsStore.agentTypeCounts()
  const total = Object.values(sessionsStore.sessions).length

  const statusPills = ['all', ...SESSION_STATUSES].map(s => {
    const c = s === 'all' ? total : (counts[s] ?? 0)
    return `<button class="filter-pill ${sessionsStore.currentFilter === s ? 'active' : ''}" data-filter="${s}">
      ${s === 'all' ? 'All' : s}<span class="count">${c}</span>
    </button>`
  }).join('')

  const agentPills = ['claude', 'opencode', 'codex'].map(a => {
    const c = agentCounts[a] ?? 0
    if (c === 0 && sessionsStore.currentFilter !== a) return ''
    return `<button class="filter-pill ${sessionsStore.currentFilter === a ? 'active' : ''}" data-filter="${a}">
      ${a}<span class="count">${c}</span>
    </button>`
  }).join('')

  host.innerHTML = statusPills + agentPills
  // Re-apply hover after DOM rebuild.
  if (hoveredFilter) {
    const el = host.querySelector(`.filter-pill[data-filter="${CSS.escape(hoveredFilter)}"]`)
    if (el) el.classList.add('hover')
  }
  host.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = (btn as HTMLElement).dataset.filter as 'all' | typeof SESSION_STATUSES[number]
      host.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      sessionsStore.setFilter(f)
    })
  })
}

// renderStatsRow populates the 4-card stat row above the session list.
// Labels match preview.html: Active Sessions / Total Turns / Errors / Uptime.
function renderStatsRow(): void {
  const statsRow = document.getElementById('session-stats')
  if (!statsRow) return
  const sessions = Object.values(sessionsStore.sessions)
  const active = sessions.filter(s => s.status === 'active').length
  const totalTurns = sessions.reduce((sum, s) => sum + (s.turn_count || 0), 0)
  const errors = sessions.filter(s => s.status === 'error' || s.status === 'disappeared' || s.status === 'unknown').length
  const uptime = formatUptime(Date.now() - pageLoadTime)
  const avgTurns = sessions.length > 0 ? (totalTurns / sessions.length).toFixed(1) : '0.0'

  statsRow.innerHTML = `
    <div class="stat-card"><div class="stat-label">Active Sessions</div><div class="stat-value green">${active}</div><div class="stat-sub">${sessions.length} total monitored</div></div>
    <div class="stat-card"><div class="stat-label">Total Turns</div><div class="stat-value">${totalTurns}</div><div class="stat-sub">avg ${avgTurns} per session</div></div>
    <div class="stat-card"><div class="stat-label">Errors</div><div class="stat-value${errors > 0 ? ' magenta' : ''}">${errors}</div><div class="stat-sub">${errors > 0 ? 'needs attention' : 'all healthy'}</div></div>
    <div class="stat-card"><div class="stat-label">Uptime</div><div class="stat-value orange">${uptime}</div><div class="stat-sub">page session</div></div>`
}

function renderAgentsPanel(): void {
  const container = document.getElementById('agents-view-container')
  if (container) renderAgentsView(container)
}

function renderDashboard(): void {
  if (currentView !== 'dashboard') return
  const statsRow = document.getElementById('stats-row')
  if (!statsRow) return
  const sessions = Object.values(sessionsStore.sessions)
  const active = sessions.filter(s => s.status === 'active').length
  const totalTurns = sessions.reduce((sum, s) => sum + (s.turn_count || 0), 0)
  const errors = sessions.filter(s => s.status === 'error' || s.status === 'disappeared' || s.status === 'unknown').length
  const uptime = formatUptime(Date.now() - pageLoadTime)
  const avgTurns = sessions.length > 0 ? (totalTurns / sessions.length).toFixed(1) : '0.0'

  statsRow.innerHTML = `
    <div class="stat-card"><div class="stat-label">Active Sessions</div><div class="stat-value green">${active}</div><div class="stat-sub">${sessions.length} total monitored</div></div>
    <div class="stat-card"><div class="stat-label">Total Turns</div><div class="stat-value">${totalTurns}</div><div class="stat-sub">avg ${avgTurns} per session</div></div>
    <div class="stat-card"><div class="stat-label">Errors</div><div class="stat-value${errors > 0 ? ' magenta' : ''}">${errors}</div><div class="stat-sub">${errors > 0 ? 'needs attention' : 'all healthy'}</div></div>
    <div class="stat-card"><div class="stat-label">Uptime</div><div class="stat-value orange">${uptime}</div><div class="stat-sub">page session</div></div>`

  // Recent activity
  const recent = document.getElementById('recent-activity')
  if (!recent) return
  const sorted = [...sessions].sort((a, b) => b.last_event_time_ms - a.last_event_time_ms).slice(0, 6)
  if (sorted.length === 0) {
    recent.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>'
    return
  }
  recent.innerHTML = sorted.map(s => {
    const statusColor = s.status === 'active' ? 'var(--success)' : s.status === 'idle' ? 'var(--warning)' : s.status === 'stopped' ? 'var(--text-disabled)' : 'var(--danger)'
    const glow = s.status === 'active' ? 'box-shadow:0 0 6px var(--success-glow)' : ''
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--card-bg);border:1px solid var(--border-hairline);box-shadow:var(--pixel-shadow) var(--pixel-border-dark);margin-bottom:var(--space-2)">
      <span style="width:8px;height:8px;flex-shrink:0;background:${statusColor};${glow}"></span>
      <span style="font-size:13px;color:var(--text-secondary);flex:1"><strong style="color:var(--text-primary);font-weight:600">${esc(s.agent_type)}</strong> · ${esc(s.session_title || s.agent_session_id)}${s.turn_count ? ' — Turn ' + s.turn_count : ''}</span>
      <span style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)">${formatRelTime(s.last_event_time_ms)}</span>
    </div>`
  }).join('')
}

/** Format an elapsed ms duration as a human-readable uptime string. */
function formatUptime(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** Format a timestamp as relative time for the recent activity list. */
function formatRelTime(ms: number | null | undefined): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 0) return ''
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function esc(s: string): string {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
/** Quick fingerprint of session fields shown in the detail panel. */
function hashSessionForDetail(s: unknown): string {
  if (!s || typeof s !== 'object') return ''
  const r = s as Record<string, unknown>
  const parts = [r.status, r.turn_count, r.pid, r.cwd, r.cpu_percent, r.memory_mb,
    r.terminal, r.session_title, r.agent_output, r.last_event_time_ms,
    r.last_hook_event, r.last_event_type,
    JSON.stringify(r.turns), JSON.stringify(r.story_id)]
  return parts.map(p => p ?? '').join('|')
}

// ── Auth store wiring ──
authStore.subscribe(() => {
  if (authStore.authed && !sse) {
    connectSSE()
    // Hierarchy arrives via SSE initial snapshot; no extra REST call needed.
  } else if (!authStore.authed && sse) {
    sse.close(); sse = null
  }
})

renderShell()
wireUnauthorizedAutoLogout()

restoreSession(() => {
  if (authStore.authed) {
    showApp()
    // SSE already connected by authStore subscriber (line ~498).
  }
})