import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    FileText, Plus, Edit2, Trash2, Loader2, Search,
    AlertCircle, AlertTriangle, X, Eye, Hash,
} from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { getSchoolTemplates, deleteTemplate, type Template } from '../../services/template.service'

// ── Template Preview Modal ─────────────────────────────────────────────────

function TemplatePreviewModal({ tpl, onClose }: { tpl: Template; onClose: () => void }) {
    const { t } = useTranslation()

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-800">
                    <div>
                        <h2 className="font-bold text-gray-900 dark:text-white text-lg">{tpl.name}</h2>
                        {tpl.description && (
                            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{tpl.description}</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                        <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                            <Hash size={11} /> {tpl.fields.length} {t('templates.fieldsLabel')}
                        </span>
                        <button onClick={onClose} className="icon-btn text-gray-500 hover:text-gray-800 dark:hover:text-white">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Fields summary */}
                {tpl.fields.length > 0 && (
                    <div className="px-6 py-3 border-b border-gray-50 dark:border-slate-800 bg-indigo-50/50 dark:bg-indigo-900/10 flex flex-wrap gap-1.5">
                        {tpl.fields.map(f => (
                            <span key={f.key}
                                className="inline-flex items-center gap-1 text-xs font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                                {`{{${f.key}}}`}
                            </span>
                        ))}
                    </div>
                )}

                {/* Content preview */}
                <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-950 p-6">
                    <div className="max-w-[680px] mx-auto bg-white dark:bg-slate-900 shadow rounded-lg p-8">
                        <div
                            className="padocs-editor"
                            dangerouslySetInnerHTML={{ __html: tpl.content }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                    <p className="text-xs text-gray-400">{t('templates.previewNote')}</p>
                    <button onClick={onClose} className="btn gap-2 text-sm">
                        <X size={14} /> {t('common.close')}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main Templates Page ────────────────────────────────────────────────────

export default function Templates() {
    const { schoolId, role } = useAuth()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [actionId, setActionId] = useState<string | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [previewTpl, setPreviewTpl] = useState<Template | null>(null)
    const [error, setError] = useState<string | null>(null)

    const isAdmin = role === 'admin'

    const load = async () => {
        if (!schoolId) return
        setLoading(true)
        try { setTemplates(await getSchoolTemplates(schoolId)) }
        catch { setError(t('templates.loadFailed')) }
        finally { setLoading(false) }
    }

    useEffect(() => { load() }, [schoolId])

    const handleDelete = async (tpl: Template) => {
        if (!tpl.id) return
        setActionId(tpl.id)
        setConfirmDeleteId(null)
        try {
            await deleteTemplate(tpl.id)
            setTemplates(prev => prev.filter(t => t.id !== tpl.id))
        } catch {
            setError(t('templates.deleteFailed'))
        } finally {
            setActionId(null)
        }
    }

    const filtered = templates.filter(tpl =>
        tpl.name.toLowerCase().includes(search.toLowerCase()) ||
        tpl.description?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FileText size={24} className="text-indigo-600" /> {t('templates.title')}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        {t('templates.inYourLibrary', { count: templates.length })}
                    </p>
                </div>
                {isAdmin && (
                    <button onClick={() => navigate('/editor')} className="btn-primary gap-2 self-start sm:self-auto">
                        <Plus size={15} /> {t('templates.newTemplate')}
                    </button>
                )}
            </div>

            {/* Search */}
            {templates.length > 0 && (
                <div className="relative mb-5">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className="input pl-9 max-w-sm" placeholder={t('templates.search')}
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            )}

            {error && (
                <div className="flex items-center justify-between gap-2 p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
                        <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                    </div>
                    <button onClick={() => setError(null)} className="icon-btn text-red-400"><X size={13} /></button>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mx-auto mb-4">
                        <FileText size={28} className="text-indigo-400" />
                    </div>
                    <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                        {search ? t('templates.noTemplatesOnSearch') : t('templates.noTemplates')}
                    </h2>
                    <p className="text-sm text-gray-400 dark:text-slate-500 mb-6 max-w-xs mx-auto">
                        {search ? t('templates.noTemplatesSearchDesc') : t('templates.noTemplatesDesc')}
                    </p>
                    {!search && isAdmin && (
                        <button onClick={() => navigate('/editor')} className="btn-primary gap-2">
                            <Plus size={15} /> {t('templates.createFirst')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(tpl => (
                        <div key={tpl.id} className="card p-5 flex flex-col gap-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all group relative">
                            <div className="flex items-start justify-between">
                                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                    <FileText size={18} className="text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* Create Document button — visible to all */}
                                    <button
                                        onClick={() => navigate(`/documents?new=${tpl.id}`)}
                                        className="icon-btn text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                        title={t('templates.createDocument') ?? 'Create Document'}>
                                        <Plus size={14} />
                                    </button>
                                    {/* View button — visible to all */}
                                    <button
                                        onClick={() => setPreviewTpl(tpl)}
                                        className="icon-btn text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                                        title={t('templates.viewTitle')}>
                                        <Eye size={14} />
                                    </button>
                                    {isAdmin && (
                                        <>
                                            <button
                                                onClick={() => navigate(`/editor?id=${tpl.id}`)}
                                                className="icon-btn text-gray-400 hover:text-indigo-600"
                                                title={t('templates.editTitle')}>
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => setConfirmDeleteId(tpl.id ?? null)}
                                                disabled={actionId === tpl.id}
                                                className="icon-btn text-gray-400 hover:text-red-500"
                                                title={t('templates.deleteTitle')}>
                                                {actionId === tpl.id
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : <Trash2 size={14} />}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1">
                                <h3 className="font-semibold text-gray-800 dark:text-slate-200 leading-tight mb-1">{tpl.name}</h3>
                                {tpl.description && (
                                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{tpl.description}</p>
                                )}
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-slate-800">
                                <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20">
                                    {t('templates.fields', { count: tpl.fields.length })}
                                </span>
                                <span className="text-xs text-gray-400 italic">
                                    {t('templates.hoverToAct')}
                                </span>
                            </div>

                            {/* Inline delete confirm */}
                            {confirmDeleteId === tpl.id && (
                                <div className="absolute inset-0 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 z-10 border-2 border-red-200 dark:border-red-800">
                                    <AlertTriangle size={22} className="text-red-500" />
                                    <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 text-center">{t('templates.deleteTemplate')}</p>
                                    <p className="text-xs text-gray-500 text-center">{t('templates.deleteTemplateDesc')}</p>
                                    <div className="flex gap-2 w-full">
                                        <button onClick={() => setConfirmDeleteId(null)}
                                            className="btn flex-1 justify-center text-xs">{t('common.cancel')}</button>
                                        <button onClick={() => handleDelete(tpl)}
                                            className="flex-1 justify-center text-xs py-1.5 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium flex items-center gap-1.5">
                                            <Trash2 size={12} /> {t('templates.delete')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Preview modal */}
            {previewTpl && (
                <TemplatePreviewModal tpl={previewTpl} onClose={() => setPreviewTpl(null)} />
            )}
        </div>
    )
}
