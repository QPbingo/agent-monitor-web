import { sessionsStore, type Session } from '../state/sessions'
import { hierarchyStore } from '../state/hierarchy'
import { sendInput, cancelExecution } from '../api/agent'
import { renderTimeline } from './timeline'
import { esc, trunc, formatTime } from '../utils/format'
import { toast } from './toast'

// JS-managed hover state so the :hover-equivalent class survives SSE-driven
// innerHTML rebuilds (which would otherwise cause a brief flash as the new DOM
// element lacks the CSS :hover pseudo-class).
let hoveredSessionKey: string | null = null

function initSessionHoverTracking(body: HTMLElement): void {
  // One-time delegated mouseenter/mouseleave on the container.
  if ((body as unknown as { _hoverWired?: boolean })._hoverWired) return
  ;(body as unknown as { _hoverWired?: boolean })._hoverWired = true
  body.addEventListener('mouseover', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.session-row')
    if (!row) return
    const key = row.dataset.key
    if (!key || key === hoveredSessionKey) return
    // Remove from previous
    if (hoveredSessionKey) {
      body.querySelector(`.session-row[data-key="${CSS.escape(hoveredSessionKey)}"]`)?.classList.remove('hover')
    }
    hoveredSessionKey = key
    row.classList.add('hover')
  })
  body.addEventListener('mouseout', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.session-row')
    if (!row) return
    // Only clear when leaving the row entirely
    const related = (e as MouseEvent).relatedTarget as HTMLElement | null
    if (related && row.contains(related)) return
    const key = row.dataset.key
    if (key && key === hoveredSessionKey) {
      row.classList.remove('hover')
      hoveredSessionKey = null
    }
  })
}

// renderSessionList — session rows in left panel (3-line vertical layout)
export function renderSessionList(): void {
  const body = document.getElementById('session-list-body')
  if (!body) return

  // Wire hover tracking once.
  initSessionHoverTracking(body)

  // Show skeleton only while waiting for the initial SSE snapshot.
  const total = Object.keys(sessionsStore.sessions).length
  if (total === 0) {
    if (!sessionsStore.snapshotReceived) {
      body.innerHTML = `<div class="empty-state">
        <h2>Connecting…</h2>
        <p>Waiting for session data from daemon.</p>
        <div style="display:flex;flex-direction:column;gap:6px;width:100%;max-width:280px;margin-top:12px">
          ${Array.from({length: 3}, () => '<div class="skeleton skeleton-row"></div>').join('')}
        </div>
      </div>`
    } else {
      body.innerHTML = `<div class="empty-state">
        <h2>No sessions</h2>
        <p>Start an agent or install hooks to begin monitoring.</p>
      </div>`
    }
    hoveredSessionKey = null
    return
  }

  let topicKeys: Set<string> | null = null
  let storyKey: string | null = null
  if (hierarchyStore.selectedStoryId && hierarchyStore.tree) {
    storyKey = findStorySessionKey(hierarchyStore.selectedStoryId)
    if (!storyKey) {
      body.innerHTML = '<div class="empty-state"><h2>No sessions linked</h2><p>This story is not yet linked to a session.</p></div>'
      hoveredSessionKey = null
      return
    }
  } else if (hierarchyStore.selectedTopicId && hierarchyStore.tree) {
    topicKeys = collectTopicSessionKeys(hierarchyStore.selectedTopicId)
  }

  const list = sessionsStore.filteredList(topicKeys, storyKey)
  if (list.length === 0) {
    body.innerHTML = '<div class="empty-state"><h2>No sessions</h2><p>Select a topic on the left or wait for agent events.</p></div>'
    hoveredSessionKey = null
    return
  }

  body.innerHTML = list.map(s => renderSessionRow(s)).join('')

  // Re-apply hover class after DOM rebuild so the background survives the repaint.
  if (hoveredSessionKey) {
    const hovered = body.querySelector(`.session-row[data-key="${CSS.escape(hoveredSessionKey)}"]`)
    if (hovered) hovered.classList.add('hover')
  }

  body.querySelectorAll('.session-row').forEach(row => {
    const selectRow = () => {
      body.querySelectorAll('.session-row').forEach(r => { r.classList.remove('selected'); r.setAttribute('aria-selected', 'false') })
      row.classList.add('selected')
      row.setAttribute('aria-selected', 'true')
      const key = (row as HTMLElement).dataset.key || ''
      sessionsStore.selectedSessionKey = key
      renderSessionDetail()
    }
    row.addEventListener('click', selectRow)
    row.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent
      if (ke.key === 'Enter' || ke.key === ' ') { ke.preventDefault(); selectRow() }
      if (ke.key === 'ArrowDown') {
        ke.preventDefault()
        const next = (row as HTMLElement).nextElementSibling as HTMLElement | null
        if (next?.classList.contains('session-row')) { (next as HTMLElement).focus() }
      }
      if (ke.key === 'ArrowUp') {
        ke.preventDefault()
        const prev = (row as HTMLElement).previousElementSibling as HTMLElement | null
        if (prev?.classList.contains('session-row')) { (prev as HTMLElement).focus() }
      }
    })
  })
}

