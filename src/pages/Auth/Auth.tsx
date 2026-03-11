import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Mail, Lock, Building2, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import {
    loginUser,
    registerSchoolAdmin,
} from '../../services/auth.service'

// ============ TYPES ============

interface FormState {
    schoolName: string
    email: string
    password: string
}

// ============ COMPONENT ============

export default function Auth() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { user, loading } = useAuth()

    // Default to register mode if ?register=true in URL
    const [isRegister, setIsRegister] = useState(searchParams.get('register') === 'true')
    const [showPassword, setShowPassword] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [form, setForm] = useState<FormState>({
        schoolName: '',
        email: '',
        password: '',
    })

    // If already authenticated, skip to dashboard
    useEffect(() => {
        if (!loading && user) {
            navigate('/dashboard', { replace: true })
        }
    }, [user, loading, navigate])

    const setField = (field: keyof FormState) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setForm(prev => ({ ...prev, [field]: e.target.value }))
            setError(null)
        }

    // ---- Map Firebase error codes to friendly messages ----
    function friendlyError(code: string): string {
        const map: Record<string, string> = {
            'auth/email-already-in-use': t('auth.errorEmailInUse', { defaultValue: 'Cet email est déjà utilisé.' }),
            'auth/invalid-email': t('auth.errorInvalidEmail', { defaultValue: 'Adresse email invalide.' }),
            'auth/weak-password': t('auth.errorWeakPassword', { defaultValue: 'Mot de passe trop faible (6 caractères min).' }),
            'auth/user-not-found': t('auth.errorUserNotFound', { defaultValue: 'Aucun compte trouvé avec cet email.' }),
            'auth/wrong-password': t('auth.errorWrongPassword', { defaultValue: 'Mot de passe incorrect.' }),
            'auth/invalid-credential': t('auth.errorInvalidCred', { defaultValue: 'Identifiants invalides. Vérifiez votre email et mot de passe.' }),
            'auth/too-many-requests': t('auth.errorTooMany', { defaultValue: 'Trop de tentatives. Réessayez plus tard.' }),
            'auth/network-request-failed': t('auth.errorNetwork', { defaultValue: 'Erreur réseau. Vérifiez votre connexion.' }),
        }
        return map[code] ?? t('common.error')
    }

    // ---- SUBMIT ----
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setSuccess(null)

        const { schoolName, email, password } = form

        // Basic client-side validation
        if (isRegister && !schoolName.trim()) {
            setError(t('auth.errorSchoolRequired', { defaultValue: "Nom de l'établissement requis." }))
            return
        }
        if (!email.trim()) {
            setError(t('auth.errorEmailRequired', { defaultValue: 'Email requis.' }))
            return
        }
        if (password.length < 6) {
            setError(t('auth.errorWeakPassword', { defaultValue: 'Mot de passe trop faible (6 caractères min).' }))
            return
        }

        setSubmitting(true)
        try {
            if (isRegister) {
                await registerSchoolAdmin(schoolName, email, password)
                setSuccess(t('auth.registerSuccess', { defaultValue: 'Compte créé ! Redirection...' }))
                // AuthContext will auto-detect login via onAuthStateChanged → navigate
            } else {
                await loginUser(email, password)
                // AuthContext will auto-detect → navigate via the useEffect above
            }
        } catch (err: unknown) {
            const code = (err as { code?: string }).code ?? ''
            setError(friendlyError(code))
        } finally {
            setSubmitting(false)
        }
    }

    const switchMode = () => {
        setIsRegister(v => !v)
        setError(null)
        setSuccess(null)
        setForm({ schoolName: '', email: '', password: '' })
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 mb-8">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">PA</span>
                </div>
                <span className="font-bold text-gray-900 dark:text-white text-xl">PADocs</span>
            </Link>

            {/* Card */}
            <div className="card w-full max-w-sm p-8">
                <div className="mb-6 text-center">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                        {isRegister ? t('auth.register') : t('auth.login')}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        {isRegister ? t('auth.registerSubtitle') : t('auth.subtitle')}
                    </p>
                </div>

                {/* Error banner */}
                {error && (
                    <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                        <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                    </div>
                )}

                {/* Success banner */}
                {success && (
                    <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">{success}</p>
                    </div>
                )}

                <form className="space-y-4" onSubmit={handleSubmit} noValidate>

                    {/* School Name — register only */}
                    {isRegister && (
                        <div>
                            <label htmlFor="schoolName" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                                {t('settings.orgName')}
                            </label>
                            <div className="relative">
                                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    id="schoolName"
                                    type="text"
                                    className="input pl-9"
                                    placeholder={t('settings.orgNamePlaceholder')}
                                    value={form.schoolName}
                                    onChange={setField('schoolName')}
                                    autoComplete="organization"
                                    required
                                    disabled={submitting}
                                />
                            </div>
                        </div>
                    )}

                    {/* Email */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            {t('auth.email')}
                        </label>
                        <div className="relative">
                            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                id="email"
                                type="email"
                                className="input pl-9"
                                placeholder={t('auth.emailPlaceholder')}
                                value={form.email}
                                onChange={setField('email')}
                                autoComplete="email"
                                required
                                disabled={submitting}
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                                {t('auth.password')}
                            </label>
                            {!isRegister && (
                                <Link to="/auth/forgot" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                                    {t('auth.forgotPassword')}
                                </Link>
                            )}
                        </div>
                        <div className="relative">
                            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                className="input pl-9 pr-10"
                                placeholder="••••••••"
                                value={form.password}
                                onChange={setField('password')}
                                autoComplete={isRegister ? 'new-password' : 'current-password'}
                                required
                                disabled={submitting}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                onClick={() => setShowPassword(v => !v)}
                                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        className="btn-primary w-full justify-center py-2.5 mt-2"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                                {t('common.loading')}
                            </span>
                        ) : (
                            isRegister ? t('auth.signUp') : t('auth.signIn')
                        )}
                    </button>
                </form>

                {/* Toggle login/register */}
                <p className="mt-5 text-center text-sm text-gray-500 dark:text-slate-400">
                    {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
                    <button
                        className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                        onClick={switchMode}
                        type="button"
                    >
                        {isRegister ? t('auth.signIn') : t('auth.signUp')}
                    </button>
                </p>
            </div>
        </div>
    )
}
