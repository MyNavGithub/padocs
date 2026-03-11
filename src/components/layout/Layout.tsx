import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useLocalStorage } from '../../hooks/useLocalStorage'

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('padocs-sidebar-collapsed', false)


    return (
        // h-screen + overflow-hidden locks the viewport — no browser-level scroll
        <div className="h-screen overflow-hidden bg-gray-50 dark:bg-slate-950">
            {/* Sidebar — fixed overlay, does not affect flow */}
            <Sidebar
                isOpen={sidebarOpen}
                isCollapsed={sidebarCollapsed}
                onClose={() => setSidebarOpen(false)}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            {/* Main content wrapper — offset by sidebar width, fills remaining height */}
            <div
                className={[
                    'flex flex-col h-full transition-all duration-200',
                    sidebarCollapsed ? 'lg:pl-[64px]' : 'lg:pl-[240px]',
                ].join(' ')}
            >
                {/* Header — fixed, takes h-14 (56px) */}
                <Header
                    onMenuClick={() => setSidebarOpen(true)}
                    isSidebarCollapsed={sidebarCollapsed}
                />

                {/* Page content — sits below fixed header (pt-14), fills remaining height */}
                <main
                    id="main-content"
                    className="flex-1 pt-14 min-h-0 overflow-auto"
                >
                    <div className="p-4 md:p-6 max-w-[1400px] mx-auto w-full">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    )
}
