import { sendPrompt, cancelExecution, createSession, resumeSession, renameSession, getDiff, type DiffResponse } from '../api/agent'
import { agentStore, type Execution } from '../state/agent'
import { hierarchyStore } from '../state/hierarchy'
import { sessionsStore } from '../state/sessions'
import { esc, formatPayloadDisplay } from '../utils/format'
import { toast } from './toast'

// renderAgentPanel mounts the agent control panel into #agent-panel (created
// by the shell). Replaces the old inline-style version with the design system.
//
// Layout:
//   1. New Session — agent type, permission mode, cwd, model → createSession()
//   2. Active Session — session id (+ resume/rename) + timeout + prompt → sendPrompt()
//   3. Output — streamed execution messages / history (renderExecHistory)
//   4. Recent Sessions — sdk-sourced sessions from sessionsStore, click to load
//      (renderAgentSessionList, kept in sync via SSE through main.ts)
export function renderAgentPanel(): void {
  const host = document.getElementById('agent-panel')
  if (!host) return
  host.innerHTML = `
    <div class="agent-panel-header" id="agent-panel-header">
      <span>Agent Control</span>
      <button class="close-drawer" id="agent-close" aria-label="Close">✕</button>
    </div>
    <div class="agent-panel-body">
      <div class="sidebar-label">New Session</div>
      <div class="agent-panel-row">
        <select id="agent-select" aria-label="Agent type">
          <option value="claude">Claude Code</option>
          <option value="opencode">OpenCode</option>
          <option value="codex">Codex</option>
        </select>
        <select id="agent-permission" aria-label="Permission mode" title="Permission mode for tool use">
          <option value="">Default (may prompt)</option>
          <option value="acceptEdits">Accept Edits</option>
          <option value="bypassPermissions">Bypass (autonomous)</option>
          <option value="plan">Plan only</option>
          <option value="readOnly">Read only</option>
        </select>
      </div>
      <div class="agent-panel-row">
        <input id="agent-cwd" type="text" placeholder="Working directory (cwd)">
        <input id="agent-model" type="text" placeholder="Model (optional)">
      </div>
      <div class="agent-panel-row">
        <select id="agent-topic" aria-label="Topic to attach this session to"></select>
      </div>
      <div class="agent-panel-row">
        <input id="agent-story-name" type="text" placeholder="Story name (optional, only used with a topic)">
      </div>
      <div class="agent-panel-row">
        <button id="agent-new-session" class="btn btn-secondary" style="flex:1">+ New Session</button>
      </div>

      <div class="sidebar-label">Active Session</div>
      <div class="agent-panel-row">
        <input id="agent-session-id" type="text" placeholder="Session ID (blank = auto-create, no cwd)">
        <select id="agent-timeout" aria-label="Timeout">
          <option value="5">5m</option>
          <option value="10" selected>10m</option>
          <option value="30">30m</option>
          <option value="60">1h</option>
          <option value="120">2h</option>
        </select>
      </div>
      <div class="agent-panel-row">
        <button id="agent-resume" class="btn btn-ghost" style="flex:1">Resume</button>
        <button id="agent-rename" class="btn btn-ghost" style="flex:1">Rename</button>
      </div>
      <textarea id="agent-prompt" class="agent-prompt" rows="3" placeholder="Enter prompt…"></textarea>
      <div class="agent-actions">
        <button id="agent-send" class="btn btn-primary">Send</button>
        <button id="agent-cancel" class="btn btn-secondary">Cancel</button>
        <span id="agent-status" class="agent-status"></span>
      </div>
      <div id="agent-output" class="agent-output"></div>

      <div class="sidebar-label">Diff</div>
      <div class="agent-panel-row">
        <button id="agent-load-diff" class="btn btn-ghost" style="flex:1">Load Diff</button>
      </div>
      <div id="agent-diff" class="agent-diff"></div>

      <div class="sidebar-label">Recent Sessions</div>
      <div id="agent-session-list" class="agent-session-list"></div>
    </div>`

  const closeBtn = document.getElementById('agent-close')
  if (closeBtn) closeBtn.onclick = () => { host.style.display = 'none' }

  const sendBtn = document.getElementById('agent-send')
  if (sendBtn) sendBtn.onclick = onSend
  const cancelBtn = document.getElementById('agent-cancel')
  if (cancelBtn) cancelBtn.onclick = onCancel
  const newSessionBtn = document.getElementById('agent-new-session')
  if (newSessionBtn) newSessionBtn.onclick = onNewSession
  const resumeBtn = document.getElementById('agent-resume')
  if (resumeBtn) resumeBtn.onclick = onResume
  const renameBtn = document.getElementById('agent-rename')
  if (renameBtn) renameBtn.onclick = onRename
  const loadDiffBtn = document.getElementById('agent-load-diff')
  if (loadDiffBtn) loadDiffBtn.onclick = onLoadDiff

  renderAgentSessionList()
  renderAgentTopicOptions()
}

