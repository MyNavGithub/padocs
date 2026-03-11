import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    FileText, Plus, Edit2, Trash2, Loader2, Search,
    AlertCircle, X, Eye,
    ArrowLeft, Upload, Tag, Save,
    ChevronRight, ChevronDown, EyeOff, RefreshCw,
} from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import {
    getSchoolTemplates, deleteTemplate, type Template,
    getTemplate, createTemplate, updateTemplate,
    extractFields, readDocxFile
} from '../../services/template.service'
import { parseDocxParagraphs, injectFieldsIntoDocx, type DocxParagraph, type FieldInjection } from '../../utils/docxFieldInjector'

// ─── Sub-component Types ──────────────────────────────────────────────────

type Step = 'upload' | 'setup' | 'confirm'
type Path = 'A' | 'B' | null

interface DetectedField {
    name: string
    label: string
    type: 'text' | 'date' | 'number' | 'dropdown'
    required: boolean
    defaultValue: string
    options: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function humanLabel(fieldName: string): string {
    return fieldName
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^\w/, c => c.toUpperCase())
}

// ─── Sub-components for Editor ────────────────────────────────────────────

function StepIndicator({ step }: { step: Step }) {
    const { t } = useTranslation() // Missing hook for StepIndicator strings
    const steps: { key: Step; label: string }[] = [
        { key: 'upload', label: t('templates.upload') },
        { key: 'setup', label: t('templates.setupFields') },
        { key: 'confirm', label: t('templates.saveTemplate') },
    ]
    const idx = steps.findIndex(s => s.key === step)
    return (
        <div className="flex items-center gap-0 mb-8">
            {steps.map((s, i) => (
                <div key={s.key} className="flex items-center" style={{ flex: i < steps.length - 1 ? 1 : 'none' }}>
                    <div className="flex flex-col items-center gap-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${i < idx ? 'bg-indigo-600 text-white' : i === idx ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900' : 'bg-gray-100 dark:bg-slate-800 text-gray-400'}`}>
                            {i < idx ? '✓' : i + 1}
                        </div>
                        <span className={`text-xs whitespace-nowrap ${i === idx ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>{s.label}</span>
                    </div>
                    {i < steps.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-2 mb-5 transition-all ${i < idx ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'}`} />
                    )}
                </div>
            ))}
        </div>
    )
}

