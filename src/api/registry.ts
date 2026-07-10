import { request } from './client'

export interface Runtime {
  id: number
  user_id: string
  device_id: string
  name: string
  hostname: string
  default_workspace_root: string
  last_seen_at: number
  created_at: number
  updated_at: number
}

export interface Capability {
  id: number
  runtime_id: number
  provider: string
  binary_path: string
  version: string
  available: boolean
  auth_status: string
  auth_message: string
  hook_installed: boolean
  hook_status: string
  last_scanned_at: number
  created_at: number
  updated_at: number
}

export interface AgentProfile {
  id: number
  user_id: string
  workspace_id: number
  runtime_id: number
  provider: string
  name: string
  description: string
  default_cwd: string
  model: string
  permission_mode: string
  system_prompt: string
  status: string
  created_by: number
  created_at: number
  updated_at: number
}

export interface StoryRun {
  id: number
  story_id: number
  agent_profile_id: number
  runtime_id: number
  provider: string
  session_key: string
  agent_session_id: string
  exec_id: string
  prompt: string
  effective_prompt: string
  permission_mode: string
  cwd: string
  session_title: string
  status: string
  error: string
  created_by: number
  created_at: number
  started_at: number
  finished_at: number
}

export interface ProfileInput {
  name: string
  description?: string
  provider: string
  default_cwd?: string
  model?: string
  permission_mode?: string
  system_prompt?: string
}

export interface RunInput {
  prompt?: string
  permission_mode?: string
  cwd?: string
  new_session?: boolean
  session_title?: string
}

export interface RunResponse {
  run_id: number
  story_id: number
  agent_profile_id: number
  session_key: string
  agent_session_id: string
  exec_id: string
  status: string
}

export interface ScanResponse {
  runtime: Runtime
  capabilities: Capability[]
  agents?: AgentProfile[]
}

// ── Runtime & Capability ──

export function getCurrentRuntime(): Promise<Runtime> {
  return request<Runtime>('/api/agent-runtimes/current')
}

export function scanCapabilities(workspaceId?: number): Promise<ScanResponse> {
  return request<ScanResponse>('/api/agent-runtimes/scan', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId }),
  })
}

export function listCapabilities(): Promise<Capability[]> {
  return request<Capability[]>('/api/agent-capabilities')
}

// ── Agent Profiles ──

export function listProfiles(workspaceId: number): Promise<AgentProfile[]> {
  return request<AgentProfile[]>(`/api/workspaces/${workspaceId}/agent-profiles`)
}

export function createProfile(workspaceId: number, input: ProfileInput): Promise<AgentProfile> {
  return request<AgentProfile>(`/api/workspaces/${workspaceId}/agent-profiles`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function getProfile(id: number): Promise<AgentProfile> {
  return request<AgentProfile>(`/api/agent-profiles/${id}`)
}

export function updateProfile(id: number, input: Partial<ProfileInput>): Promise<AgentProfile> {
  return request<AgentProfile>(`/api/agent-profiles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteProfile(id: number): Promise<void> {
  return request<void>(`/api/agent-profiles/${id}`, { method: 'DELETE' })
}

// ── Story Binding & Runs ──

export function bindAgentToStory(storyId: number, agentProfileId: number): Promise<void> {
  return request<void>(`/api/stories/${storyId}/bind-agent`, {
    method: 'POST',
    body: JSON.stringify({ agent_profile_id: agentProfileId }),
  })
}

export function createRun(storyId: number, input: RunInput): Promise<RunResponse> {
  return request<RunResponse>(`/api/stories/${storyId}/runs`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listRuns(storyId: number): Promise<StoryRun[]> {
  return request<StoryRun[]>(`/api/stories/${storyId}/runs`)
}

export function cancelRun(storyId: number, runId: number): Promise<void> {
  return request<void>(`/api/stories/${storyId}/runs/${runId}/cancel`, { method: 'POST' })
}
