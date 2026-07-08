import { request } from './client'

export interface PromptResponse {
  exec_id: string
  session_id: string
  session_key?: string
}

export interface CreateSessionOptions {
  cwd?: string
  model?: string
  permissionMode?: string
  title?: string
  workspaceId?: number | null
  topicId?: number
  storyName?: string
}

export interface CreateSessionResponse {
  id: string
  agent_type: string
  title: string
  cwd: string
  created_at: string
  session_key: string
}

// createSession explicitly provisions a session with a working directory,
// model, and permission mode before any prompt is sent. This is the only
// path that lets the agent operate on a specific project directory — the
// auto-create fallback in sendPrompt (no session_id) does not accept cwd.
export async function createSession(
  agentType: string,
  opts: CreateSessionOptions = {},
): Promise<CreateSessionResponse> {
  return request<CreateSessionResponse>(`/api/agent/${agentType}/sessions`, {
    method: 'POST',
    body: JSON.stringify({
      cwd: opts.cwd || undefined,
      model: opts.model || undefined,
      permission_mode: opts.permissionMode || undefined,
      title: opts.title || undefined,
      workspace_id: opts.workspaceId ?? undefined,
      topic_id: opts.topicId || undefined,
      story_name: opts.storyName || undefined,
    }),
  })
}

// resumeSession hydrates the agent SDK's in-memory session record (needed
// after a daemon restart, or when continuing a session created in a
// previous browser tab/session) before sending it a prompt.
export async function resumeSession(agentType: string, sessionId: string): Promise<void> {
  await request<void>(
    `/api/agent/${agentType}/sessions/${encodeURIComponent(sessionId)}/resume`,
    { method: 'POST' },
  )
}

export async function renameSession(agentType: string, sessionId: string, title: string): Promise<void> {
  await request<void>(
    `/api/agent/${agentType}/sessions/${encodeURIComponent(sessionId)}/rename`,
    { method: 'PUT', body: JSON.stringify({ title }) },
  )
}

export async function setPermissionMode(agentType: string, sessionId: string, mode: string): Promise<void> {
  await request<void>(
    `/api/agent/${agentType}/sessions/${encodeURIComponent(sessionId)}/permissions`,
    { method: 'PUT', body: JSON.stringify({ mode }) },
  )
}

// sendPrompt POSTs to the agent prompt endpoint and returns exec_id
// (constraint C). The actual message stream arrives via SSE (global
// broadcast), not this response.
//
// sessionId may be empty: the server auto-creates a session in that case
// (AG-01, see handleAgentSendPrompt in handlers.go) and reports the new
// session_id in the response. Auto-created sessions have no cwd, so prefer
// createSession() first when the agent needs to operate on a project dir.
export async function sendPrompt(
  agentType: string,
  sessionId: string,
  prompt: string,
  timeoutMinutes = 10,
  workspaceId?: number | null,
  topicId?: number,
  storyName?: string,
): Promise<PromptResponse> {
  // The URL path segment is a placeholder when no session exists yet — the
  // server reads session_id from the JSON body, not the path, for the
  // auto-create case (see handleAgentSendPrompt).
  const idSegment = encodeURIComponent(sessionId || 'new')
  return request<PromptResponse>(
    `/api/agent/${agentType}/sessions/${idSegment}/prompt`,
    {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        session_id: sessionId || undefined,
        timeout_minutes: timeoutMinutes,
        workspace_id: workspaceId ?? undefined,
        topic_id: topicId || undefined,
        story_name: storyName || undefined,
      }),
    },
  )
}

export async function cancelExecution(
  agentType: string,
  sessionId: string,
  execId?: string,
): Promise<void> {
  const q = execId ? `?exec_id=${encodeURIComponent(execId)}` : ''
  await request<void>(
    `/api/agent/${agentType}/sessions/${encodeURIComponent(sessionId)}/cancel${q}`,
    { method: 'POST' },
  )
}

// sendInput POSTs web input for a session (replaces the old WS send_input).
export async function sendInput(sessionKey: string, text: string): Promise<void> {
  await request<void>(`/api/sessions/${encodeURIComponent(sessionKey)}/input`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export interface DiffResponse {
  cwd: string
  is_git_repo: boolean
  stat: string
  diff: string
  untracked_files: string[]
  truncated: boolean
}

export async function getDiff(agentType: string, sessionId: string): Promise<DiffResponse> {
  return request<DiffResponse>(
    `/api/agent/${agentType}/sessions/${encodeURIComponent(sessionId)}/diff`,
    { method: 'GET' },
  )
}
