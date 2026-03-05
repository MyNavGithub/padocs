import { useState, useEffect } from 'react'
import {
    FolderOpen, Plus, Printer, Search, X, Loader2, AlertCircle,
    FileText, Edit2, Trash2, Download, MoreHorizontal, AlertTriangle,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../app/AuthContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getSchoolTemplates, getTemplate, type Template } from '../../services/template.service'
import {
    getSchoolDocuments, generateDocument, updateDocument, deleteDocument,
    downloadDocumentAsHtml, printDocument, type GeneratedDocument,
} from '../../services/document.service'

// Per-row action menu
function ActionMenu({
    doc: _doc, onEdit, onPrint, onDownload, onDelete, loading, t,
}: {
    doc: GeneratedDocument; onEdit: () => void; onPrint: () => void
    onDownload: () => void; onDelete: () => void; loading: boolean
    t: (key: string) => string
}) {
    const [open, setOpen] = useState(false)
    return (
        <div className="relative">
            <button
                className="icon-btn"
                title={t('documents.actions')}
                disabled={loading}
                onClick={() => setOpen(v => !v)}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-8 z-30 w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden">
                        <button className="menu-item" onClick={() => { setOpen(false); onEdit() }}>
                            <Edit2 size={13} className="text-indigo-500" /> {t('documents.edit')}
                        </button>
                        <button className="menu-item" onClick={() => { setOpen(false); onPrint() }}>
                            <Printer size={13} className="text-gray-500" /> {t('documents.printPdf')}
                        </button>
                        <button className="menu-item" onClick={() => { setOpen(false); onDownload() }}>
                            <Download size={13} className="text-emerald-500" /> {t('documents.download')}
                        </button>
                        <div className="border-t border-gray-100 dark:border-slate-700 my-0.5" />
                        <button className="menu-item text-red-600 dark:text-red-400" onClick={() => { setOpen(false); onDelete() }}>
                            <Trash2 size={13} /> {t('documents.delete')}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

export default function Documents() {
    const { user, schoolId, role } = useAuth()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const { t } = useTranslation()
    const isAdmin = role === 'admin'

    const [documents, setDocuments] = useState<GeneratedDocument[]>([])
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)
    const [actionId, setActionId] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    // ── Generate modal ──────────────────────────────────────────────────────
    const [showGenModal, setShowGenModal] = useState(false)
    const [genStep, setGenStep] = useState<'select' | 'fill'>('select')
    const [selectedTpl, setSelectedTpl] = useState<Template | null>(null)
    const [docTitle, setDocTitle] = useState('')
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
    const [generating, setGenerating] = useState(false)
    const [genError, setGenError] = useState<string | null>(null)

    // ── Edit modal ──────────────────────────────────────────────────────────
    const [editDoc, setEditDoc] = useState<GeneratedDocument | null>(null)
    const [editTemplate, setEditTemplate] = useState<Template | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editData, setEditData] = useState<Record<string, string>>({})
    const [editSaving, setEditSaving] = useState(false)
    const [editError, setEditError] = useState<string | null>(null)
    const [loadingEdit, setLoadingEdit] = useState(false)

    // ── Delete confirm ──────────────────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState<GeneratedDocument | null>(null)

    const load = async () => {
        if (!schoolId) return
        setLoading(true)
        const [docs, tmpls] = await Promise.all([
            getSchoolDocuments(schoolId).catch(() => [] as GeneratedDocument[]),
            getSchoolTemplates(schoolId).catch(() => [] as Template[]),
        ])
        setDocuments(docs)
        setTemplates(tmpls)
        setLoading(false)

        const newTplId = searchParams.get('new')
        if (newTplId && tmpls.length > 0) {
            const tpl = tmpls.find(t => t.id === newTplId)
            if (tpl) {
                setSelectedTpl(tpl)
                setDocTitle('')
                setFieldValues(Object.fromEntries(tpl.fields.map(f => [f.key, ''])))
                setGenStep('fill')
                setShowGenModal(true)
            }
            searchParams.delete('new')
            setSearchParams(searchParams, { replace: true })
        }
    }

    useEffect(() => { load() }, [schoolId])

    // ── Generate handlers ───────────────────────────────────────────────────
    const openGenModal = () => {
        setGenStep('select'); setSelectedTpl(null); setDocTitle(''); setFieldValues({}); setGenError(null)
        setShowGenModal(true)
    }

    const selectTemplate = (tpl: Template) => {
        setSelectedTpl(tpl)
        setDocTitle('')
        setFieldValues(Object.fromEntries(tpl.fields.map(f => [f.key, ''])))
        setGenStep('fill')
    }

    const handleGenerate = async () => {
        if (!selectedTpl || !schoolId || !user) return
        const empty = selectedTpl.fields.find(f => !fieldValues[f.key]?.trim())
        if (empty) { setGenError(t('documents.fillRequired', { field: empty.label })); return }
        setGenerating(true); setGenError(null)
        try {
            const title = docTitle.trim() || selectedTpl.name
            const { htmlContent } = await generateDocument(selectedTpl, fieldValues, user.uid, title)
            setShowGenModal(false)
            printDocument(htmlContent, title)
            await load()
        } catch (e) {
            setGenError(t('documents.generationFailed'))
            console.error(e)
        } finally { setGenerating(false) }
    }

    // ── Edit handlers ───────────────────────────────────────────────────────
    const openEditModal = async (doc: GeneratedDocument) => {
        setLoadingEdit(true); setEditError(null)
        try {
            const tpl = await getTemplate(doc.templateId)
            if (!tpl) { setEditError(t('documents.templateNotFound')); return }
            setEditTemplate(tpl)
            setEditDoc(doc)
            setEditTitle(doc.title)
            setEditData(Object.fromEntries(tpl.fields.map(f => [f.key, doc.data?.[f.key] ?? ''])))
        } catch {
            setEditError(t('documents.editLoadFailed'))
        } finally { setLoadingEdit(false) }
    }

    const handleUpdate = async () => {
        if (!editDoc?.id || !editTemplate) return
        setEditSaving(true); setEditError(null)
        try {
            const { htmlContent } = await updateDocument(editDoc.id, editTemplate, editData, editTitle)
            setDocuments(prev => prev.map(d => d.id === editDoc.id
                ? { ...d, title: editTitle.trim() || editTemplate.name, data: editData, htmlContent }
                : d))
            setEditDoc(null)
            printDocument(htmlContent, editTitle || editTemplate.name)
        } catch (e) {
            setEditError(t('documents.updateFailed'))
            console.error(e)
        } finally { setEditSaving(false) }
    }

    // ── Delete handler ──────────────────────────────────────────────────────
    const handleDelete = async (doc: GeneratedDocument) => {
        if (!doc.id) return
        setActionId(doc.id); setDeleteTarget(null)
        try {
            await deleteDocument(doc.id)
            setDocuments(prev => prev.filter(d => d.id !== doc.id))
        } catch { console.error('Delete failed') }
        finally { setActionId(null) }
    }

    const fmt = (d: unknown) => {
        if (!d) return '—'
        const date = (d as { seconds?: number }).seconds
            ? new Date((d as { seconds: number }).seconds * 1000)
            : new Date(d as string)
        return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const filtered = documents.filter(d =>
        d.title?.toLowerCase().includes(search.toLowerCase()) ||
        d.templateName?.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FolderOpen size={24} className="text-indigo-600" /> {t('documents.title')}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                        {t('documents.documents', { count: documents.length })}
                    </p>
                </div>
                <button onClick={openGenModal} className="btn-primary gap-2 self-start sm:self-auto"
                    disabled={templates.length === 0}>
                    <Plus size={15} /> {t('documents.newDocument')}
                </button>
            </div>

            {templates.length === 0 && !loading && (
                <div className="mb-5 flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700">
                    <AlertCircle size={15} className="text-amber-500 flex-shrink-0" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t('documents.noTemplatesWarning')}
                        <button onClick={() => navigate('/editor')} className="ml-1 underline font-medium">{t('documents.createTemplateLink')}</button>
                    </p>
                </div>
            )}

            {editError && (
                <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300">{editError}</p>
                    <button onClick={() => setEditError(null)} className="ml-auto icon-btn text-red-400"><X size={12} /></button>
                </div>
            )}

            {/* Search */}
            {documents.length > 0 && (
                <div className="relative mb-5">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input className="input pl-9 max-w-sm" placeholder={t('documents.search')}
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mx-auto mb-4">
                        <FolderOpen size={28} className="text-indigo-400" />
                    </div>
                    <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
                        {search ? t('documents.noDocumentsOnSearch') : t('documents.noDocuments')}
                    </h2>
                    <p className="text-sm text-gray-400 dark:text-slate-500 mb-6 max-w-xs mx-auto">
                        {search ? t('documents.noDocumentsSearchDesc') : t('documents.noDocumentsDesc')}
                    </p>
                    {!search && templates.length > 0 && (
                        <button onClick={openGenModal} className="btn-primary gap-2">
                            <Plus size={15} /> {t('documents.newDocument')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="card overflow-visible p-0 border-b-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                                <th className="rounded-tl-xl text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400">{t('documents.title_col')}</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 hidden sm:table-cell">{t('documents.template_col')}</th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400">{t('documents.date_col')}</th>
                                <th className="rounded-tr-xl px-5 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400">{t('documents.actions_col')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(doc => (
                                <tr key={doc.id} className="border-b border-gray-50 dark:border-slate-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/30">
                                    <td className="px-5 py-3 last:rounded-bl-xl">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                                                <FileText size={13} className="text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <span className="font-medium text-gray-800 dark:text-slate-200 truncate max-w-[140px] sm:max-w-none">{doc.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 hidden sm:table-cell">
                                        <span className="text-xs text-gray-400 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700">{doc.templateName}</span>
                                    </td>
                                    <td className="px-5 py-3 text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">{fmt(doc.createdAt)}</td>
                                    <td className="px-5 py-3 text-right last:rounded-br-xl">
                                        {isAdmin ? (
                                            <ActionMenu
                                                doc={doc}
                                                t={t as (key: string) => string}
                                                loading={actionId === doc.id || loadingEdit}
                                                onEdit={() => openEditModal(doc)}
                                                onPrint={() => printDocument(doc.htmlContent, doc.title)}
                                                onDownload={() => downloadDocumentAsHtml(doc.htmlContent, doc.title)}
                                                onDelete={() => setDeleteTarget(doc)}
                                            />
                                        ) : (
                                            <button
                                                onClick={() => printDocument(doc.htmlContent, doc.title)}
                                                className="btn text-xs py-1 px-2.5 gap-1.5">
                                                <Printer size={12} /> {t('documents.print')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Generate Modal ── */}
            {showGenModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="font-bold text-gray-900 dark:text-white">
                                {genStep === 'select' ? t('documents.chooseTemplate') : t('documents.fillFields')}
                            </h2>
                            <button onClick={() => setShowGenModal(false)} className="icon-btn"><X size={16} /></button>
                        </div>

                        {genStep === 'select' && (
                            <div className="space-y-2">
                                {templates.map(tpl => (
                                    <button key={tpl.id}
                                        onClick={() => selectTemplate(tpl)}
                                        className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">{tpl.name}</p>
                                        {tpl.description && <p className="text-xs text-gray-400 mt-0.5">{tpl.description}</p>}
                                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{t('templates.fields', { count: tpl.fields.length })}</p>
                                    </button>
                                ))}
                            </div>
                        )}

                        {genStep === 'fill' && selectedTpl && (
                            <div className="space-y-3">
                                <button onClick={() => setGenStep('select')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                                    {t('documents.backToTemplates')}
                                </button>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{t('documents.docTitle')}</label>
                                    <input className="input text-sm" placeholder={selectedTpl.name}
                                        value={docTitle} onChange={e => setDocTitle(e.target.value)} />
                                </div>
                                {selectedTpl.fields.map(f => (
                                    <div key={f.key}>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{f.label} *</label>
                                        <input className="input text-sm" placeholder={f.label.toLowerCase()}
                                            value={fieldValues[f.key] ?? ''}
                                            onChange={e => setFieldValues(v => ({ ...v, [f.key]: e.target.value }))} />
                                    </div>
                                ))}
                                {genError && (
                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200">
                                        <AlertCircle size={13} className="text-red-500" />
                                        <p className="text-xs text-red-700 dark:text-red-300">{genError}</p>
                                    </div>
                                )}
                                <div className="flex gap-2 pt-2">
                                    <button onClick={() => setShowGenModal(false)} className="btn flex-1 justify-center">{t('documents.cancel')}</button>
                                    <button onClick={handleGenerate} disabled={generating} className="btn-primary flex-1 justify-center gap-2">
                                        {generating
                                            ? <><Loader2 size={14} className="animate-spin" /> {t('documents.generating')}</>
                                            : <><Printer size={14} /> {t('documents.generate')}</>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Edit Modal ── */}
            {editDoc && editTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="font-bold text-gray-900 dark:text-white">{t('documents.editDocument')}</h2>
                                <p className="text-xs text-gray-400 mt-0.5">{t('documents.template')} {editTemplate.name}</p>
                            </div>
                            <button onClick={() => setEditDoc(null)} className="icon-btn"><X size={16} /></button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{t('documents.docTitle')}</label>
                                <input className="input text-sm" placeholder={editTemplate.name}
                                    value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                            </div>
                            {editTemplate.fields.map(f => (
                                <div key={f.key}>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{f.label}</label>
                                    <input className="input text-sm" placeholder={f.label.toLowerCase()}
                                        value={editData[f.key] ?? ''}
                                        onChange={e => setEditData(v => ({ ...v, [f.key]: e.target.value }))} />
                                </div>
                            ))}
                            {editError && (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200">
                                    <AlertCircle size={13} className="text-red-500" />
                                    <p className="text-xs text-red-700 dark:text-red-300">{editError}</p>
                                </div>
                            )}
                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setEditDoc(null)} className="btn flex-1 justify-center">{t('documents.cancel')}</button>
                                <button onClick={handleUpdate} disabled={editSaving} className="btn-primary flex-1 justify-center gap-2">
                                    {editSaving
                                        ? <><Loader2 size={14} className="animate-spin" /> {t('documents.saving')}</>
                                        : <><Printer size={14} /> {t('documents.updatePrint')}</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm Modal ── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="card w-full max-w-sm p-6 text-center">
                        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle size={22} className="text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="font-bold text-gray-900 dark:text-white mb-1">{t('documents.deleteDocument')}</h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">
                            "<span className="font-medium text-gray-700 dark:text-slate-300">{deleteTarget.title}</span>"
                        </p>
                        <p className="text-xs text-gray-400 mb-5">{t('documents.deleteDocumentDesc')}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteTarget(null)} className="btn flex-1 justify-center">{t('documents.cancel')}</button>
                            <button
                                onClick={() => handleDelete(deleteTarget)}
                                className="flex-1 justify-center py-2 px-4 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors font-medium text-sm flex items-center gap-2">
                                <Trash2 size={14} /> {t('documents.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
