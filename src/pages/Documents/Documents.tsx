/**
 * Documents.tsx — Document Generation
 * ─────────────────────────────────────────────────────────────────────────────
 * When accessed with ?new=templateId: shows a field form, fills the .docx
 * template via docxtemplater, renders a preview, and allows download.
 *
 * When accessed without params: shows the list of previously generated docs.
 *
 * Zero TipTap. Zero HTML conversion. Pure .docx XML workflow.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FileText, Plus, Download, Loader2, AlertCircle, X,
  Eye, ArrowLeft, CheckCircle, Trash2, Search,
  AlertTriangle, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import {
  getTemplate, renderContent,
  type Template,
} from '../../services/template.service'
import { supabase } from '../../services/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredDocument {
  id: string
  name: string
  templateId: string
  templateName: string
  generatedAt: string
  generatedBy: string
  fileUrl?: string
  fieldValues?: Record<string, string>
}

// ─── Document Generation Flow ─────────────────────────────────────────────────

function DocumentGenerator({
  templateId,
  onBack,
  onSaved,
}: {
  templateId: string
  onBack: () => void
  onSaved: (doc: StoredDocument) => void
}) {
  const { user, schoolId } = useAuth()
  const { t } = useTranslation()

  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [filledBlob, setFilledBlob] = useState<Blob | null>(null)
  const [step, setStep] = useState<'form' | 'preview'>('form')
  const [docName, setDocName] = useState('')
  const [saved, setSaved] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Load template
  useEffect(() => {
    setLoading(true)
    getTemplate(templateId)
      .then(tpl => {
        if (!tpl) { setError(t('documents.templateNotFound')); return }
        setTemplate(tpl)
        setDocName(tpl.name + ' — ' + new Date().toLocaleDateString())
        // Pre-fill empty values
        const init: Record<string, string> = {}
        tpl.fields.forEach(f => { init[f] = '' })
        setFieldValues(init)
      })
      .catch(() => setError(t('documents.loadFailed')))
      .finally(() => setLoading(false))
  }, [templateId])

  // Render preview with docx-preview
  useEffect(() => {
    if (step !== 'preview' || !filledBlob || !previewRef.current) return
    import('docx-preview').then(({ renderAsync }) => {
      renderAsync(filledBlob, previewRef.current!, undefined, {
        className: 'docx-preview-content',
        inWrapper: false,
        ignoreWidth: false,
        ignoreHeight: false,
      }).catch(console.warn)
    })
  }, [step, filledBlob])

  // Generate filled .docx in memory
  const handleGenerate = useCallback(async () => {
    if (!template?.content || template.content.byteLength === 0) {
      setError(t('documents.errNoDocx'))
      return
    }
    setGenerating(true); setError(null)
    try {
      const blob = renderContent(template.content, fieldValues)
      setFilledBlob(blob)
      setStep('preview')
    } catch (e: any) {
      setError(t('documents.errGenParams'))
      console.error(e)
    } finally { setGenerating(false) }
  }, [template, fieldValues])

  // Download .docx
  const handleDownloadDocx = useCallback(() => {
    if (!filledBlob) return
    const url = URL.createObjectURL(filledBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = docName.replace(/[^a-z0-9\s\-_]/gi, '') + '.docx'
    a.click()
    URL.revokeObjectURL(url)
  }, [filledBlob, docName])

  // Save document record to Supabase
  const handleSave = useCallback(async () => {
    if (!filledBlob || !schoolId || !user || !template) return
    setSaving(true); setError(null)
    try {
      const fileName = `${schoolId}/${template.id}/${Date.now()}.docx`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, filledBlob, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)

      const { data: record, error: dbError } = await supabase
        .from('documents')
        .insert({
          school_id: schoolId,
          template_id: template.id,
          name: docName,
          generated_by: user.id,
          file_url: urlData.publicUrl,
          field_values: fieldValues,
        })
        .select()
        .single()

      if (dbError) throw dbError

      setSaved(true)
      onSaved({
        id: record.id,
        name: docName,
        templateId: template.id!,
        templateName: template.name,
        generatedAt: record.created_at,
        generatedBy: user.id,
        fileUrl: urlData.publicUrl,
      })
    } catch (e) {
      console.error(e)
      // Don't block user — they already have the file downloaded
      setError(t('documents.errSaveRecord'))
    } finally { setSaving(false) }
  }, [filledBlob, schoolId, user, template, docName, fieldValues, onSaved])

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
  if (!template) return null

  return (
    <div className="max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="icon-btn text-gray-500"><ArrowLeft size={18} /></button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('documents.generateTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">{t('documents.templateLabel')}{template.name}</p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-6">
        {(['form', 'preview'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              ${step === s ? 'bg-indigo-600 text-white' : i < (['form', 'preview'].indexOf(step)) ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-400'}`}>
              {i < (['form', 'preview'].indexOf(step)) ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium ${step === s ? 'text-indigo-600' : 'text-gray-400'}`}>
              {s === 'form' ? t('documents.stepForm') : t('documents.stepPreview')}
            </span>
            {i === 0 && <ChevronRight size={14} className="text-gray-300 mx-1" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-5 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="icon-btn text-red-400"><X size={13} /></button>
        </div>
      )}

      {/* ── STEP 1: Field Form ── */}
      {step === 'form' && (
        <div className="card p-6 space-y-5">
          {/* Document name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{t('documents.docName')}</label>
            <input
              className="input w-full"
              value={docName}
              onChange={e => setDocName(e.target.value)}
              placeholder={t('documents.docNamePlaceholder')}
            />
          </div>

          {/* Field inputs */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-3 uppercase tracking-wide">
              {t('documents.fieldsCount', { count: template.fields.length })}
            </label>

            {template.fields.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">{t('documents.noFieldsFound')}</p>
                <p className="text-xs text-gray-300 mt-1">{t('documents.editToAddFields')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {template.fields.map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      {field.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                      <span className="ml-1 font-mono text-indigo-400 text-xs">{'{' + field + '}'}</span>
                    </label>
                    <input
                      className="input w-full text-sm"
                      placeholder={t('documents.enterField', { field: field.replace(/_/g, ' ') })}
                      value={fieldValues[field] ?? ''}
                      onChange={e => setFieldValues(prev => ({ ...prev, [field]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="btn-primary gap-2"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {generating ? t('documents.generating') : t('documents.previewDoc')}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Preview & Download ── */}
      {step === 'preview' && filledBlob && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">{docName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t('documents.reviewPmt')}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setStep('form')} className="btn-secondary gap-1.5 text-sm">
                <ArrowLeft size={13} /> {t('documents.editFieldsBtn')}
              </button>
              <button type="button" onClick={handleDownloadDocx} className="btn-secondary gap-1.5 text-sm">
                <Download size={13} /> {t('documents.downloadDocxBtn')}
              </button>
              {!saved ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary gap-1.5 text-sm"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  {saving ? t('documents.saving') : t('documents.saveDocumentBtn')}
                </button>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                  <CheckCircle size={14} /> {t('documents.savedBadge')}
                </span>
              )}
            </div>
          </div>

          {/* docx-preview render */}
          <div className="flex justify-center rounded-xl overflow-auto min-h-[1123px]">
            <div className="a4-container shadow-2xl">
              <div ref={previewRef} className="w-full h-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Document Preview Modal ──────────────────────────────────────────────
function DocumentPreviewModal({ doc, onClose }: { doc: StoredDocument; onClose: () => void }) {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!previewRef.current || !doc.fileUrl) return
    setLoading(true)
    fetch(doc.fileUrl)
      .then(res => res.blob())
      .then(blob => {
        import('docx-preview').then(({ renderAsync }) => {
          renderAsync(blob, previewRef.current!, undefined, {
            className: 'docx-preview-content',
            inWrapper: false,
            ignoreWidth: false,
            ignoreHeight: false,
          }).finally(() => setLoading(false))
        })
      })
      .catch(e => {
        console.error('Failed to load doc for preview:', e)
        setLoading(false)
      })
  }, [doc.fileUrl])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-transparent w-full max-w-4xl min-h-screen py-8 flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
        <div className="w-[794px] flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-2xl border border-white/20 shadow-xl">
          <div>
            <h2 className="font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter text-xl">{doc.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge badge-success px-2 py-0.5 text-[10px] font-bold uppercase">{t('documents.generatedDocBadge')}</span>
              <p className="text-xs text-gray-500 font-medium">{doc.templateName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"><X size={20} /></button>
        </div>

        <div className="relative shadow-2xl">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-lg">
              <Loader2 size={40} className="animate-spin text-indigo-600" />
            </div>
          )}
          <div className="a4-container flex flex-col overflow-hidden">
            <div ref={previewRef} className="w-full flex-1" />
          </div>
        </div>

        <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest bg-black/20 px-4 py-2 rounded-full backdrop-blur-sm">
          {t('documents.viewerModeCreated', { date: new Date(doc.generatedAt).toLocaleDateString() })}
        </p>
      </div>
    </div>
  )
}

function DocumentList({
  docs,
  loading,
  onNew,
  onEdit,
  onPreview,
  onDelete,
}: {
  docs: StoredDocument[]
  loading: boolean
  onNew: () => void
  onEdit: (doc: StoredDocument) => void
  onPreview: (doc: StoredDocument) => void
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = docs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.templateName.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await supabase.from('documents').delete().eq('id', id)
      onDelete(id)
    } catch { } finally {
      setDeleting(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText size={24} className="text-indigo-600" /> {t('documents.title', 'Documents')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{t('documents.docsGenerated', { count: docs.length, defaultValue: '{{count}} document(s) generated' })}</p>
        </div>
        <button onClick={onNew} className="btn-primary gap-2 self-start sm:self-auto">
          <Plus size={15} /> {t('documents.newDoc', 'New Document')}
        </button>
      </div>

      {docs.length > 0 && (
        <div className="relative mb-5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 max-w-sm" placeholder={t('documents.searchPlace', 'Search documents...')} value={search} onChange={e => setSearch(e.target.value)} />
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
            {search ? t('documents.noDocsSearch') : t('documents.noDocuments')}
          </h2>
          <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
            {search ? t('documents.noDocsSearchDesc') : t('documents.generateToStart')}
          </p>
          {!search && (
            <button onClick={onNew} className="btn-primary gap-2">
              <Plus size={15} /> {t('documents.generateFirstBtn')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(doc => (
            <div key={doc.id} className="card p-6 flex flex-col gap-4 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group relative border-indigo-50/50 dark:border-slate-800">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                  <FileText size={22} strokeWidth={2.5} />
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                  <button onClick={() => onPreview(doc)} className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all" title={t('documents.quickPreview')}><Eye size={16} /></button>
                  <button onClick={() => onEdit(doc)} className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all" title={t('documents.modifyValues')}><Plus size={16} /></button>
                  {doc.fileUrl && (
                    <a
                      href={doc.fileUrl}
                      download
                      className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-400 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all"
                      title={t('documents.downloadHint')}
                    >
                      <Download size={16} />
                    </a>
                  )}
                  <button
                    onClick={() => setConfirmDeleteId(doc.id)}
                    className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all"
                    title={t('documents.deleteUpper')}
                  >
                    {deleting === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex-1">
                <h3 className="font-black text-lg text-gray-900 dark:text-white leading-tight mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">{doc.name}</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Template: {doc.templateName}</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-slate-800 mt-auto">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md">
                  {Object.keys(doc.fieldValues || {}).length} {t('documents.fieldsFilled', 'FIELDS FILLED')}
                </span>
                <span className="text-[10px] font-bold text-gray-400">
                  {new Date(doc.generatedAt).toLocaleDateString()}
                </span>
              </div>

              {confirmDeleteId === doc.id && (
                <div className="absolute inset-0 rounded-2xl bg-white/98 dark:bg-slate-950/98 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6 z-20 border-2 border-red-500/20">
                  <AlertTriangle size={28} className="text-red-500 animate-bounce" />
                  <p className="text-sm font-black uppercase tracking-tight text-center">{t('documents.deleteConfirmTitle')}</p>
                  <div className="flex gap-2 w-full mt-2">
                    <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-colors uppercase">{t('documents.cancelUpper')}</button>
                    <button onClick={() => handleDelete(doc.id)} className="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs font-black transition-colors uppercase">{t('documents.deleteUpper')}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Documents() {
  const { t } = useTranslation()
  const { schoolId } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const newTemplateId = searchParams.get('new')

  const [docs, setDocs] = useState<StoredDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [previewDoc, setPreviewDoc] = useState<StoredDocument | null>(null)

  // Load documents
  useEffect(() => {
    if (!schoolId) return
    setLoadingDocs(true)
    const fetchDocs = async () => {
      try {
        const { data, error } = await supabase
          .from('documents')
          .select('*, templates(name)')
          .eq('school_id', schoolId)
          .order('created_at', { ascending: false })

        if (error || !data) {
          setLoadingDocs(false)
          return
        }
        setDocs(data.map((d: any) => ({
          id: d.id,
          name: d.name,
          templateId: d.template_id,
          templateName: d.templates?.name ?? 'Unknown',
          generatedAt: d.created_at,
          generatedBy: d.generated_by,
          fileUrl: d.file_url,
          fieldValues: d.field_values,
        })))
        setLoadingDocs(false)
      } catch {
        setLoadingDocs(false)
      }
    }
    fetchDocs()
  }, [schoolId])

  // If ?new=templateId, go straight to generator
  if (newTemplateId) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <DocumentGenerator
          templateId={newTemplateId}
          onBack={() => {
            setSearchParams({})
          }}
          onSaved={doc => {
            setDocs(prev => [doc, ...prev])
            setSearchParams({})
          }}
        />
      </div>
    )
  }

  const handleNew = async () => {
    // Load templates to pick from
    if (!schoolId) return
    setLoadingTemplates(true)
    setShowTemplatePicker(true)
    const { data } = await supabase.from('templates').select('id, name').eq('school_id', schoolId).eq('is_active', true)
    setTemplates(data ?? [])
    setLoadingTemplates(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {showTemplatePicker ? (
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setShowTemplatePicker(false)} className="icon-btn text-gray-500"><ArrowLeft size={18} /></button>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('documents.chooseTemplate')}</h2>
          </div>
          {loadingTemplates ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-3">{t('documents.noTemplatesAvail')}</p>
              <button onClick={() => navigate('/templates')} className="btn-primary gap-2 text-sm">
                <Plus size={14} /> {t('documents.createTemplateFirst')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    setShowTemplatePicker(false)
                    setSearchParams({ new: tpl.id })
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-100 dark:border-slate-800 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-indigo-600" />
                  </div>
                  <span className="font-medium text-sm text-gray-800 dark:text-slate-200">{tpl.name}</span>
                  <ChevronRight size={14} className="ml-auto text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <DocumentList
          docs={docs}
          loading={loadingDocs}
          onNew={handleNew}
          onEdit={doc => {
            setSearchParams({ new: doc.templateId })
          }}
          onPreview={doc => setPreviewDoc(doc)}
          onDelete={id => setDocs(prev => prev.filter(d => d.id !== id))}
        />
      )}

      {previewDoc && (
        <DocumentPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  )
}
