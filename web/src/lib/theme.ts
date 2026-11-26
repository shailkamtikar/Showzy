import { useCallback, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'showzy-theme'

function read(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return attr === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* storage may be blocked; theme still applies for this session */
    }
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
