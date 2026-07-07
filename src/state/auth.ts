import { Store } from './store'
import type { User } from '../api/client'

// Auth state. The token lives in an HttpOnly cookie (managed by the browser),
// so this store only tracks the current user (for display) and auth status.
// No token is stored in JS — that's the whole point of the cookie approach
// (XSS cannot steal it).
class AuthStore extends Store {
  user: User | null = null
  authed = false

  setUser(user: User | null): void {
    this.user = user
    this.authed = user !== null
    this.flushSync()  // immediate — login/logout must update UI synchronously
  }

  clear(): void {
    this.user = null
    this.authed = false
    this.flushSync()
  }
}

export const authStore = new AuthStore()