function statusDotClass(status: string): string {
  if (status === 'active') return 'dot-active'
  if (status === 'idle') return 'dot-idle'
  if (status === 'error' || status === 'disappeared' || status === 'unknown') return 'dot-error'
  return ''
}

function renderSessionRow(s: Session): string {
  const key = esc(s.session_key)
  const sel = sessionsStore.selectedSessionKey === s.session_key ? ' selected' : ''
  const dotCls = statusDotClass(s.status)
  const dot = dotCls ? `<span class="status-dot ${dotCls}">●</span>` : ''
  const addr = s.terminal || s.cwd || '-'
  const pidStr = s.pid ? ` · PID ${s.pid}` : ''
  const timeStr = formatTime(s.last_event_time_ms)
  return `<div class="session-row${sel}" data-key="${key}" role="option" aria-selected="${sel !== ''}" tabindex="0">
    <div class="session-key">${esc(trunc(key, 24))}</div>
    <div class="session-agent">${esc(s.agent_type)} · ${esc(trunc(addr, 28))}</div>
    <div class="session-time">${dot}${esc(s.status)}${pidStr}${timeStr ? ' · ' + esc(timeStr) : ''}</div>
  </div>`
}

// renderSessionDetail — right detail panel with labeled sections
export function renderSessionDetail(): void {
  const panel = document.getElementById('session-detail-panel')
  if (!panel) return
  if (!sessionsStore.selectedSessionKey) {
    panel.innerHTML = '<div class="empty-state" id="detail-empty"><h3>Select a session</h3><p>Choose a session from the list to view its timeline and details.</p></div>'
    return
  }
  const s = sessionsStore.sessions[sessionsStore.selectedSessionKey]
  if (!s) {
    panel.innerHTML = '<div class="empty-state"><h3>Session not found</h3></div>'
    return
  }

  // Preserve scroll position and input draft across SSE-driven rebuilds.
  const scrollTop = panel.scrollTop
  const draftKey = 'detail-input-' + esc(s.session_key)
  const existingInput = document.getElementById(draftKey) as HTMLInputElement | null
  const draftValue = existingInput ? existingInput.value : (sessionsStore.draftInputs[s.session_key] || '')

  const hasTurns = s.turns && s.turns.length > 0
  const isError = s.status === 'error' || s.status === 'disappeared' || s.status === 'unknown'
  const dotCls = statusDotClass(s.status)
  const dot = dotCls ? `<span class="status-dot ${dotCls}">●</span>` : ''
  const statusColor = s.status === 'active' ? 'var(--neon-green)' : s.status === 'idle' ? 'var(--neon-orange)' : s.status === 'stopped' ? 'var(--text-tertiary)' : 'var(--neon-magenta)'
  const agentAddr = s.terminal || s.cwd || '-'
  const heartbeat = formatTime(s.last_event_time_ms)

  panel.innerHTML = `<div class="session-detail-content">
    <div class="detail-header">SESSION: ${esc(trunc(s.session_key, 24))}</div>
    ${isError ? renderErrorAlert(s) : ''}
    <div class="detail-section">
      <div class="detail-label">Agent</div>
      <div class="detail-value">${esc(s.agent_type)} · PID ${s.pid || '—'} · ${esc(trunc(agentAddr, 36))}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">Status</div>
      <div class="detail-value" style="border-left-color:${statusColor}">
        ${dot} ${esc(s.status)} · ${heartbeat ? 'last event ' + esc(heartbeat) : 'no events yet'}
      </div>
    </div>
    ${hasTurns ? '<div class="detail-section"><div class="detail-label">Timeline</div>' + renderTimeline(s.turns!, s.session_key) + '</div>' : ''}
    <div class="session-input-row">
      <input type="text" id="detail-input-${esc(s.session_key)}" placeholder="Send input to this session...">
      <button class="btn btn-primary" data-send="${esc(s.session_key)}">SEND</button>
    </div>
    <div class="detail-actions">
      <button class="btn btn-ghost" data-cancel="${esc(s.session_key)}">CANCEL</button>
      <button class="btn btn-danger" data-kill="${esc(s.session_key)}">KILL</button>
    </div>
  </div>`

  const sendBtn = panel.querySelector(`[data-send="${esc(s.session_key)}"]`)
  if (sendBtn) {
    sendBtn.addEventListener('click', () => onSendDetail(s.session_key))
  }
  const inputEl = panel.querySelector('input') as HTMLInputElement | null
  if (inputEl) {
    inputEl.onkeydown = (e) => { if (e.key === 'Enter') onSendDetail(s.session_key) }
  }
  const cancelBtn = panel.querySelector(`[data-cancel="${esc(s.session_key)}"]`)
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => onCancelDetail(s))
  }
  const killBtn = panel.querySelector(`[data-kill="${esc(s.session_key)}"]`)
  if (killBtn) {
    killBtn.addEventListener('click', () => onKillDetail(s))
  }
  // Restore draft input value and scroll position after rebuilding innerHTML.
  const restoredInput = document.getElementById(draftKey) as HTMLInputElement | null
  if (restoredInput && draftValue) restoredInput.value = draftValue
  panel.scrollTop = scrollTop
}

