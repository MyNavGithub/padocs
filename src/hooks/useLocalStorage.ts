import { useState, useEffect } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = localStorage.getItem(key)
            return item ? (JSON.parse(item) as T) : initialValue
        } catch {
            return initialValue
        }
    })

    const setValue = (value: T) => {
        try {
            setStoredValue(value)
            localStorage.setItem(key, JSON.stringify(value))
        } catch {
            console.warn(`Could not save ${key} to localStorage`)
        }
    }

    return [storedValue, setValue]
}

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

    useEffect(() => {
        const mq = window.matchMedia(query)
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [query])

    return matches
}
