import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    LayoutDashboard, FileText, FolderOpen, Settings,
    ChevronLeft, ChevronRight, X, Users,
} from 'lucide-react'
import { useAuth } from '../../app/AuthContext'

interface SidebarProps {
    isOpen: boolean
    isCollapsed: boolean
    onClose: () => void
    onToggleCollapse: () => void
}

interface NavItem {
    label: string
    path: string
    icon: React.ReactNode
    adminOnly?: boolean
}

export default function Sidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: SidebarProps) {
    const { t } = useTranslation()
    const location = useLocation()
    const { user, role, schoolName } = useAuth()

    const navItems: NavItem[] = [
        { label: t('nav.dashboard'), path: '/dashboard', icon: <LayoutDashboard size={18} /> },
        { label: t('nav.templates'), path: '/templates', icon: <FileText size={18} /> },
        { label: t('nav.documents'), path: '/documents', icon: <FolderOpen size={18} /> },
        { label: t('nav.teachers'), path: '/teachers', icon: <Users size={18} />, adminOnly: true },
        { label: t('nav.settings'), path: '/settings', icon: <Settings size={18} /> },
    ]

    // Filter admin-only items for non-admins
    const visibleItems = navItems.filter(item => !item.adminOnly || role === 'admin')

    // Get initials for avatar
    const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'PA'

    return (
        <>
            {/* Mobile overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar panel */}
            <aside
                role="navigation"
                aria-label={t('nav.mainNav')}
                className={[
                    'fixed top-0 left-0 z-40 h-full flex flex-col',
                    'bg-white border-r border-gray-200',
                    'dark:bg-slate-900 dark:border-slate-800',
                    'transition-all duration-200 ease-in-out',
                    'shadow-lg lg:shadow-none',
                    isOpen ? 'translate-x-0 animate-slide-in' : '-translate-x-full lg:translate-x-0',
                    isCollapsed ? 'w-[64px]' : 'w-[240px]',
                ].join(' ')}
            >
                {/* Logo + collapse */}
                <div className="flex items-center justify-between px-3 py-4 border-b border-gray-100 dark:border-slate-800 h-14">
                    {!isCollapsed && (
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-white font-bold text-xs">PA</span>
                            </div>
                            <span className="font-bold text-gray-900 dark:text-white text-sm leading-tight">
                                PADocs
                            </span>
                        </div>
                    )}
                    {isCollapsed && (
                        <div className="mx-auto w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                            <span className="text-white font-bold text-xs">PA</span>
                        </div>
                    )}

                    {/* Close button (mobile) */}
                    <button className="icon-btn lg:hidden ml-auto" onClick={onClose} aria-label={t('nav.closeSidebar')}>
                        <X size={16} />
                    </button>

                    {/* Collapse toggle (desktop) */}
                    <button
                        className="icon-btn hidden lg:flex"
                        onClick={onToggleCollapse}
                        aria-label={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
                    >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                {/* Nav Items */}
                <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-0.5 scrollbar-thin">
                    {visibleItems.map((item) => {
                        const isActive = location.pathname === item.path ||
                            (item.path !== '/' && location.pathname.startsWith(item.path))
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={onClose}
                                className={['sidebar-item', isActive ? 'active' : ''].join(' ')}
                                title={isCollapsed ? item.label : undefined}
                            >
                                <span className="flex-shrink-0">{item.icon}</span>
                                {!isCollapsed && (
                                    <span className="truncate">{item.label}</span>
                                )}
                            </NavLink>
                        )
                    })}
                </nav>

                {/* Bottom user info */}
                {!isCollapsed && (
                    <div className="px-3 py-3 border-t border-gray-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 px-1">
                            <div className="avatar text-xs">{initials}</div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">
                                    {schoolName ?? 'Your School'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-slate-400 truncate capitalize">
                                    {role ?? 'User'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </aside>
        </>
    )
}
