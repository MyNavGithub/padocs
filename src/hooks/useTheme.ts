import { useEffect, useCallback } from 'react'
import { useLocalStorage, useMediaQuery } from './useLocalStorage'

type ThemeMode = 'light' | 'dark' | 'system'

export function useTheme() {
    const [theme, setTheme] = useLocalStorage<ThemeMode>('padocs-theme', 'system')
    const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')

    const isDark = theme === 'dark' || (theme === 'system' && prefersDark)

    const applyTheme = useCallback((dark: boolean) => {
        const root = document.documentElement
        if (dark) {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
    }, [])

    useEffect(() => {
        applyTheme(isDark)
    }, [isDark, applyTheme])

    const toggleDark = useCallback(() => {
        setTheme(isDark ? 'light' : 'dark')
    }, [isDark, setTheme])

    return { theme, setTheme, isDark, toggleDark }
}
