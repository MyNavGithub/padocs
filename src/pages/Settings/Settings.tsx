import { useState } from 'react'
import { Settings, Building2, CreditCard, Shield, Check, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'
import { PLANS, getPlan } from '../../services/billing.service'

export default function SettingsPage() {
    const { t } = useTranslation()
    const { schoolId, schoolName, role, plan, billingStatus } = useAuth()

    const [editName, setEditName] = useState(schoolName ?? '')
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const currentPlan = getPlan(plan ?? 'free')
    const isAdmin = role === 'admin'

    const handleSaveSchool = async () => {
        if (!schoolId || !editName.trim()) return
        setSaving(true); setError(null)
        try {
            const { error: updateError } = await supabase
                .from('schools')
                .update({ name: editName.trim() })
                .eq('id', schoolId)

            if (updateError) throw updateError
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch { setError(t('settings.saveFailed')) }
        finally { setSaving(false) }
    }

    return (
        <div className="p-6 max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Settings size={24} className="text-indigo-600" /> {t('settings.title')}
                </h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{t('settings.subtitle')}</p>
            </div>

            {/* ── School Info ── */}
            <div className="card p-6">
                <div className="flex items-center gap-2 mb-5">
                    <Building2 size={18} className="text-gray-500 dark:text-slate-400" />
                    <h2 className="font-semibold text-gray-800 dark:text-slate-200">{t('settings.schoolInfo')}</h2>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            {t('settings.orgName')}
                        </label>
                        <input
                            className="input max-w-sm"
                            placeholder={t('settings.orgNamePlaceholder')}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            disabled={!isAdmin}
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                            <AlertCircle size={13} className="text-red-500" />
                            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                        </div>
                    )}

                    {isAdmin && (
                        <button onClick={handleSaveSchool} disabled={saving || editName === schoolName}
                            className="btn-primary gap-2 text-sm">
                            {saving ? <><Loader2 size={14} className="animate-spin" /> {t('settings.saving')}</>
                                : saved ? <><Check size={14} /> {t('settings.saved')}</>
                                    : t('settings.save')}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Billing ── */}
            <div className="card p-6">
                <div className="flex items-center gap-2 mb-5">
                    <CreditCard size={18} className="text-gray-500 dark:text-slate-400" />
                    <h2 className="font-semibold text-gray-800 dark:text-slate-200">Billing & Plan</h2>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                        Coming Soon
                    </span>
                </div>

                {/* Current Plan */}
                <div className="flex items-center justify-between p-4 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 mb-5">
                    <div>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">{t('settings.currentPlan')}</p>
                        <p className="font-bold text-lg text-gray-900 dark:text-white">{currentPlan.name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                            {t('settings.status')}: <span className={billingStatus === 'active' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-500'}>
                                {billingStatus ?? 'inactive'}
                            </span>
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                            {currentPlan.price === 0 ? t('settings.free') : `${currentPlan.price.toLocaleString()} XOF`}
                        </p>
                        {currentPlan.price > 0 && <p className="text-xs text-gray-400">{t('settings.perMonth')}</p>}
                    </div>
                </div>

                {/* Plan grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                    {PLANS.filter(p => p.id !== 'enterprise').map(p => (
                        <div key={p.id}
                            className={`p-4 rounded-xl border transition-all ${p.id === currentPlan.id ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-slate-700'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="font-semibold text-sm text-gray-800 dark:text-slate-200">{p.name}</p>
                                {p.id === currentPlan.id && <Check size={14} className="text-indigo-600 dark:text-indigo-400" />}
                            </div>
                            <p className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                                {p.price === 0 ? 'Gratuit' : `${p.price.toLocaleString()} XOF`}
                                {p.price > 0 && <span className="text-xs font-normal text-gray-400">/mois</span>}
                            </p>
                            <ul className="space-y-1">
                                {p.features.map((f, i) => (
                                    <li key={i} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                                        <Check size={11} className="text-emerald-500 flex-shrink-0" /> {f}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Upgrade CTA — disabled until billing is live */}
                <div className="relative">
                    <button disabled
                        className="w-full btn-primary opacity-50 cursor-not-allowed justify-center py-3 text-sm">
                        {t('settings.upgradeBtn')}
                    </button>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-medium text-white opacity-60">
                            Paystack · Flutterwave · Mobile Money
                        </span>
                    </div>
                </div>
                <p className="text-xs text-gray-400 text-center mt-2">
                    {t('settings.paymentNote')}
                </p>
            </div>

            {/* ── Security ── */}
            <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Shield size={18} className="text-gray-500 dark:text-slate-400" />
                    <h2 className="font-semibold text-gray-800 dark:text-slate-200">{t('settings.security')}</h2>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-slate-800">
                        <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('settings.twoFactor')}</p>
                            <p className="text-xs text-gray-400">{t('settings.twoFactorDesc')}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500">{t('common.comingSoon')}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('settings.auditLog')}</p>
                            <p className="text-xs text-gray-400">{t('settings.auditLogDesc')}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500">{t('common.comingSoon')}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
