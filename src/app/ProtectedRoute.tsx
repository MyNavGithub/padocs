import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

interface ProtectedRouteProps {
    children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
    const { user, loading } = useAuth()

    // Still resolving auth state — show branded loader
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center animate-pulse">
                        <span className="text-white font-bold text-sm">PA</span>
                    </div>
                    <p className="text-sm text-gray-400 dark:text-slate-500">Chargement...</p>
                </div>
            </div>
        )
    }

    // Not authenticated — redirect to /auth
    if (!user) {
        return <Navigate to="/auth" replace />
    }

    // Authenticated — render protected content
    return <>{children}</>
}
