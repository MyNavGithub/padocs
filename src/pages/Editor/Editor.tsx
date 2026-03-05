import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontSize } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import FontFamily from '@tiptap/extension-font-family'
import ImageExt from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { convertDocxToHtml } from '../../utils/docxParser'
import {
    Save, Eye, EyeOff, ArrowLeft, Loader2, CheckCircle, AlertCircle,
    Bold, Italic, Underline, Strikethrough,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    List, ListOrdered, Table as TableIcon, Undo2, Redo2,
    FileUp, ChevronDown, Tag, Highlighter, Link as LinkIcon,
    Image as ImageIcon, Subscript as SubIcon, Superscript as SupIcon,
    Minus, Quote, Code2, X,
} from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import {
    getTemplate, createTemplate, updateTemplate,
    extractFields, renderContent, type Template,
} from '../../services/template.service'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../services/firebase'
import { Node, mergeAttributes } from '@tiptap/core'

// ── Image Placeholder Extension — MS-Word floating mode ──────────────────
// The TipTap node is a ZERO-WIDTH anchor in the text flow.
// The floating div is appended to #padocs-a4-page (position:relative)
// and stored at absolute x,y coordinates, exactly like Word floating images.
const _photoSvg = (size: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
        fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="opacity:.6;flex-shrink:0;">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/>
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>`

const ImagePlaceholderExtension = Node.create({
    name: 'imagePlaceholder',
    group: 'inline',
    inline: true,
    atom: true,
    // NOT draggable:true — we handle drag ourselves for float positioning

    addAttributes() {
        return {
            fieldKey: {
                default: 'image',
                parseHTML: (el: Element) => el.getAttribute('data-field-key') ?? 'image',
                renderHTML: (a: Record<string, unknown>) => ({ 'data-field-key': a.fieldKey }),
            },
            width: { default: 150, parseHTML: (el: Element) => Number(el.getAttribute('data-width') ?? 150), renderHTML: (a: Record<string, unknown>) => ({ 'data-width': String(a.width) }) },
            height: { default: 150, parseHTML: (el: Element) => Number(el.getAttribute('data-height') ?? 150), renderHTML: (a: Record<string, unknown>) => ({ 'data-height': String(a.height) }) },
            x: { default: 60, parseHTML: (el: Element) => Number(el.getAttribute('data-x') ?? 60), renderHTML: (a: Record<string, unknown>) => ({ 'data-x': String(a.x) }) },
            y: { default: 60, parseHTML: (el: Element) => Number(el.getAttribute('data-y') ?? 60), renderHTML: (a: Record<string, unknown>) => ({ 'data-y': String(a.y) }) },
        }
    },

    parseHTML() { return [{ tag: 'span[data-type="image-placeholder"]' }] },
    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'image-placeholder', style: 'display:inline;width:0;height:0;overflow:visible;' })]
    },

    addNodeView() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ node, getPos, editor }: { node: any; getPos: any; editor: any }) => {
            let attrs = { ...node.attrs }
            let selected = false
            let floater: HTMLElement | null = null

            // ── Zero-width text-flow anchor ──────────────────────────────────
            const dom = document.createElement('span')
            dom.setAttribute('contenteditable', 'false')
            dom.style.cssText = 'display:inline;width:0;height:0;overflow:visible;position:relative;'

            // ── Floating visual element ──────────────────────────────────────
            const createFloater = () => {
                const page = document.getElementById('padocs-a4-page')
                if (!page) return

                floater = document.createElement('div')

                const box = document.createElement('div')
                const resizeH = document.createElement('div')  // resize corner
                const hud = document.createElement('div')   // position readout

                resizeH.title = 'Drag to resize'
                resizeH.style.cssText = 'display:none;position:absolute;bottom:-7px;right:-7px;width:14px;height:14px;background:#2563eb;border:2px solid #fff;border-radius:50%;cursor:se-resize;z-index:3;box-shadow:0 1px 4px rgba(0,0,0,.4);'

                hud.style.cssText = 'display:none;position:absolute;top:-22px;left:0;background:#2563eb;color:#fff;font-size:10px;font-family:monospace;padding:1px 5px;border-radius:3px;white-space:nowrap;z-index:4;pointer-events:none;'

                const renderFloater = () => {
                    const w = Math.max(50, Number(attrs.width) || 150)
                    const h = Math.max(50, Number(attrs.height) || 150)
                    const x = Math.max(0, Number(attrs.x) || 60)
                    const y = Math.max(0, Number(attrs.y) || 60)
                    const ico = Math.min(Math.round(Math.min(w, h) / 3.5), 36)

                    floater!.style.cssText = [
                        'position:absolute',
                        `left:${x}px`, `top:${y}px`,
                        `width:${w}px`, `height:${h}px`,
                        'z-index:20',          // high enough to always be on top
                        'cursor:move',         // always show move cursor
                    ].join(';')

                    box.style.cssText = [
                        'position:absolute', 'inset:0',
                        'display:flex', 'flex-direction:column',
                        'align-items:center', 'justify-content:center',
                        'gap:5px', 'padding:6px', 'box-sizing:border-box',
                        'overflow:hidden', 'border-radius:4px',
                        `border:2px ${selected ? 'solid #2563eb' : 'dashed #9ca3af'}`,
                        'background:#f0f4ff',
                        `box-shadow:${selected ? '0 0 0 3px rgba(37,99,235,.25)' : 'none'}`,
                        'user-select:none',
                    ].join(';')

                    box.innerHTML = `
                        ${_photoSvg(ico)}
                        <span style="font-family:monospace;font-size:11px;font-weight:700;color:#2563eb;text-align:center;word-break:break-all;line-height:1.2;">{{${attrs.fieldKey}}}</span>
                        <span style="font-family:sans-serif;font-size:9px;color:#6b7280;">${w}×${h}px</span>
                    `

                    // Selection handles (4 corners + 4 edges visual)
                    if (selected) {
                        resizeH.style.display = 'block'
                        hud.style.display = 'block'
                        hud.textContent = `x:${x} y:${y} | ${w}×${h}`
                    } else {
                        resizeH.style.display = 'none'
                        hud.style.display = 'none'
                    }
                }

                // ── Drag to MOVE ─────────────────────────────────────────────
                floater!.addEventListener('mousedown', (e: MouseEvent) => {
                    if ((e.target as Element) === resizeH) return
                    e.preventDefault(); e.stopPropagation()

                    // Immediately show selection handles (visual feedback before
                    // TipTap's async selectNode fires)
                    selected = true; renderFloater()

                    // Tell TipTap to select this node (triggers selectNode → keeps in sync)
                    const nodePos = typeof getPos === 'function' ? getPos() : undefined
                    if (typeof nodePos === 'number') {
                        try { editor.chain().setNodeSelection(nodePos).run() } catch { /* ignore */ }
                    }

                    // Drag-to-move
                    const sx = e.clientX, sy = e.clientY
                    const nx = Number(attrs.x) || 0, ny = Number(attrs.y) || 0
                    const onMove = (mv: MouseEvent) => {
                        const pos = typeof getPos === 'function' ? getPos() : undefined
                        if (typeof pos === 'number') {
                            editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, {
                                ...attrs,
                                x: Math.max(0, Math.round(nx + mv.clientX - sx)),
                                y: Math.max(0, Math.round(ny + mv.clientY - sy)),
                            }))
                        }
                    }
                    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                })

                // ── Drag to RESIZE ────────────────────────────────────────────
                resizeH.addEventListener('mousedown', (e: MouseEvent) => {
                    e.preventDefault(); e.stopPropagation()
                    const sx = e.clientX, sy = e.clientY
                    const sw = Number(attrs.width) || 150, sh = Number(attrs.height) || 150
                    const onMove = (mv: MouseEvent) => {
                        const pos = typeof getPos === 'function' ? getPos() : undefined
                        if (typeof pos === 'number') {
                            editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, {
                                ...attrs,
                                width: Math.max(50, Math.round(sw + mv.clientX - sx)),
                                height: Math.max(50, Math.round(sh + mv.clientY - sy)),
                            }))
                        }
                    }
                    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
                    window.addEventListener('mousemove', onMove)
                    window.addEventListener('mouseup', onUp)
                })

                floater!.appendChild(box)
                floater!.appendChild(resizeH)
                floater!.appendChild(hud)
                page.appendChild(floater!)
                renderFloater()

                return renderFloater
            }

            // Defer so the page element is in DOM
            let _render: (() => void) | null = null
            setTimeout(() => { _render = createFloater() ?? null }, 0)

            return {
                dom,
                contentDOM: null,

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                update(n: any) {
                    if (n.type.name !== 'imagePlaceholder') return false
                    attrs = { ...n.attrs }
                    _render?.()
                    return true
                },

                selectNode() {
                    selected = true
                    if (!floater) _render = createFloater() ?? null
                    _render?.()
                },

                deselectNode() {
                    selected = false
                    _render?.()
                },

                destroy() {
                    floater?.parentElement?.removeChild(floater)
                    floater = null
                },
            }
        }
    },
})


// ── Constants ──────────────────────────────────────────────────────────────

const HEADING_OPTIONS = [
    { label: 'Normal', value: 'paragraph' },
    { label: 'Heading 1', value: 'h1' },
    { label: 'Heading 2', value: 'h2' },
    { label: 'Heading 3', value: 'h3' },
]

const FONT_FAMILIES = [
    { label: 'Default', value: '' },
    { label: 'Times New Roman', value: 'Times New Roman, serif' },
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Courier New', value: 'Courier New, monospace' },
    { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
]

const FONT_SIZES = ['8', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72']



const PLACEHOLDER_PRESETS = [
    'student_name', 'student_id', 'class', 'grade', 'score', 'total',
    'rank', 'subject', 'teacher_name', 'school_name', 'date',
    'academic_year', 'comment', 'parent_name', 'date_of_birth',
]

// ── Toolbar Primitives ─────────────────────────────────────────────────────

function ToolBtn({
    onClick, active = false, disabled = false, title, children,
}: {
    onClick: () => void; active?: boolean; disabled?: boolean
    title: string; children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick() }}
            disabled={disabled}
            title={title}
            aria-label={title}
            className={[
                'w-7 h-7 flex items-center justify-center rounded text-sm transition-all flex-shrink-0',
                active
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700',
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
        >
            {children}
        </button>
    )
}

function TDivider() {
    return <div className="w-px h-5 bg-gray-200 dark:bg-slate-700 mx-0.5 flex-shrink-0" />
}

/** Floating dropdown anchored to a button via fixed positioning */
function ToolDropdown({
    label, btnRef, open, onToggle, onClose, btnClass, children,
}: {
    label: React.ReactNode
    btnRef: React.RefObject<HTMLButtonElement | null>
    open: boolean
    onToggle: () => void
    onClose: () => void
    btnClass?: string
    children: React.ReactNode
}) {
    const [rect, setRect] = useState<DOMRect | null>(null)
    return (
        <div className="relative flex-shrink-0">
            <button
                ref={btnRef}
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault()
                    setRect(btnRef.current?.getBoundingClientRect() ?? null)
                    onToggle()
                }}
                className={btnClass ?? 'flex items-center gap-1 px-2 h-7 rounded text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all'}
            >
                {label}
            </button>
            {open && rect && (
                <>
                    <div className="fixed inset-0 z-40" onMouseDown={onClose} />
                    <div
                        className="fixed z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden"
                        style={{ top: rect.bottom + 4, left: rect.left, minWidth: rect.width }}
                    >
                        {children}
                    </div>
                </>
            )}
        </div>
    )
}

// ── Main Editor ────────────────────────────────────────────────────────────

export default function Editor() {
    const { user, schoolId, role } = useAuth()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()
    const existingId = searchParams.get('id')

    // Template meta
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [pdfReferenceUrl, setPdfReferenceUrl] = useState<string | null>(null)

    // UI state
    const [previewMode, setPreviewMode] = useState(false)
    const [previewData, setPreviewData] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [importing, setImporting] = useState(false)
    const [uploadingPdf, setUploadingPdf] = useState(false)

    // Link dialog
    const [linkDialogOpen, setLinkDialogOpen] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')

    // Image dialog
    const [imgDialogOpen, setImgDialogOpen] = useState(false)
    const [imgTab, setImgTab] = useState<'url' | 'upload' | 'placeholder'>('url')
    const [imgUrl, setImgUrl] = useState('')
    const [imgPlaceholderKey, setImgPlaceholderKey] = useState('')
    const [imgAspect, setImgAspect] = useState<'free' | '1:1' | '4:3' | '16:9' | '3:4' | 'A4'>('4:3')
    const [imgWidth, setImgWidth] = useState(400)
    const [imgAlign, setImgAlign] = useState<'left' | 'center' | 'right'>('center')

    // Dropdowns
    const [headingOpen, setHeadingOpen] = useState(false)
    const [fontFamilyOpen, setFontFamilyOpen] = useState(false)
    const [fontSizeOpen, setFontSizeOpen] = useState(false)
    const [, setLineHeightOpen] = useState(false)
    const [placeholderOpen, setPlaceholderOpen] = useState(false)
    const [customPlaceholder, setCustomPlaceholder] = useState('')

    // Refs
    const docxInputRef = useRef<HTMLInputElement>(null)
    const pdfInputRef = useRef<HTMLInputElement>(null)
    const imgUploadRef = useRef<HTMLInputElement>(null)
    const headingBtnRef = useRef<HTMLButtonElement>(null)
    const fontFamilyBtnRef = useRef<HTMLButtonElement>(null)
    const fontSizeBtnRef = useRef<HTMLButtonElement>(null)
    const placeholderBtnRef = useRef<HTMLButtonElement>(null)

    const closeAll = () => {
        setHeadingOpen(false); setFontFamilyOpen(false)
        setFontSizeOpen(false); setLineHeightOpen(false); setPlaceholderOpen(false)
    }

    // TipTap editor
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            } as Parameters<typeof StarterKit.configure>[0] & { underline?: false }),
            UnderlineExt,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TextStyle,
            Color,
            FontSize,
            FontFamily,
            Highlight.configure({ multicolor: true }),
            Link.configure({ openOnClick: false }),
            ImageExt.configure({ inline: false }),
            ImagePlaceholderExtension,
            Subscript,
            Superscript,
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: '<p></p>',
        editorProps: {
            attributes: { class: 'padocs-editor' },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML()
            const fields = extractFields(html)
            setPreviewData(prev => {
                const next: Record<string, string> = {}
                fields.forEach(f => { next[f.key] = prev[f.key] ?? `[${f.label}]` })
                return next
            })
        },
    })

    // Derived state
    const editorHtml = editor?.getHTML() ?? ''
    const fields = extractFields(editorHtml)

    const currentHeading = (() => {
        if (editor?.isActive('heading', { level: 1 })) return 'h1'
        if (editor?.isActive('heading', { level: 2 })) return 'h2'
        if (editor?.isActive('heading', { level: 3 })) return 'h3'
        return 'paragraph'
    })()

    const currentFont = editor?.getAttributes('textStyle').fontFamily ?? ''
    const currentSize = editor?.getAttributes('textStyle').fontSize ?? ''
    const currentFontLabel = FONT_FAMILIES.find(f => f.value === currentFont)?.label ?? 'Font'

    // Load existing template
    useEffect(() => {
        if (!existingId) return
        setLoading(true)
        getTemplate(existingId).then(tpl => {
            if (!tpl) return
            setName(tpl.name)
            setDescription(tpl.description ?? '')
            setPdfReferenceUrl(tpl.pdfReferenceUrl ?? null)
            editor?.commands.setContent(tpl.content || '<p></p>')
        }).finally(() => setLoading(false))
    }, [existingId, editor])

    // Save
    const handleSave = async () => {
        if (!schoolId || !user) return
        if (!name.trim()) { setError(t('editor.nameRequired')); return }
        const html = editor?.getHTML() ?? ''
        if (!html || html === '<p></p>') { setError(t('editor.contentRequired')); return }
        setError(null); setSaving(true)
        try {
            const tplData: Omit<Template, 'id'> = {
                name: name.trim(),
                description: description.trim(),
                content: html,
                fields: extractFields(html),
                schoolId,
                createdBy: user.uid,
                pdfReferenceUrl: pdfReferenceUrl ?? undefined,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            }
            if (existingId) await updateTemplate(existingId, tplData)
            else await createTemplate(tplData)
            setSaved(true)
            setTimeout(() => { setSaved(false); navigate('/templates') }, 1500)
        } catch (e) {
            setError(t('editor.saveFailed'))
            console.error(e)
        } finally {
            setSaving(false)
        }
    }

    // Import DOCX — deep XML parser for faithful MS Word formatting
    const handleDocxImport = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.docx')) {
            setError(t('editor.docxTypeError'))
            return
        }
        setImporting(true); setError(null)
        try {
            const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as ArrayBuffer)
                reader.onerror = () => reject(new Error('FileReader failed'))
                reader.readAsArrayBuffer(file)
            })

            const result = await convertDocxToHtml(buffer)

            if (result.warnings.length) {
                console.info('[DOCX import] Warnings:', result.warnings)
            }

            const html = result.html
            if (!html || html.trim() === '') {
                setError('DOCX imported but appears empty. Check the file contents.')
            } else {
                // Wrap in a div to preserve all inline styles
                editor?.commands.setContent(
                    `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;">${html}</div>`
                )
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            setError(`Import failed: ${msg}`)
            console.error('[DOCX import] Error:', e)
        } finally {
            setImporting(false)
            if (docxInputRef.current) docxInputRef.current.value = ''
        }
    }

    // Upload PDF reference
    const handlePdfUpload = async (file: File) => {
        if (!schoolId) return
        setUploadingPdf(true); setError(null)
        try {
            const r = storageRef(storage, `schools/${schoolId}/pdf-references/${Date.now()}_${file.name}`)
            await uploadBytes(r, file)
            setPdfReferenceUrl(await getDownloadURL(r))
        } catch (e) {
            setError(t('editor.pdfUploadFailed')); console.error(e)
        } finally {
            setUploadingPdf(false)
            if (pdfInputRef.current) pdfInputRef.current.value = ''
        }
    }

    // Insert placeholder
    const insertPlaceholder = useCallback((key: string) => {
        editor?.chain().focus().insertContent(`{{${key}}}`).run()
        setPlaceholderOpen(false)
        setCustomPlaceholder('')
    }, [editor])

    // Insert image placeholder token with aspect ratio + alignment
    const insertImagePlaceholder = useCallback((key: string) => {
        const ratioMap: Record<string, [number, number]> = {
            '1:1': [1, 1], '4:3': [4, 3], '16:9': [16, 9],
            '3:4': [3, 4], 'A4': [210, 297], 'free': [4, 3],
        }
        const [w, h] = ratioMap[imgAspect]
        const ph = Math.round((imgWidth * h) / w)

        // Insert floating image placeholder — initial position near top-left
        editor?.chain().focus().insertContent({
            type: 'imagePlaceholder',
            attrs: { fieldKey: key, width: imgWidth, height: ph, x: 60, y: 60 },
        }).run()

        setImgDialogOpen(false)
        setImgPlaceholderKey('')
    }, [editor, imgAspect, imgWidth, imgAlign])

    // Insert real image URL
    const insertImageUrl = useCallback(() => {
        if (!imgUrl.trim()) return
        editor?.chain().focus().setImage({ src: imgUrl.trim() }).run()
        setImgDialogOpen(false)
        setImgUrl('')
    }, [editor, imgUrl])

    // Insert uploaded image — fall back to base64 inline if no storage
    const handleImageUpload = async (file: File) => {
        const insertBase64 = () => {
            const reader = new FileReader()
            reader.onload = () => {
                const src = reader.result as string
                editor?.chain().focus().setImage({ src }).run()
            }
            reader.readAsDataURL(file)
        }

        if (!schoolId) {
            // No school context — embed as base64 inline
            insertBase64()
            return
        }
        try {
            const r = storageRef(storage, `schools/${schoolId}/template-images/${Date.now()}_${file.name}`)
            await uploadBytes(r, file)
            const url = await getDownloadURL(r)
            editor?.chain().focus().setImage({ src: url }).run()
        } catch (e: unknown) {
            console.warn('[Image upload] Firebase upload failed, falling back to base64:', e)
            // Fall back to base64 so the user isn't blocked
            insertBase64()
        }
    }

    // Set link
    const applyLink = useCallback(() => {
        if (!linkUrl.trim()) {
            editor?.chain().focus().unsetLink().run()
        } else {
            editor?.chain().focus().setLink({ href: linkUrl.trim() }).run()
        }
        setLinkDialogOpen(false)
        setLinkUrl('')
    }, [editor, linkUrl])

    // Set font size via style
    const setFontSize = useCallback((size: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ; (editor?.chain().focus() as any).setFontSize(`${size}pt`).run()
        setFontSizeOpen(false)
    }, [editor])

    if (role !== 'admin') {
        return (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">
                <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-slate-400">{t('editor.adminOnly')}</p>
            </div>
        )
    }

    if (loading) {
        return <div className="flex justify-center py-16 text-gray-900 dark:text-gray-100"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100" onClick={closeAll}>

            {/* ── Meta bar ── */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-slate-800 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => navigate('/templates')} className="icon-btn flex-shrink-0">
                    <ArrowLeft size={16} />
                </button>
                <input
                    className="flex-1 text-base font-semibold bg-transparent border-0 outline-none text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 min-w-0"
                    placeholder={t('editor.untitled')}
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={() => setPreviewMode(p => !p)}
                        className={`btn gap-1.5 text-xs ${previewMode ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : ''}`}>
                        {previewMode ? <EyeOff size={13} /> : <Eye size={13} />}
                        {previewMode ? t('editor.edit') : t('editor.preview')}
                    </button>
                    {saved && <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />}
                    <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5 text-xs py-1.5 flex-shrink-0">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {saving ? t('editor.saving') : t('editor.save')}
                    </button>
                </div>
            </div>

            {/* ── Toolbar ── */}
            {!previewMode && (
                <div
                    className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 overflow-x-auto flex-shrink-0 toolbar-scroll"
                    onClick={e => e.stopPropagation()}
                >
                    {/* History */}
                    <ToolBtn onClick={() => editor?.chain().focus().undo().run()} title="Undo" disabled={!editor?.can().undo()}>
                        <Undo2 size={14} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().redo().run()} title="Redo" disabled={!editor?.can().redo()}>
                        <Redo2 size={14} />
                    </ToolBtn>

                    <TDivider />

                    {/* Heading */}
                    <ToolDropdown
                        label={<>{HEADING_OPTIONS.find(h => h.value === currentHeading)?.label ?? 'Normal'} <ChevronDown size={11} /></>}
                        btnRef={headingBtnRef}
                        open={headingOpen}
                        onToggle={() => { closeAll(); setHeadingOpen(v => !v) }}
                        onClose={() => setHeadingOpen(false)}
                    >
                        <div className="w-36">
                            {HEADING_OPTIONS.map(h => (
                                <button key={h.value} type="button"
                                    onMouseDown={e => {
                                        e.preventDefault()
                                        if (h.value === 'paragraph') editor?.chain().focus().setParagraph().run()
                                        else editor?.chain().focus().toggleHeading({ level: parseInt(h.value.replace('h', '')) as 1 | 2 | 3 }).run()
                                        setHeadingOpen(false)
                                    }}
                                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors ${currentHeading === h.value ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-slate-300'}`}>
                                    {h.label}
                                </button>
                            ))}
                        </div>
                    </ToolDropdown>

                    <TDivider />

                    {/* Font Family */}
                    <ToolDropdown
                        label={<span className="max-w-[80px] truncate">{currentFontLabel} <ChevronDown size={11} /></span>}
                        btnRef={fontFamilyBtnRef}
                        open={fontFamilyOpen}
                        onToggle={() => { closeAll(); setFontFamilyOpen(v => !v) }}
                        onClose={() => setFontFamilyOpen(false)}
                    >
                        <div className="w-48">
                            {FONT_FAMILIES.map(f => (
                                <button key={f.value} type="button"
                                    onMouseDown={e => {
                                        e.preventDefault()
                                        if (f.value) editor?.chain().focus().setFontFamily(f.value).run()
                                        else editor?.chain().focus().unsetFontFamily().run()
                                        setFontFamilyOpen(false)
                                    }}
                                    style={{ fontFamily: f.value || 'inherit' }}
                                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors ${currentFont === f.value ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-gray-700 dark:text-slate-300'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </ToolDropdown>

                    {/* Font Size */}
                    <ToolDropdown
                        label={<>{currentSize ? currentSize.replace('pt', '') : '12'} <ChevronDown size={11} /></>}
                        btnRef={fontSizeBtnRef}
                        open={fontSizeOpen}
                        onToggle={() => { closeAll(); setFontSizeOpen(v => !v) }}
                        onClose={() => setFontSizeOpen(false)}
                    >
                        <div className="w-16 max-h-52 overflow-y-auto">
                            {FONT_SIZES.map(s => (
                                <button key={s} type="button"
                                    onMouseDown={e => { e.preventDefault(); setFontSize(s) }}
                                    className={`w-full text-center px-2 py-1 text-xs hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors ${currentSize === `${s}pt` ? 'text-indigo-600 font-bold' : 'text-gray-700 dark:text-slate-300'}`}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    </ToolDropdown>

                    <TDivider />

                    {/* Text Format */}
                    <ToolBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} title="Bold (Ctrl+B)">
                        <Bold size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} title="Italic (Ctrl+I)">
                        <Italic size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive('underline')} title="Underline (Ctrl+U)">
                        <Underline size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleStrike().run()} active={editor?.isActive('strike')} title="Strikethrough">
                        <Strikethrough size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleSubscript().run()} active={editor?.isActive('subscript')} title="Subscript">
                        <SubIcon size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleSuperscript().run()} active={editor?.isActive('superscript')} title="Superscript">
                        <SupIcon size={13} />
                    </ToolBtn>

                    <TDivider />

                    {/* Highlight */}
                    <div className="relative flex-shrink-0 group" title="Highlight color">
                        <label className="w-7 h-7 flex items-center justify-center rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-all relative">
                            <Highlighter size={13} className={editor?.isActive('highlight') ? 'text-yellow-600' : 'text-gray-600 dark:text-slate-400'} />
                            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                defaultValue="#fef08a"
                                onChange={e => editor?.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
                        </label>
                    </div>

                    {/* Text Color */}
                    <div className="relative flex-shrink-0" title="Text color">
                        <label className="w-7 h-7 flex items-center justify-center rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 transition-all">
                            <span className="text-xs font-bold" style={{ color: editor?.getAttributes('textStyle').color || 'currentColor' }}>A</span>
                            <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-full"
                                onChange={e => editor?.chain().focus().setColor(e.target.value).run()} />
                        </label>
                    </div>

                    <TDivider />

                    {/* Alignment */}
                    <ToolBtn onClick={() => editor?.chain().focus().setTextAlign('left').run()} active={editor?.isActive({ textAlign: 'left' })} title="Align Left">
                        <AlignLeft size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().setTextAlign('center').run()} active={editor?.isActive({ textAlign: 'center' })} title="Align Center">
                        <AlignCenter size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().setTextAlign('right').run()} active={editor?.isActive({ textAlign: 'right' })} title="Align Right">
                        <AlignRight size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().setTextAlign('justify').run()} active={editor?.isActive({ textAlign: 'justify' })} title="Justify">
                        <AlignJustify size={13} />
                    </ToolBtn>

                    <TDivider />

                    {/* Lists & Blocks */}
                    <ToolBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} title="Bullet List">
                        <List size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive('orderedList')} title="Numbered List">
                        <ListOrdered size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleBlockquote().run()} active={editor?.isActive('blockquote')} title="Quote">
                        <Quote size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().toggleCodeBlock().run()} active={editor?.isActive('codeBlock')} title="Code block">
                        <Code2 size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
                        <Minus size={13} />
                    </ToolBtn>
                    <ToolBtn onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert Table">
                        <TableIcon size={13} />
                    </ToolBtn>

                    <TDivider />

                    {/* Link */}
                    <ToolBtn
                        onClick={() => { setLinkUrl(editor?.getAttributes('link').href ?? ''); setLinkDialogOpen(true) }}
                        active={editor?.isActive('link')}
                        title="Insert Link"
                    >
                        <LinkIcon size={13} />
                    </ToolBtn>

                    {/* Image */}
                    <ToolBtn onClick={() => setImgDialogOpen(true)} title="Insert Image">
                        <ImageIcon size={13} />
                    </ToolBtn>

                    <TDivider />

                    {/* Insert Placeholder */}
                    <ToolDropdown
                        label={<><Tag size={11} /> {t('editor.insertPlaceholder')} <ChevronDown size={11} /></>}
                        btnRef={placeholderBtnRef}
                        open={placeholderOpen}
                        onToggle={() => { closeAll(); setPlaceholderOpen(v => !v) }}
                        onClose={() => setPlaceholderOpen(false)}
                        btnClass="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 transition-all"
                    >
                        <div className="w-56">
                            <div className="px-3 py-2">
                                <div className="flex gap-1">
                                    <input
                                        className="input text-xs py-1 h-auto flex-1"
                                        placeholder={t('editor.insertCustomField')}
                                        value={customPlaceholder}
                                        onChange={e => setCustomPlaceholder(e.target.value.replace(/\s/g, '_'))}
                                        onKeyDown={e => { if (e.key === 'Enter' && customPlaceholder) insertPlaceholder(customPlaceholder) }}
                                        autoFocus
                                    />
                                    <button type="button"
                                        className="btn-primary text-xs px-2 py-1 h-auto"
                                        disabled={!customPlaceholder}
                                        onMouseDown={e => { e.preventDefault(); if (customPlaceholder) insertPlaceholder(customPlaceholder) }}>
                                        +
                                    </button>
                                </div>
                            </div>
                            <div className="border-t border-gray-100 dark:border-slate-700 pt-1 max-h-52 overflow-y-auto">
                                <p className="px-3 py-0.5 text-xs text-gray-400">{t('editor.commonFields')}</p>
                                {PLACEHOLDER_PRESETS.map(key => (
                                    <button key={key} type="button"
                                        onMouseDown={e => { e.preventDefault(); insertPlaceholder(key) }}
                                        className="w-full text-left px-3 py-1 text-xs text-gray-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-300 font-mono transition-colors">
                                        {`{{${key}}}`}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </ToolDropdown>

                    <TDivider />

                    {/* Import DOCX */}
                    <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); docxInputRef.current?.click() }}
                        disabled={importing}
                        className="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 transition-all flex-shrink-0"
                        title={t('editor.importDocx')}>
                        {importing ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />}
                        {importing ? t('editor.importing') : t('editor.importDocx')}
                    </button>
                    <input ref={docxInputRef} type="file" accept=".docx" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDocxImport(f) }} />
                    <input ref={imgUploadRef} type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }} />
                </div>
            )}

            {/* ── Error bar ── */}
            {error && (
                <div className="mx-4 mt-2 flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 flex-shrink-0">
                    <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs text-red-700 dark:text-red-300 flex-1">{error}</p>
                    <button type="button" className="icon-btn text-red-400 h-5 w-5" onClick={() => setError(null)}><X size={12} /></button>
                </div>
            )}

            {/* ── Content area ── */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left sidebar */}
                <div className="w-52 flex-shrink-0 border-r border-gray-100 dark:border-slate-800 overflow-y-auto bg-white dark:bg-slate-900">
                    <div className="p-4 space-y-5">
                        {/* Description */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                {t('editor.description')}
                            </label>
                            <textarea
                                className="input text-xs h-20 resize-none"
                                placeholder={t('editor.descriptionPlaceholder')}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                        </div>

                        {/* PDF Reference */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                {t('editor.pdfReference')}
                            </label>
                            <button
                                type="button"
                                onClick={() => pdfInputRef.current?.click()}
                                disabled={uploadingPdf}
                                className="btn w-full text-xs gap-1.5 justify-center">
                                {uploadingPdf
                                    ? <><Loader2 size={11} className="animate-spin" /> {t('editor.uploading')}</>
                                    : <><FileUp size={11} /> {t('editor.uploadPdf')}</>}
                            </button>
                            {pdfReferenceUrl && (
                                <a href={pdfReferenceUrl} target="_blank" rel="noreferrer"
                                    className="block mt-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate">
                                    {t('editor.viewReference')}
                                </a>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{t('editor.pdfReferenceDesc')}</p>
                            <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f) }} />
                        </div>

                        {/* Fields */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                                # {t('editor.fields')} ({fields.length})
                            </label>
                            <div className="space-y-0.5">
                                {fields.length === 0
                                    ? <p className="text-xs text-gray-400 italic">{t('editor.noFields')}</p>
                                    : fields.map(f => (
                                        <div key={f.key}
                                            onClick={() => insertPlaceholder(f.key)}
                                            title={`Click to insert {{${f.key}}}`}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-gray-600 dark:text-slate-300 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/40 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors font-mono">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                                            {f.key}
                                        </div>
                                    ))
                                }
                            </div>
                        </div>

                        {/* Image placeholders tip */}
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">💡 Image Placeholders</p>
                            <p className="text-xs text-amber-600 dark:text-amber-500">
                                Use the <span className="font-mono">🖼 Image</span> toolbar button to insert a dashed placeholder that will be filled at document generation time.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Editor / Preview */}
                <div className="flex-1 overflow-y-auto bg-gray-100 dark:bg-slate-950 p-6">
                    <div
                        id="padocs-a4-page"
                        className="max-w-[794px] mx-auto min-h-[1000px] bg-white text-black shadow-lg rounded-lg"
                        style={{ position: 'relative' }}
                    >
                        {previewMode ? (
                            <div className="padocs-editor p-8 min-h-[900px]"
                                dangerouslySetInnerHTML={{
                                    __html: renderContent(editorHtml, previewData),
                                }} />
                        ) : (
                            <div className="p-8 min-h-[900px]">
                                <EditorContent editor={editor} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Preview fill panel */}
                {previewMode && fields.length > 0 && (
                    <div className="w-64 flex-shrink-0 border-l border-gray-100 dark:border-slate-800 overflow-y-auto bg-white dark:bg-slate-900 p-4">
                        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                            {t('editor.previewData')}
                        </p>
                        <div className="space-y-3">
                            {fields.map(f => (
                                <div key={f.key}>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-0.5">{f.label}</label>
                                    <input
                                        className="input text-xs"
                                        value={previewData[f.key] ?? ''}
                                        onChange={e => setPreviewData(prev => ({ ...prev, [f.key]: e.target.value }))}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Link Dialog ── */}
            {linkDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="card w-full max-w-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-gray-800 dark:text-slate-200">Insert Link</h2>
                            <button type="button" className="icon-btn" onClick={() => setLinkDialogOpen(false)}><X size={16} /></button>
                        </div>
                        <input
                            className="input mb-3"
                            placeholder="https://example.com"
                            value={linkUrl}
                            onChange={e => setLinkUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') applyLink() }}
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button type="button" className="btn flex-1 justify-center" onClick={() => setLinkDialogOpen(false)}>Cancel</button>
                            <button type="button" className="btn-primary flex-1 justify-center" onClick={applyLink}>
                                {linkUrl ? 'Insert' : 'Remove Link'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Image Dialog ── */}
            {imgDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="card w-full max-w-md p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-gray-800 dark:text-slate-200">Insert Image</h2>
                            <button type="button" className="icon-btn" onClick={() => setImgDialogOpen(false)}><X size={16} /></button>
                        </div>

                        {/* Tabs */}
                        <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden mb-4">
                            {(['url', 'upload', 'placeholder'] as const).map(tab => (
                                <button key={tab} type="button"
                                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${imgTab === tab
                                        ? 'bg-indigo-600 text-white'
                                        : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                                        }`}
                                    onClick={() => setImgTab(tab)}>
                                    {tab === 'url' ? 'Image URL' : tab === 'upload' ? 'Upload' : 'Placeholder'}
                                </button>
                            ))}
                        </div>

                        {/* URL Tab */}
                        {imgTab === 'url' && (
                            <div className="space-y-3">
                                <input className="input" placeholder="https://example.com/image.jpg"
                                    value={imgUrl} onChange={e => setImgUrl(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') insertImageUrl() }} autoFocus />
                                <div className="flex gap-2">
                                    <button type="button" className="btn flex-1 justify-center" onClick={() => setImgDialogOpen(false)}>Cancel</button>
                                    <button type="button" className="btn-primary flex-1 justify-center" disabled={!imgUrl} onClick={insertImageUrl}>Insert</button>
                                </div>
                            </div>
                        )}

                        {/* Upload Tab */}
                        {imgTab === 'upload' && (
                            <div className="space-y-3">
                                <div
                                    className="border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl p-8 text-center cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                                    onClick={() => imgUploadRef.current?.click()}>
                                    <ImageIcon size={28} className="text-indigo-400 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Click to upload image</p>
                                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, WEBP</p>
                                </div>
                                <button type="button" className="btn w-full justify-center" onClick={() => setImgDialogOpen(false)}>Cancel</button>
                            </div>
                        )}

                        {/* Placeholder Tab */}
                        {imgTab === 'placeholder' && (
                            <div className="space-y-4">
                                {/* Field name */}
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-slate-400 block mb-1">Field name</label>
                                    <input className="input text-sm" placeholder="e.g. student_photo"
                                        value={imgPlaceholderKey}
                                        onChange={e => setImgPlaceholderKey(e.target.value.replace(/\s/g, '_'))}
                                        autoFocus />
                                    <p className="text-xs text-gray-400 mt-1">Will be inserted as <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{'{'}{'{'}{imgPlaceholderKey || 'field_name'}{'}'}{'}'}{'}'}</code></p>
                                </div>

                                {/* Aspect ratio */}
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-slate-400 block mb-2">Aspect Ratio</label>
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {(['free', '1:1', '4:3', '16:9', '3:4', 'A4'] as const).map(r => (
                                            <button key={r} type="button"
                                                className={`py-1.5 rounded-lg text-xs font-medium border transition-all ${imgAspect === r
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-indigo-400'
                                                    }`}
                                                onClick={() => setImgAspect(r)}>
                                                {r === 'A4' ? '📄 A4' : r === 'free' ? 'Free' : r}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Width */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Width</label>
                                        <span className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">{imgWidth}px</span>
                                    </div>
                                    <input type="range" min="100" max="794" step="10"
                                        value={imgWidth}
                                        onChange={e => setImgWidth(Number(e.target.value))}
                                        className="w-full accent-indigo-600" />
                                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                                        <span>100px (small)</span><span>794px (full page)</span>
                                    </div>
                                </div>

                                {/* Alignment */}
                                <div>
                                    <label className="text-xs font-medium text-gray-600 dark:text-slate-400 block mb-2">Alignment</label>
                                    <div className="flex gap-2">
                                        {([['left', '←  Left'], ['center', '⎯ Center'], ['right', 'Right  →']] as const).map(([val, lbl]) => (
                                            <button key={val} type="button"
                                                className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${imgAlign === val
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:border-indigo-400'
                                                    }`}
                                                onClick={() => setImgAlign(val)}>{lbl}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Preview */}
                                {imgAspect !== 'free' && (
                                    <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                                        <p className="text-xs text-gray-400 mb-2">Preview</p>
                                        {(() => {
                                            const ratioMap: Record<string, [number, number]> = {
                                                '1:1': [1, 1], '4:3': [4, 3], '16:9': [16, 9],
                                                '3:4': [3, 4], 'A4': [210, 297], 'free': [4, 3],
                                            }
                                            const [w, h] = ratioMap[imgAspect]
                                            const previewW = 120
                                            const previewH = Math.round((previewW * h) / w)
                                            return (
                                                <div style={{ width: previewW, height: previewH, margin: '0 auto' }}
                                                    className="border-2 border-dashed border-indigo-400 rounded bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                                                    <span className="text-xs text-indigo-500">{imgAspect}</span>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <button type="button" className="btn flex-1 justify-center" onClick={() => setImgDialogOpen(false)}>Cancel</button>
                                    <button type="button" className="btn-primary flex-1 justify-center"
                                        disabled={!imgPlaceholderKey}
                                        onClick={() => insertImagePlaceholder(imgPlaceholderKey)}>
                                        Insert Placeholder
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