function agentTypeValue(): string {
  return (document.getElementById('agent-select') as HTMLSelectElement)?.value ?? 'claude'
}
function sessionIdValue(): string {
  return (document.getElementById('agent-session-id') as HTMLInputElement)?.value.trim() ?? ''
}

async function onNewSession(): Promise<void> {
  const agentType = agentTypeValue()
  const cwd = (document.getElementById('agent-cwd') as HTMLInputElement)?.value.trim() ?? ''
  const model = (document.getElementById('agent-model') as HTMLInputElement)?.value.trim() ?? ''
  const permissionMode = (document.getElementById('agent-permission') as HTMLSelectElement)?.value ?? ''
  const topicId = topicIdValue()
  const storyName = storyNameValue()
  const status = document.getElementById('agent-status')
  if (status) status.textContent = 'Creating…'
  try {
    const res = await createSession(agentType, {
      cwd, model, permissionMode,
      workspaceId: hierarchyStore.selectedWorkspaceId,
      topicId, storyName,
    })
    const sidInput = document.getElementById('agent-session-id') as HTMLInputElement | null
    if (sidInput) sidInput.value = res.id
    if (status) status.textContent = ''
    toast.ok(`Session created${cwd ? ' in ' + cwd : ''}`)
  } catch (e) {
    if (status) status.textContent = 'Error'
    toast.error('Create session failed: ' + ((e as Error).message || 'unknown'))
  }
}

async function onResume(): Promise<void> {
  const agentType = agentTypeValue()
  const sessionId = sessionIdValue()
  if (!sessionId) {
    toast.warn('Session ID is required to resume')
    return
  }
  const status = document.getElementById('agent-status')
  if (status) status.textContent = 'Resuming…'
  try {
    await resumeSession(agentType, sessionId)
    if (status) status.textContent = ''
    toast.ok('Session resumed — ready to prompt')
  } catch (e) {
    if (status) status.textContent = 'Error'
    toast.error('Resume failed: ' + ((e as Error).message || 'unknown'))
  }
}

async function onRename(): Promise<void> {
  const agentType = agentTypeValue()
  const sessionId = sessionIdValue()
  if (!sessionId) {
    toast.warn('Session ID is required to rename')
    return
  }
  const title = window.prompt('New session title:')
  if (!title) return
  try {
    await renameSession(agentType, sessionId, title)
    toast.ok('Session renamed')
  } catch (e) {
    toast.error('Rename failed: ' + ((e as Error).message || 'unknown'))
  }
}

async function onSend(): Promise<void> {
  const agentType = agentTypeValue()
  const sessionId = sessionIdValue()
  const promptEl = document.getElementById('agent-prompt') as HTMLTextAreaElement | null
  const prompt = promptEl?.value.trim() ?? ''
  const timeoutMin = parseInt((document.getElementById('agent-timeout') as HTMLSelectElement)?.value ?? '10') || 10
  if (!prompt) {
    toast.warn('Prompt is empty')
    return
  }
  const status = document.getElementById('agent-status')
  if (status) status.textContent = 'Running…'
  try {
    const res = await sendPrompt(agentType, sessionId, prompt, timeoutMin, hierarchyStore.selectedWorkspaceId, topicIdValue(), storyNameValue())
    if (promptEl) promptEl.value = ''
    const sidInput = document.getElementById('agent-session-id') as HTMLInputElement | null
    if (sidInput && !sessionId) sidInput.value = res.session_id
    agentStore.setCurrent(res.exec_id)
    toast.ok('Execution started')
  } catch (e) {
    if (status) status.textContent = 'Error'
    toast.error('Send failed: ' + ((e as Error).message || 'unknown'))
  }
}

async function onCancel(): Promise<void> {
  const agentType = agentTypeValue()
  const sessionId = sessionIdValue()
  const status = document.getElementById('agent-status')
  if (status) status.textContent = 'Cancelling…'
  try {
    await cancelExecution(agentType, sessionId, agentStore.currentExecId ?? undefined)
    toast.info('Cancelled')
  } catch (e) {
    if (status) status.textContent = 'Error'
    toast.error('Cancel failed: ' + ((e as Error).message || 'unknown'))
  }
}

