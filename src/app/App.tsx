import { BrowserRouter } from 'react-router-dom'
import { Suspense } from 'react'
import { AuthProvider } from './AuthContext'
import AppRoutes from './routes'

function LoadingFallback() {
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

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Suspense fallback={<LoadingFallback />}>
                    <AppRoutes />
                </Suspense>
            </AuthProvider>
        </BrowserRouter>
    )
}
