import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { verifyInviteToken, activateTeacherAccount } from '../../services/teacher.service'
import type { InviteTokenRecord } from '../../services/teacher.service'

type PageState = 'loading' | 'valid' | 'invalid' | 'expired' | 'success' | 'error'

export default function TeacherActivate() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const token = searchParams.get('token') ?? ''

    const [state, setState] = useState<PageState>('loading')
    const [tokenData, setTokenData] = useState<InviteTokenRecord | null>(null)
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!token) { setState('invalid'); return }

        verifyInviteToken(token).then((data) => {
            if (!data) {
                setState('invalid')
            } else if (data.expiresAt < new Date()) {
                setState('expired')
            } else {
                setTokenData(data)
                setState('valid')
            }
        }).catch(() => setState('error'))
    }, [token])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        if (password.length < 6) { setError(t('activate.errShort')); return }
        if (password !== confirm) { setError(t('activate.errMatch')); return }

        setSubmitting(true)
        try {
            await activateTeacherAccount({
                token,
                password,
                schoolName: '',
            })
            setState('success')
            setTimeout(() => navigate('/auth'), 2500)
        } catch (err: unknown) {
            const msg = (err as { message?: string }).message ?? ''
            if (msg === 'INVALID_TOKEN') setError(t('activate.errInvalid'))
            else if (msg === 'TOKEN_EXPIRED') setError(t('activate.errExpired'))
            else setError(t('activate.errGeneric'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
            {/* Logo */}
            <div className="flex items-center gap-2 mb-8">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">PA</span>
                </div>
                <span className="font-bold text-gray-900 dark:text-white text-xl">PADocs</span>
            </div>

            <div className="card w-full max-w-sm p-8">

                {/* Loading */}
                {state === 'loading' && (
                    <div className="text-center py-8">
                        <Loader2 className="animate-spin mx-auto text-indigo-600 mb-3" size={32} />
                        <p className="text-gray-500 dark:text-slate-400 text-sm">{t('activate.verifying')}</p>
                    </div>
                )}

                {/* Invalid / Expired / Error */}
                {(state === 'invalid' || state === 'expired' || state === 'error') && (
                    <div className="text-center py-6">
                        <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                            <AlertCircle size={28} className="text-red-500" />
                        </div>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                            {state === 'expired' ? t('activate.expiredLink') : t('activate.invalidLink')}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            {state === 'expired' ? t('activate.expiredDesc') : t('activate.invalidDesc')}
                        </p>
                    </div>
                )}

                {/* Success */}
                {state === 'success' && (
                    <div className="text-center py-6">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={28} className="text-emerald-500" />
                        </div>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('activate.success')}</h1>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('activate.successDesc')}
                        </p>
                    </div>
                )}

                {/* Valid — Password form */}
                {state === 'valid' && tokenData && (
                    <>
                        <div className="mb-6 text-center">
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('activate.title')}</h1>
                            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                                {t('activate.setPasswordFor')} <strong>{tokenData.email}</strong>
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                                <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                            </div>
                        )}

                        <form className="space-y-4" onSubmit={handleSubmit}>
                            {/* Password */}
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                                    {t('activate.password')}
                                </label>
                                <div className="relative">
                                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input id="password" type={showPw ? 'text' : 'password'}
                                        className="input pl-9 pr-10"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                        disabled={submitting}
                                    />
                                    <button type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                                        {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            {/* Confirm */}
                            <div>
                                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                                    {t('activate.confirm')}
                                </label>
                                <div className="relative">
                                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input id="confirm" type={showPw ? 'text' : 'password'}
                                        className="input pl-9"
                                        placeholder="••••••••"
                                        value={confirm}
                                        onChange={(e) => setConfirm(e.target.value)}
                                        autoComplete="new-password"
                                        required
                                        disabled={submitting}
                                    />
                                </div>
                            </div>

                            <button type="submit"
                                className="btn-primary w-full justify-center py-2.5 mt-2"
                                disabled={submitting}>
                                {submitting ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                        </svg>
                                        {t('activate.activating')}
                                    </span>
                                ) : t('activate.activate')}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}