// renderExecHistory draws the current execution's messages, or a clickable
// list of past executions. A "back" link returns to the list view (#20).
export function renderExecHistory(): void {
  const output = document.getElementById('agent-output')
  if (!output) return
  if (agentStore.executions.length === 0) {
    output.classList.remove('is-open')
    output.innerHTML = ''
    return
  }
  output.classList.add('is-open')
  const current = agentStore.executions.find((e) => e.id === agentStore.currentExecId)
  // Update the status indicator based on execution state.
  const statusEl = document.getElementById('agent-status')
  if (current && statusEl) {
    const labels: Record<string, string> = { completed: 'Completed', error: 'Error', cancelled: 'Cancelled', running: 'Running…' }
    statusEl.textContent = labels[current.status] || current.status
  }
  if (current) {
    output.innerHTML = renderExecutionMessages(current)
    const back = output.querySelector('[data-action="exec-back"]')
    if (back) {
      ;(back as HTMLElement).onclick = () => {
        agentStore.setCurrent(null)
      }
    }
  } else {
    output.innerHTML = agentStore.executions
      .map((e) => `<div class="exec-row" data-exec="${esc(e.id)}">${statusIcon(e.status)} <b>${esc(e.agent_type ?? '')}</b> <span class="exec-preview">${esc((e.prompt ?? '').slice(0, 60))}</span></div>`)
      .join('')
    output.querySelectorAll('[data-exec]').forEach((el) => {
      ;(el as HTMLElement).onclick = () => {
        agentStore.setCurrent((el as HTMLElement).dataset.exec ?? null)
      }
    })
  }
}

// renderAgentSessionList draws the list of web/SDK-initiated agent sessions
// (source === 'sdk') from sessionsStore — the same store the monitoring
// timeline reads from, so this list is always in sync with what's actually
// tracked. Clicking a row loads its agent type / session id / cwd into the
// "Active Session" fields so the user can continue that conversation.
export function renderAgentSessionList(): void {
  const host = document.getElementById('agent-session-list')
  if (!host) return
  const sdkSessions = Object.values(sessionsStore.sessions)
    .filter((s) => s.source === 'sdk')
    .sort((a, b) => b.last_event_time_ms - a.last_event_time_ms)
    .slice(0, 20)

  if (sdkSessions.length === 0) {
    host.innerHTML = '<div class="agent-session-empty">No agent-initiated sessions yet.</div>'
    return
  }
  host.innerHTML = sdkSessions.map((s) => {
    const dot = `<span class="status-dot ${statusDotClass(s.status)}">●</span>`
    return `
    <div class="agent-session-row" data-key="${esc(s.session_key)}" data-agent="${esc(s.agent_type)}" data-sid="${esc(s.agent_session_id)}" data-cwd="${esc(s.cwd ?? '')}">
      ${dot}
      <span class="agent-session-meta">
        <b>${esc(s.agent_type)}</b>
        <span class="agent-session-title">${esc(s.session_title || s.agent_session_id)}</span>
        ${s.cwd ? `<span class="agent-session-cwd">${esc(s.cwd)}</span>` : ''}
      </span>
    </div>`
  }).join('')

  host.querySelectorAll<HTMLElement>('.agent-session-row').forEach((row) => {
    row.onclick = () => loadSessionIntoPanel(row.dataset)
  })
}

// renderAgentTopicOptions refreshes the "New Session" Topic dropdown from the
// current hierarchy tree. Called on initial mount and whenever hierarchyStore
// updates (main.ts), mirroring renderAgentSessionList's wiring — the New
// Session flow always offers the latest set of topics without a manual page
// refresh.
export function renderAgentTopicOptions(): void {
  const select = document.getElementById('agent-topic') as HTMLSelectElement | null
  if (!select) return
  const tree = hierarchyStore.tree
  const previousValue = select.value
  let html = '<option value="">No topic (auto-collected)</option>'
  if (tree) {
    for (const wsNode of tree.workspaces) {
      for (const projNode of wsNode.projects) {
        for (const topicNode of projNode.topics) {
          html += `<option value="${topicNode.topic.id}">${esc(projNode.project.name)} / ${esc(topicNode.topic.name)}</option>`
        }
      }
    }
  }
  select.innerHTML = html
  if (previousValue && select.querySelector(`option[value="${CSS.escape(previousValue)}"]`)) {
    select.value = previousValue
  } else if (hierarchyStore.selectedTopicId !== null) {
    select.value = String(hierarchyStore.selectedTopicId)
  }
}

function topicIdValue(): number | undefined {
  const raw = (document.getElementById('agent-topic') as HTMLSelectElement)?.value ?? ''
  return raw ? parseInt(raw, 10) : undefined
}

function storyNameValue(): string {
  return (document.getElementById('agent-story-name') as HTMLInputElement)?.value.trim() ?? ''
}

