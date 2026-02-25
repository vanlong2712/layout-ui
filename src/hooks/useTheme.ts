import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ui-theme'

// ---- tiny external store so every consumer re-renders together ----

const listeners = new Set<() => void>()

function getSnapshot(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system'
}

function getServerSnapshot(): Theme {
  return 'system'
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function applyThemeToDOM(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.classList.toggle('dark', isDark)
}

function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme)
  applyThemeToDOM(theme)
  listeners.forEach((cb) => cb())
}

// ---- hook ----

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Apply on mount & listen for system preference changes
  useEffect(() => {
    applyThemeToDOM(theme)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (getSnapshot() === 'system') {
        applyThemeToDOM('system')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const cycleTheme = useCallback(() => {
    const order: Array<Theme> = ['light', 'dark', 'system']
    const idx = order.indexOf(theme)
    setTheme(order[(idx + 1) % order.length])
  }, [theme])

  return { theme, setTheme, cycleTheme } as const
}