function renderErrorAlert(s: Session): string {
  return `<div class="error-alert">
    <div class="error-alert-title">${s.status === 'error' ? 'Error' : 'Process disconnected'}</div>
    <div class="error-alert-detail">${esc(s.agent_output || 'No additional details.')}</div>
  </div>`
}

async function onSendDetail(key: string): Promise<void> {
  const safeKey = esc(key)
  const input = document.getElementById('detail-input-' + safeKey) as HTMLInputElement | null
  if (!input) return
  const text = input.value.trim()
  if (!text) return
  try {
    await sendInput(key, text)
    input.value = ''
    toast.ok('Sent')
  } catch (e) {
    toast.error('Send failed')
  }
}

async function onCancelDetail(s: Session): Promise<void> {
  try {
    await cancelExecution(s.agent_type, s.agent_session_id)
    toast.info('Execution cancelled')
  } catch (e) {
    toast.error('Cancel failed: ' + ((e as Error).message || 'unknown'))
  }
}

async function onKillDetail(s: Session): Promise<void> {
  try {
    await cancelExecution(s.agent_type, s.agent_session_id)
    toast.warn('Kill signal sent')
  } catch (e) {
    toast.error('Kill failed: ' + ((e as Error).message || 'unknown'))
  }
}

export function bindSessionHandlers(): void {
  // Delegated handlers are set up by renderSessionList / renderSessionDetail.
}

function findStorySessionKey(storyId: number): string | null {
  for (const ws of hierarchyStore.tree?.workspaces ?? []) {
    for (const proj of ws.projects ?? []) {
      for (const topic of proj.topics ?? []) {
        for (const story of topic.stories ?? []) {
          if (story.id === storyId) return story.session_key || null
        }
      }
    }
  }
  return null
}

function collectTopicSessionKeys(topicId: number): Set<string> {
  const keys = new Set<string>()
  for (const ws of hierarchyStore.tree?.workspaces ?? []) {
    for (const proj of ws.projects ?? []) {
      for (const topic of proj.topics ?? []) {
        if (topic.topic.id === topicId) {
          for (const story of topic.stories ?? []) {
            if (story.session_key) keys.add(story.session_key)
          }
        }
      }
    }
  }
  return keys
}
