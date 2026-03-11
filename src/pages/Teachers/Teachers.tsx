import { useState, useEffect, useRef } from 'react'
import { Users, Upload, CheckCircle, AlertCircle, Clock, RefreshCw, Loader2, Link as LinkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../app/AuthContext'
import {
    uploadApprovedTeachers,
    validateAndInviteTeacher,
} from '../../services/teacher.service'
import { supabase } from '../../services/supabase'
import type { ApprovedTeacher } from '../../services/teacher.service'

type Tab = 'upload' | 'approved' | 'active'

function StatusBadge({ status, t }: { status: ApprovedTeacher['status']; t: (k: string) => string }) {
    const map = {
        unused: { key: 'teachers.status.unused', cls: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300' },
        invited: { key: 'teachers.status.invited', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
        activated: { key: 'teachers.status.activated', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    }
    const { key, cls } = map[status]
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{t(key)}</span>
}

export default function Teachers() {
    const { schoolId, schoolName, role } = useAuth()
    const { t } = useTranslation()
    const [tab, setTab] = useState<Tab>('upload')
    const [copied, setCopied] = useState(false)

    const [emailInput, setEmailInput] = useState('')
    const [uploading, setUploading] = useState(false)
    const [uploadResult, setUploadResult] = useState<{ added: number; skipped: number } | null>(null)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const [approved, setApproved] = useState<ApprovedTeacher[]>([])
    const [loadingApproved, setLoadingApproved] = useState(false)
    const [resending, setResending] = useState<string | null>(null)

    const isAdmin = role === 'admin'

    const fetchApproved = async () => {
        if (!schoolId) return
        setLoadingApproved(true)
        try {
            const { data, error } = await supabase
                .from('approved_teachers')
                .select('*')
                .eq('school_id', schoolId)

            if (!error && data) {
                setApproved(data.map(d => ({
                    id: d.id,
                    schoolId: d.school_id,
                    email: d.email,
                    status: d.status,
                    inviteToken: d.invite_token,
                    inviteExpiresAt: d.invite_expires_at ? new Date(d.invite_expires_at) : null,
                    uploadedAt: new Date(d.uploaded_at)
                })))
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoadingApproved(false)
        }
    }

    useEffect(() => { if (tab === 'approved') fetchApproved() }, [tab, schoolId])

    const parseEmails = (text: string): string[] =>
        text.split(/[\n,;]+/).map(e => e.trim()).filter(e => e.includes('@'))

    const handleCSV = (file: File) => {
        const reader = new FileReader()
        reader.onload = (e) => setEmailInput(e.target?.result as string)
        reader.readAsText(file)
    }

    const handleUpload = async () => {
        if (!schoolId) return
        const emails = parseEmails(emailInput)
        if (!emails.length) { setUploadError(t('teachers.noEmails')); return }
        setUploading(true); setUploadError(null); setUploadResult(null)
        try {
            const result = await uploadApprovedTeachers(schoolId, emails)
            setUploadResult(result)
            setEmailInput('')
        } catch (e) {
            setUploadError(t('teachers.uploadFailed'))
            console.error(e)
        } finally {
            setUploading(false)
        }
    }

    const handleResend = async (teacher: ApprovedTeacher & { id?: string }) => {
        if (!schoolId || !schoolName || !teacher.email) return
        setResending(teacher.email)
        try {
            const token = await validateAndInviteTeacher(teacher.email, schoolId, schoolName)

            // WORKAROUND: Send email directly via the user's native email client (Zero Backend / Free)
            const activationUrl = `${window.location.origin}/teacher-activate?token=${token}`
            const subject = encodeURIComponent(`${t('teachers.invitePrefix')} ${schoolName} sur PADocs`)
            const body = encodeURIComponent(
                `${t('teachers.inviteBody1')} ${schoolName} ${t('teachers.inviteBody2')}${activationUrl}${t('teachers.inviteBody3')}`
            )
            window.location.href = `mailto:${teacher.email}?subject=${subject}&body=${body}`

            await fetchApproved()
        } catch (e) {
            console.error('Resend failed:', e)
        } finally {
            setResending(null)
        }
    }

    const handleCopyGenericLink = () => {
        const genericUrl = `${window.location.origin}/join?school=${schoolId}`
        navigator.clipboard.writeText(genericUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
    }

    if (!isAdmin) {
        return (
            <div className="p-8 text-center">
                <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-slate-400">{t('teachers.adminRequired')}</p>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Users size={24} className="text-indigo-600" /> {t('teachers.title')}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        {t('teachers.subtitle')}
                    </p>
                </div>

                <div className="flex gap-2 items-center">
                    <span className="text-xs text-gray-400 hidden sm:inline-block">
                        {t('teachers.bulkShareHint', 'Envoyer via Whatsapp ou Slack :')}
                    </span>
                    <button
                        onClick={handleCopyGenericLink}
                        className="btn-secondary gap-2 text-sm bg-white dark:bg-slate-800"
                    >
                        {copied ? (
                            <><CheckCircle size={16} className="text-emerald-500" /> {t('teachers.copied', "Copié !")}</>
                        ) : (
                            <><LinkIcon size={16} className="text-indigo-500" /> {t('teachers.copyGenericLink', "Copier le lien d'invitation de l'école")}</>
                        )}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl mb-6 w-fit">
                {(['upload', 'approved'] as Tab[]).map(tabKey => (
                    <button key={tabKey}
                        onClick={() => setTab(tabKey)}
                        className={[
                            'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
                            tab === tabKey
                                ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                        ].join(' ')}>
                        {tabKey === 'upload' ? t('teachers.uploadList') : t('teachers.approvedTeachers')}
                    </button>
                ))}
            </div>

            {/* ── TAB: Upload ── */}
            {tab === 'upload' && (
                <div className="space-y-4">
                    {/* Drop zone */}
                    <div
                        className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCSV(f) }}>
                        <Upload size={32} className="text-gray-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('teachers.dropCSV')}</p>
                        <p className="text-xs text-gray-400 mt-1">{t('teachers.dropCSVDesc')}</p>
                        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleCSV(f) }} />
                    </div>

                    {/* Manual input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                            {t('teachers.pasteEmails')}
                        </label>
                        <textarea
                            className="input h-32 resize-none font-mono text-xs"
                            placeholder={"teacher1@school.com\nteacher2@school.com\nteacher3@school.com"}
                            value={emailInput}
                            onChange={e => setEmailInput(e.target.value)}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            {t('teachers.emailsDetected', { count: parseEmails(emailInput).length })}
                        </p>
                    </div>

                    {/* Errors / Results */}
                    {uploadError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                            <AlertCircle size={15} className="text-red-500" />
                            <p className="text-xs text-red-700 dark:text-red-300">{uploadError}</p>
                        </div>
                    )}
                    {uploadResult && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle size={15} className="text-emerald-500" />
                            <p className="text-xs text-emerald-700 dark:text-emerald-300">
                                {t('teachers.addedSkipped', { added: uploadResult.added, skipped: uploadResult.skipped })}
                            </p>
                        </div>
                    )}

                    <button onClick={handleUpload} disabled={uploading || !emailInput.trim()}
                        className="btn-primary gap-2">
                        {uploading
                            ? <><Loader2 size={15} className="animate-spin" /> {t('teachers.uploading')}</>
                            : <><Upload size={15} /> {t('teachers.upload')}</>}
                    </button>
                </div>
            )}

            {/* ── TAB: Approved ── */}
            {tab === 'approved' && (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            {t('teachers.teacherCount', { count: approved.length })}
                        </p>
                        <button onClick={fetchApproved} className="icon-btn" title={t('teachers.refresh')}>
                            <RefreshCw size={15} />
                        </button>
                    </div>

                    {loadingApproved ? (
                        <div className="flex justify-center py-12">
                            <Loader2 size={28} className="animate-spin text-indigo-500" />
                        </div>
                    ) : approved.length === 0 ? (
                        <div className="text-center py-12">
                            <Users size={40} className="text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                            <p className="text-gray-500 dark:text-slate-400 text-sm">{t('teachers.noTeachers')}</p>
                        </div>
                    ) : (
                        <div className="card overflow-hidden p-0">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 dark:border-slate-800">
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400">{t('teachers.col.email')}</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400">{t('teachers.col.status')}</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400">{t('teachers.col.uploaded')}</th>
                                        <th className="px-4 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {approved.map((teacher, i) => (
                                        <tr key={i} className="border-b border-gray-50 dark:border-slate-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                                            <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-slate-300">{teacher.email}</td>
                                            <td className="px-4 py-3"><StatusBadge status={teacher.status} t={t} /></td>
                                            <td className="px-4 py-3 text-xs text-gray-400">
                                                {teacher.uploadedAt ? teacher.uploadedAt.toLocaleDateString() : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {teacher.status === 'unused' && (
                                                    <button
                                                        onClick={() => handleResend(teacher)}
                                                        disabled={resending === teacher.email}
                                                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
                                                        {resending === teacher.email
                                                            ? <Loader2 size={12} className="animate-spin inline" />
                                                            : t('teachers.sendInvite')}
                                                    </button>
                                                )}
                                                {teacher.status === 'invited' && (
                                                    <span className="text-xs text-amber-500 flex items-center gap-1 justify-end">
                                                        <Clock size={11} /> {t('teachers.pending')}
                                                    </span>
                                                )}
                                                {teacher.status === 'activated' && (
                                                    <span className="text-xs text-emerald-500 flex items-center gap-1 justify-end">
                                                        <CheckCircle size={11} /> {t('teachers.joined')}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
