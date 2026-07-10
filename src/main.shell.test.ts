import { beforeEach, describe, expect, it, vi } from 'vitest'

// localStorage stub used when jsdom does not provide a working implementation.
function stubLocalStorage(): void {
  let store: Record<string, string> = {}
  const ls: Storage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
  vi.stubGlobal('localStorage', ls)
}

describe('App shell', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    stubLocalStorage()
  })

  it('renders without top-nav, with Agents nav, without sidebar-status, with dashboard-status', async () => {
    // Dynamic import ensures DOM (#app) and localStorage are set up before module side effects run.
    const { renderAppShellForTest } = await import('./main')
    renderAppShellForTest()

    // No more top navigation bar
    expect(document.querySelector('.top-nav')).toBeNull()

    // Sidebar has Agents nav entry (side-nav-item with data-view="agents")
    expect(document.querySelector('[data-view="agents"]')).not.toBeNull()

    // Sidebar status section removed
    expect(document.querySelector('#sidebar-daemon')).toBeNull()

    // Dashboard has status grid
    expect(document.querySelector('#dashboard-status')).not.toBeNull()
  })

  it('sidebar has Sessions, Dashboard, and Agents nav entries', async () => {
    const { renderAppShellForTest } = await import('./main')
    renderAppShellForTest()

    const sidebar = document.getElementById('sidebar')
    expect(sidebar).not.toBeNull()

    // Check all three primary nav items exist in sidebar
    expect(sidebar!.querySelector('[data-view="sessions"]')).not.toBeNull()
    expect(sidebar!.querySelector('[data-view="dashboard"]')).not.toBeNull()
    expect(sidebar!.querySelector('[data-view="agents"]')).not.toBeNull()
  })
})
