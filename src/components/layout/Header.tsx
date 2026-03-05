import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme'
import { useAuth } from '../../app/AuthContext'
import { logoutUser } from '../../services/auth.service'
import {
    Bell, Sun, Moon, Globe, Menu,
    LogOut, User, ChevronDown, Building2,
} from 'lucide-react'
import type { Language } from '../../types'

interface HeaderProps {
    onMenuClick: () => void
    isSidebarCollapsed: boolean
}

function getInitials(user: { email: string | null; displayName: string | null } | null): string {
    if (!user) return 'U'
    if (user.displayName) {
        return user.displayName
            .split(' ')
            .slice(0, 2)
            .map(n => n[0])
            .join('')
            .toUpperCase()
    }
    return (user.email?.[0] ?? 'U').toUpperCase()
}

export default function Header({ onMenuClick, isSidebarCollapsed }: HeaderProps) {
    const { t, i18n } = useTranslation()
    const { isDark, toggleDark } = useTheme()
    const { user, schoolName, role } = useAuth()
    const navigate = useNavigate()

    const [userMenuOpen, setUserMenuOpen] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)
    const [notifCount] = useState(3)
    const userMenuRef = useRef<HTMLDivElement>(null)

    const currentLang: Language = (i18n.language?.slice(0, 2) ?? 'fr') as Language
    const otherLang: Language = currentLang === 'fr' ? 'en' : 'fr'
    const initials = getInitials(user ?? null)
    const displayEmail = user?.email ?? ''
    const displayName = user?.displayName ?? displayEmail.split('@')[0]

    // Translate role label
    const roleLabel = role === 'admin' ? t('dashboard.roleAdmin') : t('dashboard.roleTeacher')

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setUserMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
            await logoutUser()
            navigate('/', { replace: true })
        } catch (err) {
            console.error('[Header] Logout error:', err)
        } finally {
            setLoggingOut(false)
            setUserMenuOpen(false)
        }
    }

    return (
        <header
            className={[
                'fixed top-0 right-0 z-20 flex items-center justify-between',
                'h-14 px-4 bg-white dark:bg-slate-900',
                'border-b border-gray-200 dark:border-slate-800',
                'transition-all duration-200',
                isSidebarCollapsed ? 'lg:left-[64px]' : 'lg:left-[240px]',
                'left-0',
            ].join(' ')}
        >
            {/* ── Left: hamburger + school name ─────────────────── */}
            <div className="flex items-center gap-3">
                <button
                    className="icon-btn lg:hidden"
                    onClick={onMenuClick}
                    aria-label={t('nav.dashboard')}
                >
                    <Menu size={20} />
                </button>

                <div className="hidden sm:flex items-center gap-2">
                    {schoolName && (
                        <div className="w-5 h-5 text-indigo-500 opacity-60">
                            <Building2 size={16} />
                        </div>
                    )}
                    <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 leading-tight">
                            {schoolName ?? 'PADocs'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 capitalize">
                            {roleLabel} {t('header.console')}
                        </p>
                    </div>
                </div>

                <div className="sm:hidden">
                    <p className="text-sm font-bold text-gray-800 dark:text-white">
                        {schoolName ?? 'PADocs'}
                    </p>
                </div>
            </div>

            {/* ── Right: actions ────────────────────────────────── */}
            <div className="flex items-center gap-1">

                {/* Language toggle */}
                <button
                    className="btn-ghost h-8 px-2 text-xs font-semibold tracking-wide"
                    onClick={() => i18n.changeLanguage(otherLang)}
                    aria-label={t('header.language')}
                    title={t('header.language')}
                >
                    <Globe size={15} />
                    <span className="uppercase">{otherLang}</span>
                </button>

                {/* Dark mode toggle */}
                <button
                    className="icon-btn h-8 w-8"
                    onClick={toggleDark}
                    aria-label={isDark ? t('header.lightMode') : t('header.darkMode')}
                    title={isDark ? t('header.lightMode') : t('header.darkMode')}
                >
                    {isDark ? <Sun size={17} /> : <Moon size={17} />}
                </button>

                {/* Notifications */}
                <button
                    className="icon-btn h-8 w-8 relative"
                    aria-label={t('header.notifications')}
                    title={t('header.notifications')}
                >
                    <Bell size={17} />
                    {notifCount > 0 && (
                        <span
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center"
                        >
                            {notifCount}
                        </span>
                    )}
                </button>

                <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 mx-1" />

                {/* User avatar dropdown */}
                <div ref={userMenuRef} className="relative">
                    <button
                        className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        onClick={() => setUserMenuOpen(v => !v)}
                        aria-haspopup="true"
                        aria-expanded={userMenuOpen}
                        aria-label={t('header.profile')}
                    >
                        <div className="avatar text-xs">{initials}</div>
                        <span className="hidden md:block text-xs font-medium text-gray-700 dark:text-slate-300 max-w-[120px] truncate">
                            {displayName}
                        </span>
                        <ChevronDown
                            size={14}
                            className={`text-gray-500 transition-transform duration-150 ${userMenuOpen ? 'rotate-180' : ''}`}
                        />
                    </button>

                    {userMenuOpen && (
                        <div className="dropdown-menu" role="menu" aria-label={t('header.profile')}>
                            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
                                <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 truncate">
                                    {displayName}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{displayEmail}</p>
                                {role && (
                                    <span className="badge badge-primary mt-1 capitalize">{roleLabel}</span>
                                )}
                            </div>

                            <button className="dropdown-item" role="menuitem">
                                <User size={15} />
                                {t('header.profile')}
                            </button>

                            <div className="divider" />

                            <button
                                className="dropdown-item danger"
                                role="menuitem"
                                onClick={handleLogout}
                                disabled={loggingOut}
                            >
                                <LogOut size={15} />
                                {loggingOut ? t('common.loading') : t('header.logout')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
