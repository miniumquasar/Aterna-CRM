import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@shared/types'

/**
 * Current-user store — the person signed into this session. DID-based
 * identity and VC credential lists were part of the phase-9 experiments and
 * have been removed; session data now comes directly from the SQLite-backed
 * users + sessions tables. If you need the full User record, read it here;
 * if you only need the role for RBAC gating, prefer the `useAuthStore`
 * selector `useAuthStore.use.role()`.
 */
interface UserStoreState {
  user: User | null
  setUser: (user: User | null) => void
  clear: () => void
}

export const useUserStore = create<UserStoreState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      clear: () => set({ user: null })
    }),
    {
      name: 'companies-house-crm.user',
      partialize: (s) => ({ user: s.user })
    }
  )
)
