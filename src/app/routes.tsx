import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import ProtectedRoute from './ProtectedRoute'
import Landing from '../pages/Landing/Landing'
import Auth from '../pages/Auth/Auth'
import Dashboard from '../pages/Dashboard/Dashboard'
import Templates from '../pages/Templates/Templates'
import Editor from '../pages/Editor/Editor'
import Documents from '../pages/Documents/Documents'
import Settings from '../pages/Settings/Settings'
import Teachers from '../pages/Teachers/Teachers'
import TeacherActivate from '../pages/TeacherActivate/TeacherActivate'

export default function AppRoutes() {
    return (
        <Routes>
            {/* Public routes — no authentication required */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/forgot" element={<Auth />} />

            {/* Teacher activation — public (token is the authorization) */}
            <Route path="/teacher-activate" element={<TeacherActivate />} />

            {/* Protected routes — must be authenticated */}
            <Route
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route path="/dashboard"  element={<Dashboard />} />
                <Route path="/templates"  element={<Templates />} />
                <Route path="/editor"     element={<Editor />} />
                <Route path="/documents"  element={<Documents />} />
                <Route path="/settings"   element={<Settings />} />
                <Route path="/teachers"   element={<Teachers />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