function loadSessionIntoPanel(data: DOMStringMap): void {
  const agentSelect = document.getElementById('agent-select') as HTMLSelectElement | null
  const sidInput = document.getElementById('agent-session-id') as HTMLInputElement | null
  const cwdInput = document.getElementById('agent-cwd') as HTMLInputElement | null
  if (agentSelect && data.agent) agentSelect.value = data.agent
  if (sidInput) sidInput.value = data.sid ?? ''
  if (cwdInput) cwdInput.value = data.cwd ?? ''
  toast.info('Loaded — click Resume before sending if this session is from a previous daemon run')
}

function renderExecutionMessages(e: Execution): string {
  let html = `<div class="exec-back" data-action="exec-back">← Back to history</div>`
  html += `<div class="exec-prompt-label">Prompt: ${esc(e.prompt ?? '')}</div>`
  for (const m of e.messages) {
    if (m.msg_type === 'tool_use' || m.type === 'tool_use') {
      html += `<div class="msg-tool">[${esc(m.tool_name ?? 'tool')}] ${esc(m.tool_input ?? '')}</div>`
    } else if (m.content) {
      html += `<div class="msg-text">${esc(m.content)}</div>`
    } else if (m.error) {
      html += `<div class="msg-error">[ERROR] ${esc(m.error)}</div>`
    }
    if (m.raw_json) {
      html += `<pre class="msg-raw">${esc(formatPayloadDisplay(m.raw_json, String(m.msg_type ?? m.type ?? 'message')))}</pre>`
    }
  }
  if (e.status === 'error' && e.error) {
    html += `<div class="msg-error">[ERROR] ${esc(e.error)}</div>`
  }
  return html
}

// Mirrors ui/sessionCard.ts's statusDotClass so the agent panel's session
// list uses the same green/orange/magenta status convention as the main
// session list.
function statusDotClass(status: string): string {
  if (status === 'active') return 'dot-active'
  if (status === 'idle') return 'dot-idle'
  if (status === 'error' || status === 'disappeared' || status === 'unknown') return 'dot-error'
  return ''
}

function statusIcon(s: Execution['status']): string {
  switch (s) {
    case 'running':
      return '<span class="exec-spin"></span>'
    case 'completed':
      return '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="none" stroke="var(--status-active)" stroke-width="1.5"/><path d="M5 8l2 2 4-4" fill="none" stroke="var(--status-active)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    case 'error':
      return '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="none" stroke="var(--status-error)" stroke-width="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" fill="none" stroke="var(--status-error)" stroke-width="1.5" stroke-linecap="round"/></svg>'
    default:
      return '<svg viewBox="0 0 16 16" width="14" height="14"><rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"/></svg>'
  }
}

async function onLoadDiff(): Promise<void> {
  const agentType = agentTypeValue()
  const sessionId = sessionIdValue()
  const host = document.getElementById('agent-diff')
  if (!host) return
  if (!sessionId) {
    toast.warn('Session ID is required to load a diff')
    return
  }
  host.innerHTML = '<div class="agent-diff-loading">Loading diff…</div>'
  try {
    const res = await getDiff(agentType, sessionId)
    host.innerHTML = renderDiff(res)
  } catch (e) {
    host.innerHTML = ''
    toast.error('Load diff failed: ' + ((e as Error).message || 'unknown'))
  }
}

function renderDiff(res: DiffResponse): string {
  if (!res.is_git_repo) {
    return '<div class="agent-diff-empty">Not a git repository (or session has no working directory).</div>'
  }
  let html = ''
  if (res.stat) html += `<div class="agent-diff-stat">${esc(res.stat)}</div>`
  if (res.untracked_files.length > 0) {
    html += `<div class="agent-diff-untracked">Untracked: ${res.untracked_files.map(esc).join(', ')}</div>`
  }
  if (res.truncated) {
    html += '<div class="agent-diff-truncated">Diff too large to display inline — view it in your editor/terminal.</div>'
  } else if (res.diff) {
    html += `<pre class="agent-diff-body">${colorizeDiff(res.diff)}</pre>`
  } else {
    html += '<div class="agent-diff-empty">No changes.</div>'
  }
  return html
}

function colorizeDiff(diff: string): string {
  return diff
    .split('\n')
    .map((line) => {
      const escaped = esc(line)
      if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="diff-add">${escaped}</span>`
      if (line.startsWith('-') && !line.startsWith('---')) return `<span class="diff-del">${escaped}</span>`
      if (line.startsWith('@@')) return `<span class="diff-hunk">${escaped}</span>`
      return escaped
    })
    .join('\n')
}
