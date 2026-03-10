import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FolderOpen, Users, Plus, Printer, X, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { getSchoolTemplates, type Template } from '../../services/template.service'
import { getSchoolDocuments, generateDocument, downloadDocument, type GeneratedDocument } from '../../services/document.service'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
    return (
        <div className="card p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
                {icon}
            </div>
            <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{label}</p>
            </div>
        </div>
    )
}

export default function Dashboard() {
    const { t } = useTranslation()
    const { user, schoolId, schoolName, role } = useAuth()
    const navigate = useNavigate()

    const [templates, setTemplates] = useState<Template[]>([])
    const [documents, setDocuments] = useState<GeneratedDocument[]>([])
    const [teacherCount, setTeacherCount] = useState(0)
    const [loading, setLoading] = useState(true)

    // Generate modal
    const [showModal, setShowModal] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
    const [docTitle, setDocTitle] = useState('')
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
    const [generating, setGenerating] = useState(false)
    const [genError, setGenError] = useState<string | null>(null)

    useEffect(() => {
        if (!schoolId) return
        const load = async () => {
            setLoading(true)
            try {
                // Run queries independently so one failure doesn't block the rest
                const [tmpl, docs] = await Promise.all([
                    getSchoolTemplates(schoolId).catch((e) => { console.error('Templates fetch failed:', e); return [] }),
                    getSchoolDocuments(schoolId).catch((e) => { console.error('Documents fetch failed:', e); return [] }),
                ])
                setTemplates(tmpl)
                setDocuments(docs)

                // Teachers count
                try {
                    const { count, error } = await supabase
                        .from('users')
                        .select('*', { count: 'exact', head: true })
                        .eq('school_id', schoolId)
                        .eq('role', 'teacher')

                    if (!error && count !== null) {
                        setTeacherCount(count)
                    }
                } catch (e) {
                    console.error('Teacher count fetch failed:', e)
                }
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [schoolId])

    const openGenerateModal = (tpl: Template) => {
        setSelectedTemplate(tpl)
        setDocTitle('')
        setFieldValues(Object.fromEntries(tpl.fields.map(f => [f, ''])))
        setGenError(null)
        setShowModal(true)
    }

    const handleGenerate = async () => {
        if (!selectedTemplate || !schoolId || !user) return
        const empty = selectedTemplate.fields.find(f => !fieldValues[f]?.trim())
        if (empty) { setGenError(t('documents.fillRequired', { field: empty })); return }
        setGenerating(true); setGenError(null)
        try {
            const { docxBlob } = await generateDocument(selectedTemplate, fieldValues, user.id, docTitle || selectedTemplate.name)
            setShowModal(false)
            // Refresh docs
            getSchoolDocuments(schoolId).then(setDocuments)
            // Auto download
            downloadDocument(docxBlob, docTitle || selectedTemplate.name)
        } catch (e) {
            setGenError(t('documents.generationFailed'))
            console.error(e)
        } finally {
            setGenerating(false)
        }
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Welcome */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {t('dashboard.title')} 👋
                </h1>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    {schoolName} · {role === 'admin' ? t('dashboard.roleAdmin') : t('dashboard.roleTeacher')}
                </p>
            </div>

            {/* Stats */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <StatCard icon={<FileText size={20} className="text-white" />} label={t('dashboard.totalTemplates')} value={templates.length} color="bg-indigo-600" />
                        <StatCard icon={<FolderOpen size={20} className="text-white" />} label={t('dashboard.docsGenerated')} value={documents.length} color="bg-emerald-600" />
                        <StatCard icon={<Users size={20} className="text-white" />} label={t('dashboard.teachers')} value={teacherCount} color="bg-amber-500" />
                    </div>

                    {/* Quick actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                        <div className="card p-5">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">{t('dashboard.quickActions')}</h2>
                            <div className="space-y-2">
                                <button onClick={() => navigate('/editor')}
                                    className="w-full flex items-center justify-between p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                                            <Plus size={14} className="text-white" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{t('dashboard.createDocument')}</p>
                                            <p className="text-xs text-gray-500 dark:text-slate-400">{t('dashboard.createDocumentDesc')}</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={15} className="text-gray-400 group-hover:text-indigo-600 transition-colors" />
                                </button>
                                <button onClick={() => navigate('/templates')}
                                    className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                                            <FileText size={14} className="text-gray-600 dark:text-slate-300" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{t('dashboard.generateDocument')}</p>
                                            <p className="text-xs text-gray-500 dark:text-slate-400">{t('dashboard.generateDocumentDesc')}</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={15} className="text-gray-400 group-hover:text-gray-700 dark:group-hover:text-slate-200 transition-colors" />
                                </button>
                            </div>
                        </div>

                        {/* Recent documents */}
                        <div className="card p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.recentDocuments')}</h2>
                                <button onClick={() => navigate('/documents')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{t('dashboard.viewAll')}</button>
                            </div>
                            {documents.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-6">{t('dashboard.noDocuments')}</p>
                            ) : (
                                <div className="space-y-2">
                                    {documents.slice(0, 4).map(doc => (
                                        <div key={doc.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-slate-800 last:border-0">
                                            <div>
                                                <p className="text-xs font-medium text-gray-700 dark:text-slate-300 truncate max-w-[180px]">{doc.title}</p>
                                                <p className="text-xs text-gray-400">{doc.templateName}</p>
                                            </div>
                                            <button onClick={() => { /* regenerate or download if URL? */ }} className="icon-btn" title="Download" disabled>
                                                <Printer size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Templates grid (if any) */}
                    {templates.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('dashboard.yourTemplates')}</h2>
                                <button onClick={() => navigate('/templates')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{t('dashboard.viewAll')}</button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {templates.slice(0, 3).map(tpl => (
                                    <div key={tpl.id} className="card p-4 flex flex-col gap-2 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                                                <FileText size={14} className="text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <span className="text-xs text-gray-400">{t('templates.fields', { count: tpl.fields.length })}</span>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-800 dark:text-slate-200 leading-tight">{tpl.name}</p>
                                        {tpl.description && <p className="text-xs text-gray-400 leading-tight line-clamp-2">{tpl.description}</p>}
                                        <button onClick={() => openGenerateModal(tpl)}
                                            className="btn-primary text-xs py-1.5 mt-auto justify-center">
                                            {t('dashboard.useTemplate')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ── Generate Modal ── */}
            {showModal && selectedTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-gray-900 dark:text-white">{selectedTemplate.name}</h2>
                            <button onClick={() => setShowModal(false)} className="icon-btn"><X size={16} /></button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{t('documents.docTitle')}</label>
                                <input className="input text-sm" placeholder={selectedTemplate.name}
                                    value={docTitle} onChange={e => setDocTitle(e.target.value)} />
                            </div>

                            {selectedTemplate.fields.map(field => (
                                <div key={field}>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">{field}</label>
                                    <input className="input text-sm"
                                        placeholder={`${field.toLowerCase()}`}
                                        value={fieldValues[field] ?? ''}
                                        onChange={e => setFieldValues(v => ({ ...v, [field]: e.target.value }))} />
                                </div>
                            ))}

                            {genError && (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                                    <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
                                    <p className="text-xs text-red-700 dark:text-red-300">{genError}</p>
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button onClick={() => setShowModal(false)} className="btn flex-1 justify-center">{t('common.cancel')}</button>
                                <button onClick={handleGenerate} disabled={generating} className="btn-primary flex-1 justify-center gap-2">
                                    {generating
                                        ? <><Loader2 size={14} className="animate-spin" /> {t('documents.generating')}</>
                                        : <><Printer size={14} /> {t('documents.generate')}</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
