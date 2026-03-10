import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, Loader2, Mail } from 'lucide-react'
import { supabase } from '../../services/supabase'
import { activateTeacherWithGenericLink } from '../../services/teacher.service'

type PageState = 'loading' | 'valid' | 'invalid' | 'success'

export default function JoinSchool() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const schoolId = searchParams.get('school') ?? ''

    const [state, setState] = useState<PageState>('loading')
    const [schoolName, setSchoolName] = useState('')

    // Form fields
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!schoolId) {
            setState('invalid')
            return
        }

        const fetchSchool = async () => {
            try {
                const { data, error } = await supabase
                    .from('schools')
                    .select('name')
                    .eq('id', schoolId)
                    .single()

                if (data && !error) {
                    setSchoolName(data.name)
                    setState('valid')
                } else {
                    setState('invalid')
                }
            } catch (err) {
                console.error(err)
                setState('invalid')
            }
        }
        fetchSchool()
    }, [schoolId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!email.trim() || !email.includes('@')) {
            setError(t('auth.invalidEmail', 'Adresse e-mail valide requise'))
            return
        }
        if (password.length < 6) {
            setError(t('activate.errShort', 'Le mot de passe doit comporter au moins 6 caractères'))
            return
        }
        if (password !== confirm) {
            setError(t('activate.errMatch', 'Les mots de passe ne correspondent pas'))
            return
        }

        setSubmitting(true)
        try {
            await activateTeacherWithGenericLink({
                schoolId,
                email: email.trim(),
                password,
            })
            setState('success')
            setTimeout(() => {
                navigate('/dashboard')
            }, 2500)
        } catch (err: unknown) {
            const msg = (err as { message?: string }).message ?? ''
            if (msg === 'NOT_APPROVED') {
                setError(t('join.errNotApproved', "Votre adresse e-mail ne figure pas sur la liste des enseignants approuvés pour cette école. Veuillez contacter votre administrateur."))
            } else if (msg === 'ALREADY_ACTIVATED') {
                setError(t('join.errAlreadyActivated', "Ce compte a déjà été activé. Veuillez essayer de vous connecter."))
            } else if (msg === 'Firebase: Error (auth/email-already-in-use).') {
                setError(t('join.errEmailInUse', "Un compte web a déjà été créé avec cet e-mail. Essayez de vous connecter."))
            } else {
                setError(t('activate.errGeneric', "Échec de l'activation du compte. Veuillez réessayer."))
            }
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
                        <p className="text-gray-500 dark:text-slate-400 text-sm">{t('activate.verifying', 'Vérification en cours...')}</p>
                    </div>
                )}

                {/* Invalid */}
                {state === 'invalid' && (
                    <div className="text-center py-6">
                        <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                            <AlertCircle size={28} className="text-red-500" />
                        </div>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                            {t('join.invalidLink', "Lien d'invitation invalide")}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('join.invalidDesc', "Ce lien d'invitation n'est pas valide ou l'école n'existe plus.")}
                        </p>
                    </div>
                )}

                {/* Success */}
                {state === 'success' && (
                    <div className="text-center py-6">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={28} className="text-emerald-500" />
                        </div>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                            {t('activate.success', 'Activation réussie !')}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('join.successDesc', 'Bienvenue à bord ! Vous allez être redirigé vers votre espace professeur.')}
                        </p>
                    </div>
                )}

                {/* Valid — Activation form */}
                {state === 'valid' && (
                    <>
                        <div className="mb-6 text-center">
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('join.title', 'Rejoindre PADocs')}</h1>
                            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                                {t('join.subtitle', 'Configurez votre compte pour')} <strong className="text-gray-900 dark:text-white">{schoolName}</strong>
                            </p>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                                <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                            </div>
                        )}

                        <form className="space-y-4" onSubmit={handleSubmit}>
                            {/* Email */}
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                                    {t('auth.email', 'Adresse E-mail')}
                                </label>
                                <div className="relative">
                                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input id="email" type="email"
                                        className="input pl-9"
                                        placeholder="enseignant@ecole.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        disabled={submitting}
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                                    {t('activate.password', 'Nouveau Mot de Passe')}
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
                                    {t('activate.confirm', 'Confirmer le mot de passe')}
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
                                        <Loader2 size={16} className="animate-spin" />
                                        {t('activate.activating', 'Création...')}
                                    </span>
                                ) : t('join.activate', 'Créer mon compte')}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    )
}