function FieldRow({
    field, onChange, onRemove,
}: {
    field: DetectedField
    onChange: (f: DetectedField) => void
    onRemove: () => void
}) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    return (
        <div className="border border-gray-100 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900">
                <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                <code className="text-xs text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded flex-shrink-0">
                    {'{' + field.name + '}'}
                </code>
                <input
                    className="flex-1 text-sm border-0 bg-transparent outline-none text-gray-800 dark:text-slate-200 placeholder-gray-300"
                    placeholder={t('templates.humanLabel')}
                    value={field.label}
                    onChange={e => onChange({ ...field, label: e.target.value })}
                />
                <select
                    className="text-xs border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300"
                    value={field.type}
                    onChange={e => onChange({ ...field, type: e.target.value as DetectedField['type'] })}
                >
                    <option value="text">{t('templates.typeText')}</option>
                    <option value="date">{t('templates.typeDate')}</option>
                    <option value="number">{t('templates.typeNumber')}</option>
                    <option value="dropdown">{t('templates.typeDropdown')}</option>
                </select>
                <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="icon-btn text-gray-400"
                    title={t('templates.moreOptions')}
                >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <button type="button" onClick={onRemove} className="icon-btn text-gray-300 hover:text-red-400">
                    <Trash2 size={13} />
                </button>
            </div>
            {expanded && (
                <div className="px-4 pb-3 pt-1 bg-gray-50 dark:bg-slate-950 flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
                        <input
                            type="checkbox"
                            checked={field.required}
                            onChange={e => onChange({ ...field, required: e.target.checked })}
                        />
                        {t('common.required')}
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{t('common.default')}</span>
                        <input
                            className="input text-xs py-0.5 px-2 h-6 w-32"
                            placeholder={t('templates.optionalDefault')}
                            value={field.defaultValue}
                            onChange={e => onChange({ ...field, defaultValue: e.target.value })}
                        />
                    </div>
                    {field.type === 'dropdown' && (
                        <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-gray-500">{t('templates.optionsComma')}</span>
                            <input
                                className="input text-xs py-0.5 px-2 h-6 flex-1"
                                placeholder={t('templates.optionEx')}
                                value={field.options}
                                onChange={e => onChange({ ...field, options: e.target.value })}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function ParagraphPicker({
    paragraphs,
    injections,
    onInject,
    onRemoveInjection,
    onContinue,
}: {
    paragraphs: DocxParagraph[]
    injections: FieldInjection[]
    onInject: (inj: FieldInjection) => void
    onRemoveInjection: (injIndex: number) => void
    onContinue?: () => void
}) {
    const { t } = useTranslation()
    const [selected, setSelected] = useState<number | null>(null)
    const [fieldName, setFieldName] = useState('')
    const [position, setPosition] = useState<FieldInjection['position']>('replaceText')
    const [targetText, setTargetText] = useState('')


    return (
        <div className="flex flex-col lg:flex-row gap-6 h-full w-full items-start">
            {/* Left Column: Paragraph List */}
            <div className="flex-1 w-full min-w-0 lg:min-w-[700px] border border-gray-100 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col min-h-[1123px]">
                <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('templates.docContent')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('templates.selectBlockDesc')}</p>
                </div>
                <div className="divide-y divide-gray-50 dark:divide-slate-800 overflow-y-auto">
                    {paragraphs.filter(p => !p.isEmpty).map(p => {
                        const pInjections = injections.filter(i => i.paragraphIndex === p.index)
                        const isSelected = selected === p.index
                        return (
                            <div
                                key={p.index}
                                onClick={() => setSelected(p.index)}
                                className={`px-5 py-4 cursor-pointer transition-all flex items-start gap-4 group
                  ${isSelected ? 'bg-indigo-50/80 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-200 dark:ring-indigo-800' : 'hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                            >
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    <p className={`text-sm leading-relaxed break-words whitespace-normal font-medium ${p.text.startsWith('[TABLE]') ? 'text-gray-400 italic' : 'text-gray-700 dark:text-slate-300'}`}>
                                        {p.text || <span className="text-gray-300 italic">{t('templates.emptyParagraph')}</span>}
                                    </p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {pInjections.map((inj, idx) => (
                                            <div key={idx} className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                                                <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-800">
                                                    {'{' + inj.fieldName + '}'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {pInjections.length > 0 && (
                                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 animate-in zoom-in duration-300">
                                        {pInjections.length}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Right Column: Settings Panel */}
            <div className="w-full lg:w-[400px] flex-shrink-0 sticky top-6 flex flex-col gap-6">
                {selected !== null ? (
                    <div className="card-glass p-6 gap-6 flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-indigo-100 dark:border-indigo-900/50 shadow-xl rounded-2xl animate-in slide-in-from-right-4 duration-300">
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">{t('templates.activeBlockSnippet')}</p>
                                <button onClick={() => setSelected(null)} className="icon-btn-sm"><X size={14} /></button>
                            </div>
                            <div
                                className="text-xs text-gray-600 dark:text-slate-400 p-4 bg-gray-50 dark:bg-slate-950 border border-indigo-50 dark:border-indigo-900/30 rounded-xl leading-relaxed cursor-text selection:bg-indigo-200 selection:text-indigo-900 break-all max-h-40 overflow-y-auto"
                                onMouseUp={() => {
                                    const sel = window.getSelection()?.toString().trim();
                                    if (sel && position === 'replaceText') setTargetText(sel);
                                }}
                            >
                                {paragraphs.find(p => p.index === selected)?.text}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 italic flex items-center gap-1">
                                <Search size={10} /> {t('templates.highlightHint')}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-tighter mb-1.5 block">{t('templates.fieldIdentifier')}</label>
                                <div className="relative">
                                    <input
                                        className="input pl-3 pr-10 py-3 text-sm w-full font-mono bg-white dark:bg-slate-950"
                                        placeholder="student_name"
                                        value={fieldName}
                                        onChange={e => setFieldName(e.target.value.replace(/\s/g, '_').toLowerCase())}
                                    />
                                    <code className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-indigo-400 font-bold">{'{...}'}</code>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-tighter mb-1.5 block">{t('templates.insertionLogic')}</label>
                                <select
                                    className="input py-3 text-sm w-full bg-white dark:bg-slate-950"
                                    value={position}
                                    onChange={e => setPosition(e.target.value as FieldInjection['position'])}
                                >
                                    <option value="replaceText">{t('templates.replaceWord')}</option>
                                    <option value="before">{t('templates.beforeBlock')}</option>
                                    <option value="after">{t('templates.afterBlock')}</option>
                                    <option value="replace">{t('templates.wipeBlock')}</option>
                                </select>
                            </div>

                            {position === 'replaceText' && (
                                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-tighter mb-1.5 block">{t('templates.targetString')}</label>
                                    <input
                                        className="input py-3 text-sm w-full bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-800 focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/20"
                                        placeholder={t('templates.pasteToFind')}
                                        value={targetText}
                                        onChange={e => setTargetText(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* List existing injections for THIS paragraph */}
                        {injections.some(i => i.paragraphIndex === selected) && (
                            <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-slate-800">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">{t('templates.existingFieldsBlock')}</p>
                                <div className="flex flex-col gap-1.5">
                                    {injections.map((inj, idx) => {
                                        if (inj.paragraphIndex !== selected) return null;
                                        return (
                                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/20 group/item">
                                                <code className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                                                    {idx + 1}. {'{' + inj.fieldName + '}'}
                                                </code>
                                                <button
                                                    onClick={() => onRemoveInjection(idx)}
                                                    className="icon-btn-sm text-red-400 opacity-0 group-hover/item:opacity-100"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
                            <button
                                type="button"
                                disabled={!fieldName.trim() || (position === 'replaceText' && !targetText.trim())}
                                onClick={() => {
                                    if (!fieldName.trim()) return
                                    if (position === 'replaceText' && !targetText.trim()) return
                                    onInject({
                                        paragraphIndex: selected,
                                        fieldName: fieldName.trim(),
                                        position,
                                        targetText: position === 'replaceText' ? targetText : undefined
                                    })
                                    setFieldName('')
                                    setTargetText('')
                                }}
                                className="btn-primary w-full justify-center gap-2 py-4 shadow-lg shadow-indigo-100 dark:shadow-indigo-900/20"
                            >
                                <Plus size={16} /> {t('templates.addMarker')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="card p-8 border-dashed border-2 flex flex-col items-center justify-center text-center gap-4 bg-gray-50/50 dark:bg-slate-900/50">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-400">
                            <Tag size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-600 dark:text-slate-300">{t('templates.readyToMap')}</p>
                            <p className="text-xs text-gray-400 mt-1">{t('templates.startAddingFields')}</p>
                        </div>
                    </div>
                )}

                {/* Final Done Button (Always available if we have injections) */}
                {injections.length > 0 && onContinue && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <button
                            onClick={onContinue}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-2xl shadow-xl shadow-emerald-200 dark:shadow-emerald-900/30 flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02] active:scale-[0.98] group"
                        >
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-12 transition-transform">
                                <Save size={18} />
                            </div>
                            <span className="text-lg font-black uppercase tracking-widest text-emerald-50">{t('templates.generateTemplate')}</span>
                        </button>
                        <p className="text-[10px] text-center text-gray-400 mt-3 font-medium">
                            {t('templates.readyWithFields', { count: injections.length })}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}


function TemplateEditor({ onCancel, onSaved }: { onCancel: () => void, onSaved: () => void }) {
    const { user, schoolId, role } = useAuth()
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()
    const existingId = searchParams.get('id')

    const [step, setStep] = useState<Step>('upload')
    const [path, setPath] = useState<Path>(null)
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [docxBuffer, setDocxBuffer] = useState<ArrayBuffer | null>(null)
    const [docxFileName, setDocxFileName] = useState('')
    const [uploading, setUploading] = useState(false)
    const [fields, setFields] = useState<DetectedField[]>([])
    const [newFieldName, setNewFieldName] = useState('')
    const [paragraphs, setParagraphs] = useState<DocxParagraph[]>([])
    const [injections, setInjections] = useState<FieldInjection[]>([])
    const [parseParagraphsLoading, setParseParagraphsLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const [dragOver, setDragOver] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!existingId) return
        setLoading(true)
        getTemplate(existingId).then(tpl => {
            if (!tpl) return
            setName(tpl.name)
            setDescription(tpl.description ?? '')
            if (tpl.content && tpl.content.byteLength > 0) {
                setDocxBuffer(tpl.content)
                setDocxFileName(tpl.name + '.docx')
                const found = extractFields(tpl.content)
                setFields(found.map(f => ({
                    name: f, label: humanLabel(f),
                    type: 'text', required: false, defaultValue: '', options: '',
                })))
                setStep('confirm')
                setPath('A')
            }
        }).catch(() => setError(t('templates.errFailedToLoad')))
            .finally(() => setLoading(false))
    }, [existingId])

    const handleFile = useCallback(async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.docx')) {
            setError(t('templates.errPleaseUpload'))
            return
        }
        setUploading(true); setError(null)
        try {
            const buffer = await readDocxFile(file)
            setDocxBuffer(buffer)
            setDocxFileName(file.name)
            if (!name) setName(file.name.replace('.docx', '').replace(/_/g, ' '))
            setStep('setup')
        } catch {
            setError(t('templates.errFailedToRead'))
        } finally { setUploading(false) }
    }, [name])

    const handlePathA = useCallback(() => {
        if (!docxBuffer) return
        setPath('A')
        const found = extractFields(docxBuffer)
        if (found.length === 0) {
            setError(t('templates.errNoMarkersPathA'))
            return
        }
        setError(null)
        setFields(found.map(f => ({
            name: f, label: humanLabel(f),
            type: 'text', required: false, defaultValue: '', options: '',
        })))
        setStep('confirm')
    }, [docxBuffer])

    const handlePathB = useCallback(async () => {
        if (!docxBuffer) return
        setPath('B')
        setParseParagraphsLoading(true); setError(null)
        try {
            const paras = await parseDocxParagraphs(docxBuffer)
            setParagraphs(paras)
        } catch {
            setError(t('templates.errFailedToParse'))
        } finally { setParseParagraphsLoading(false) }
    }, [docxBuffer])

    const handleApplyInjections = useCallback(async () => {
        if (!docxBuffer || injections.length === 0) {
            setError(t('templates.errAddOneField'))
            return
        }
        setUploading(true); setError(null)
        try {
            const newBuffer = await injectFieldsIntoDocx(docxBuffer, injections)
            setDocxBuffer(newBuffer)
            const found = extractFields(newBuffer)
            setFields(found.map(f => ({
                name: f, label: humanLabel(f),
                type: 'text', required: false, defaultValue: '', options: '',
            })))
            setStep('confirm')
        } catch {
            setError(t('templates.errFailedToInject'))
        } finally { setUploading(false) }
    }, [docxBuffer, injections])

    const addManualField = useCallback(() => {
        const fn = newFieldName.trim().replace(/\s/g, '_')
        if (!fn || fields.find(f => f.name === fn)) return
        setFields(prev => [...prev, {
            name: fn, label: humanLabel(fn),
            type: 'text', required: false, defaultValue: '', options: '',
        }])
        setNewFieldName('')
    }, [newFieldName, fields])

    useEffect(() => {
        if (!showPreview || !docxBuffer || !previewRef.current) return
        import('docx-preview').then(({ renderAsync }) => {
            if (!previewRef.current) return
            renderAsync(
                new Blob([docxBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
                previewRef.current,
                undefined,
                { className: 'docx-preview-content', inWrapper: true }
            ).catch(console.warn)
        })
    }, [showPreview, docxBuffer])

    const handleSave = async () => {
        if (!schoolId || !user) return
        if (!name.trim()) { setError(t('templates.errNameRequired')); return }
        if (!docxBuffer || docxBuffer.byteLength === 0) { setError(t('templates.errDocxRequired')); return }
        if (fields.length === 0) { setError(t('templates.errFieldRequired')); return }

        setSaving(true); setError(null)
        try {
            const fieldNames = fields.map(f => f.name)
            if (existingId) {
                await updateTemplate(existingId, {
                    name: name.trim(),
                    description: description.trim(),
                    fields: fieldNames,
                    schoolId,
                    content: docxBuffer,
                    isActive: true,
                })
            } else {
                await createTemplate({
                    name: name.trim(),
                    description: description.trim(),
                    fields: fieldNames,
                    schoolId,
                    createdBy: user.id,
                    content: docxBuffer,
                    isActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
            }
            setSaved(true)
            setTimeout(() => onSaved(), 1000)
        } catch (e) {
            setError(t('templates.errFailedToSave'))
            console.error(e)
        } finally { setSaving(false) }
    }

    if (role !== 'admin') {
        return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800">
                <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-slate-400">{t('templates.onlyAdmins')}</p>
                <button onClick={onCancel} className="btn mt-4">{t('templates.goBack')}</button>
            </div>
        )
    }

    if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <button onClick={onCancel} className="icon-btn text-gray-500"><ArrowLeft size={18} /></button>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                        {existingId ? t('templates.editTemplate') : t('templates.newTemplate')}
                    </h1>
                </div>
            </div>

            <StepIndicator step={step} />

            {error && (
                <div className="flex items-center gap-2 p-3 mb-6 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="icon-btn text-red-400"><X size={13} /></button>
                </div>
            )}

            {step === 'upload' && (
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center gap-4 cursor-pointer transition-all
            ${dragOver ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                >
                    {uploading ? <Loader2 size={40} className="text-indigo-500 animate-spin" /> : (
                        <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <Upload size={28} className="text-indigo-600 dark:text-indigo-400" />
                        </div>
                    )}
                    <div className="text-center">
                        <p className="text-base font-semibold text-gray-800 dark:text-slate-200 mb-1">
                            {uploading ? t('templates.readingFile') : t('templates.dropHere')}
                        </p>
                        <p className="text-sm text-gray-400">{t('templates.orBrowse')}</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".docx" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                </div>
            )}

            {step === 'setup' && docxBuffer && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <FileText size={18} className="text-indigo-600" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold">{docxFileName}</p>
                            <p className="text-xs text-gray-500">{t('templates.readyChoose')}</p>
                        </div>
                        <button onClick={() => { setStep('upload'); setPath(null); setDocxBuffer(null) }}
                            className="icon-btn text-gray-400"><RefreshCw size={14} /></button>
                    </div>

                    {!path && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button type="button" onClick={handlePathA} className="p-6 rounded-2xl border-2 border-gray-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left transition-all group">
                                <h3 className="text-sm font-bold mb-2 group-hover:text-indigo-600">{t('templates.scanExisting')}</h3>
                                <p className="text-xs text-gray-500">{t('templates.scanExistingDesc')}</p>
                            </button>
                            <button type="button" onClick={handlePathB} disabled={parseParagraphsLoading} className="p-6 rounded-2xl border-2 border-gray-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left transition-all group">
                                {parseParagraphsLoading ? <Loader2 size={14} className="animate-spin mb-1" /> : null}
                                <h3 className="text-sm font-bold mb-2 group-hover:text-indigo-600">{t('templates.addFieldsApp')}</h3>
                                <p className="text-xs text-gray-500">{t('templates.addFieldsAppDesc')}</p>
                            </button>
                        </div>
                    )}

                    {path === 'B' && paragraphs.length > 0 && (
                        <div className="min-h-[1123px] w-full">
                            <ParagraphPicker
                                paragraphs={paragraphs}
                                injections={injections}
                                onInject={inj => setInjections(prev => [...prev, inj])}
                                onRemoveInjection={idx => setInjections(prev => prev.filter((_, i) => i !== idx))}
                            />
                            <div className="flex justify-end mt-4">
                                <button onClick={handleApplyInjections} className="btn-primary">{t('templates.continue')}</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {step === 'confirm' && (
                <div className="space-y-4">
                    <div className="card p-5 space-y-3">
                        <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t('templates.templateNameUpper')}</label>
                        <input className="input" placeholder={t('templates.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} />
                        <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t('templates.descriptionUpper')}</label>
                        <textarea className="input" rows={2} placeholder={t('templates.descPlaceholder')} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>

                    <div className="card p-5 space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-bold">{t('templates.fieldsCountCount', { count: fields.length })}</h2>
                            <button onClick={() => setShowPreview(!showPreview)} className="btn text-xs gap-1.5">
                                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />} {showPreview ? t('templates.hidePreview') : t('templates.previewDocx')}
                            </button>
                        </div>
                        {showPreview && <div ref={previewRef} className="border border-gray-100 rounded-xl min-h-[1123px] overflow-auto bg-gray-50 p-2" />}
                        <div className="space-y-2">
                            {fields.map((f, i) => (
                                <FieldRow key={f.name} field={f}
                                    onChange={upd => setFields(prev => prev.map((x, j) => j === i ? upd : x))}
                                    onRemove={() => setFields(prev => prev.filter((_, j) => j !== i))} />
                            ))}
                            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                                <input
                                    className="input flex-1 text-sm"
                                    placeholder={t('templates.addCustomFieldPlace')}
                                    value={newFieldName}
                                    onChange={e => setNewFieldName(e.target.value.replace(/\s/g, '_').toLowerCase())}
                                    onKeyDown={e => { if (e.key === 'Enter') addManualField() }}
                                />
                                <button type="button" onClick={addManualField} disabled={!newFieldName.trim()} className="btn gap-1.5 text-sm">
                                    <Plus size={14} /> {t('common.add')}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between">
                        <button onClick={() => setStep('setup')} className="btn">{t('common.back')}</button>
                        <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {saved ? t('common.saved') : existingId ? t('common.update') : t('templates.saveTemplateLabel')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Template Preview Modal ───────────────────────────────────────────────

function TemplatePreviewModal({ tpl, onClose }: { tpl: Template; onClose: () => void }) {
    const { t } = useTranslation()
    const previewRef = useRef<HTMLDivElement>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    useEffect(() => {
        if (!previewRef.current) return
        setLoading(true)
        getTemplate(tpl.id!, true).then(fullTpl => {
            if (fullTpl?.content) {
                import('docx-preview').then(({ renderAsync }) => {
                    if (!previewRef.current) return
                    renderAsync(fullTpl.content, previewRef.current, undefined, {
                        inWrapper: false,
                        ignoreWidth: false,
                        ignoreHeight: false,
                    }).finally(() => setLoading(false))
                })
            }
        })
    }, [tpl.id])

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
            <div className="bg-transparent w-full max-w-4xl min-h-screen py-8 flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
                <div className="w-[794px] flex items-center justify-between px-6 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur rounded-2xl border border-white/20 shadow-xl">
                    <div>
                        <h2 className="font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter text-xl">{tpl.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="badge badge-primary px-2 py-0.5 text-[10px] font-bold uppercase">{t('templates.fieldsCountCount', { count: tpl.fields.length })}</span>
                            {tpl.description && <p className="text-xs text-gray-500 font-medium">{tpl.description}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"><X size={20} /></button>
                </div>

                <div className="relative">
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
                    {t('templates.previewMode')} • {tpl.name}
                </p>
            </div>
        </div>
    )
}

// ─── Main Templates Page ──────────────────────────────────────────────────

export default function Templates() {
    const { schoolId, role } = useAuth()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const { t } = useTranslation()

    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const [previewTpl, setPreviewTpl] = useState<Template | null>(null)
    const [error, setError] = useState<string | null>(null)

    const isCreating = searchParams.get('new') === 'true'
    const editingId = searchParams.get('id')
    const showEditor = isCreating || !!editingId

    const isAdmin = role === 'admin'

    const load = useCallback(async () => {
        if (!schoolId) return
        setLoading(true)
        try { setTemplates(await getSchoolTemplates(schoolId)) }
        catch { setError(t('templates.loadFailed')) }
        finally { setLoading(false) }
    }, [schoolId, t])

    useEffect(() => { load() }, [load])

    const handleDelete = async (tpl: Template) => {
        if (!tpl.id) return
        setConfirmDeleteId(null)
        try {
            await deleteTemplate(tpl.id)
            setTemplates(prev => prev.filter(t => t.id !== tpl.id))
        } catch { setError(t('templates.deleteFailed')) }
    }

    const filtered = templates.filter(tpl =>
        tpl.name.toLowerCase().includes(search.toLowerCase()) ||
        tpl.description?.toLowerCase().includes(search.toLowerCase())
    )

    const closeEditor = () => {
        setSearchParams(prev => {
            prev.delete('new')
            prev.delete('id')
            return prev
        })
    }

    if (showEditor) {
        return (
            <div className="p-4 lg:p-8 w-full max-w-[1700px] mx-auto min-h-screen">
                <TemplateEditor onCancel={closeEditor} onSaved={() => { closeEditor(); load(); }} />
            </div>
        )
    }

    return (
        <div className="p-4 lg:p-8 w-full max-w-[1700px] mx-auto min-h-screen">
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
                    <button onClick={() => setSearchParams({ new: 'true' })} className="btn-primary gap-2 self-start sm:self-auto">
                        <Plus size={15} /> {t('templates.newTemplate')}
                    </button>
                )}
            </div>

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
                        <AlertCircle size={15} className="text-red-500" />
                        <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                    <FileText size={48} className="text-gray-200 mx-auto mb-4" />
                    <h2 className="text-base font-semibold">{t('templates.noTemplates')}</h2>
                    <p className="text-sm text-gray-400 mb-6">{t('templates.noTemplatesDesc')}</p>
                    {isAdmin && (
                        <button onClick={() => setSearchParams({ new: 'true' })} className="btn-primary gap-2">
                            <Plus size={15} /> {t('templates.createFirst')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(tpl => (
                        <div key={tpl.id} className="card p-5 flex flex-col gap-3 group relative hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-indigo-50/50 dark:border-slate-800">
                            <div className="flex items-start justify-between">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                                    <FileText size={22} strokeWidth={2.5} />
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                    <button onClick={() => navigate(`/documents?new=${tpl.id}`)} className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 flex items-center justify-center hover:bg-green-600 hover:text-white transition-all"><Plus size={16} /></button>
                                    <button onClick={() => setPreviewTpl(tpl)} className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all"><Eye size={16} /></button>
                                    {isAdmin && (
                                        <>
                                            <button onClick={() => setSearchParams({ id: tpl.id as string })} className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all"><Edit2 size={16} /></button>
                                            <button onClick={() => setConfirmDeleteId(tpl.id ?? null)} className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mt-2">
                                <h3 className="font-black text-lg text-gray-900 dark:text-white leading-tight mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{tpl.name}</h3>
                                {tpl.description && <p className="text-xs font-medium text-gray-400 line-clamp-2">{tpl.description}</p>}
                            </div>

                            <div className="flex items-center gap-2 mt-2 pt-3 border-t border-gray-50 dark:border-slate-800">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-md">
                                    {tpl.fields.length} {t('templates.fieldsMapped', 'FIELDS MAPPED')}
                                </span>
                            </div>

                            {confirmDeleteId === tpl.id && (
                                <div className="absolute inset-0 rounded-2xl bg-white/98 dark:bg-slate-950/98 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6 z-20 border-2 border-red-500/20">
                                    <AlertCircle size={28} className="text-red-500 animate-bounce" />
                                    <p className="text-sm font-black uppercase tracking-tight text-center">{t('templates.deleteTemplate', 'Delete Template?')}</p>
                                    <div className="flex gap-2 w-full mt-2">
                                        <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-colors uppercase">{t('common.cancel', 'Cancel')}</button>
                                        <button onClick={() => handleDelete(tpl)} className="flex-1 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs font-black transition-colors uppercase">{t('common.delete', 'Delete')}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {previewTpl && <TemplatePreviewModal tpl={previewTpl} onClose={() => setPreviewTpl(null)} />}
        </div>
    )
}
