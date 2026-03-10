// Editor.tsx — A4 multi-page WYSIWYG print-preview editor
// Layout: [Header bar] → [Toolbar, flex-wrap] → [Rulers + Grey canvas → paginated A4 pages]
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Node, Extension, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import {
    Save, ArrowLeft, Loader2, CheckCircle, AlertCircle,
    Bold, Italic, Underline, Strikethrough,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    List, ListOrdered, Undo2, Redo2,
    FileUp, ChevronDown, Tag, X,
    Highlighter, Link as LinkIcon,
    Image as ImageIcon,
    Table as TableIcon,
    Subscript as SubIcon, Superscript as SupIcon,
    Minus, RemoveFormatting, ZoomIn,
    IndentIncrease, IndentDecrease,
} from 'lucide-react'
import { useAuth } from '../../app/AuthContext'
import { getTemplate, createTemplate, updateTemplate, extractFields, readDocxFile, type Template } from '../../services/template.service'
import { convertDocxToHtml } from '../../utils/docxParser'
import { supabase } from '../../services/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FONT_FAMILIES = [
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Arial Black', value: '"Arial Black", Gadget, sans-serif' },
    { label: 'Calibri', value: 'Calibri, Candara, sans-serif' },
    { label: 'Cambria', value: 'Cambria, Georgia, serif' },
    { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive' },
    { label: 'Courier New', value: '"Courier New", Courier, monospace' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Gill Sans', value: '"Gill Sans", "Gill Sans MT", Calibri, sans-serif' },
    { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
    { label: 'Impact', value: 'Impact, Charcoal, sans-serif' },
    { label: 'Lucida Console', value: '"Lucida Console", Monaco, monospace' },
    { label: 'Palatino', value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
    { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
]
const FONT_SIZES = ['8', '10', '11', '12', '14', '16', '18', '24', '36']

const PLACEHOLDER_PRESETS = [
    'student_name', 'student_id', 'class', 'grade', 'score',
    'total', 'rank', 'subject', 'teacher_name', 'school_name',
    'date', 'academic_year', 'comment', 'parent_name', 'date_of_birth',
]

const LINE_SPACING_OPTIONS = [
    { label: '1.0', value: '0.85' },
    { label: '1.15', value: '1.0' },
    { label: '1.5', value: '1.25' },
    { label: '2.0', value: '1.75' },
    { label: '2.5', value: '2.25' },
    { label: '3.0', value: '2.75' },
]

const CHAR_SPACING_OPTIONS = [
    { label: 'Tight', value: '-0.05em' },
    { label: 'Normal', value: '0em' },
    { label: 'Loose', value: '0.1em' },
    { label: 'Very Loose', value: '0.2em' },
]

const ZOOM_OPTIONS = [50, 75, 100, 125, 150, 200]

/** A4 at 96 dpi: 794 px wide, 1123 px tall.
 *  Word default margins: 1 inch top/bottom, 1.25 inch left/right. */
const PAGE_H_PX = 1123  // A4 height at 96 dpi
const PAGE_W_PX = 794   // A4 width  at 96 dpi

// ─────────────────────────────────────────────────────────────────────────────
// Custom inline TipTap extensions (no external package required)
// ─────────────────────────────────────────────────────────────────────────────

/** FontSize — stores font-size as a TextStyle attribute and renders it as
 *  an inline style on <span> via TextStyle's renderHTML merge. */
const FontSize: any = Extension.create({
    name: 'fontSize',
    addGlobalAttributes() {
        return [{
            types: ['textStyle'],
            attributes: {
                fontSize: {
                    default: null,
                    parseHTML: el => el.style.fontSize || null,
                    renderHTML: attrs => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
                },
            },
        }]
    },
    addCommands(): any {
        return {
            setFontSize: (size: string) => ({ chain }: { chain: () => { updateAttributes: (t: string, a: Record<string, string>) => { run: () => void } } }) =>
                chain().updateAttributes('textStyle', { fontSize: size }).run(),
            unsetFontSize: () => ({ chain }: { chain: () => { updateAttributes: (t: string, a: Record<string, unknown>) => { run: () => void } } }) =>
                chain().updateAttributes('textStyle', { fontSize: null }).run(),
        }
    },
})

/** LineHeight — extends paragraph/heading with a lineHeight attribute that
 *  renders as an inline style, so it persists in the ProseMirror doc. */
const LineHeight: any = Extension.create({
    name: 'lineHeight',
    addGlobalAttributes() {
        return [{
            types: ['paragraph', 'heading'],
            attributes: {
                lineHeight: {
                    default: null,
                    parseHTML: el => (el as HTMLElement).style.lineHeight || null,
                    renderHTML: attrs => attrs.lineHeight ? { style: `line-height:${attrs.lineHeight}` } : {},
                },
            },
        }]
    },
    addCommands(): any {
        return {
            setLineHeight: (val: string) => ({ tr, state, dispatch }: { tr: import('@tiptap/pm/state').Transaction; state: import('@tiptap/pm/state').EditorState; dispatch?: (tr: import('@tiptap/pm/state').Transaction) => void }) => {
                const { from, to } = state.selection
                state.doc.nodesBetween(from, to, (node, pos) => {
                    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight: val })
                    }
                })
                if (dispatch) dispatch(tr)
                return true
            },
        } as any
    },
})

/** Indent — tracks paragraph indentLevel (0–16) and applies margin-left as
 *  an inline style via a global paragraph attribute. */
const Indent: any = Extension.create({
    name: 'indent',
    addGlobalAttributes() {
        return [{
            types: ['paragraph', 'heading'],
            attributes: {
                indent: {
                    default: 0,
                    parseHTML: el => {
                        const ml = parseFloat((el as HTMLElement).style.marginLeft || '0')
                        return isNaN(ml) ? 0 : ml / 10
                    },
                    renderHTML: attrs => attrs.indent > 0 ? { style: `margin-left:${attrs.indent * 10}mm` } : {},
                },
            },
        }]
    },
    addCommands(): any {
        return {
            indent: () => ({ tr, state, dispatch }: { tr: import('@tiptap/pm/state').Transaction; state: import('@tiptap/pm/state').EditorState; dispatch?: (tr: import('@tiptap/pm/state').Transaction) => void }) => {
                const { from, to } = state.selection
                state.doc.nodesBetween(from, to, (node, pos) => {
                    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                        const cur = node.attrs.indent ?? 0
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: Math.min(16, cur + 1) })
                    }
                })
                if (dispatch) dispatch(tr)
                return true
            },
            outdent: () => ({ tr, state, dispatch }: { tr: import('@tiptap/pm/state').Transaction; state: import('@tiptap/pm/state').EditorState; dispatch?: (tr: import('@tiptap/pm/state').Transaction) => void }) => {
                const { from, to } = state.selection
                state.doc.nodesBetween(from, to, (node, pos) => {
                    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                        const cur = node.attrs.indent ?? 0
                        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: Math.max(0, cur - 1) })
                    }
                })
                if (dispatch) dispatch(tr)
                return true
            },
        } as any
    },
})

// ─────────────────────────────────────────────────────────────────────────────
// Injected CSS — layout, toolbar, page, table, image
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = `
/* ── Shell layout ── */
.editor-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: #f8f9fa;
}
.editor-metabar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid #e2e8f0;
    background: #fff;
    flex-shrink: 0;
    min-height: 44px;
}
.dark .editor-metabar { background: #0f172a; border-color: #1e293b; }

/* ── Toolbar ── */
.toolbar {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 1px;
    padding: 5px 10px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
    flex-shrink: 0;
    width: 100%;
    box-sizing: border-box;
    overflow-x: auto;
    scrollbar-width: none;
}
.toolbar::-webkit-scrollbar { display: none; }
.dark .toolbar { background: #1e293b; border-color: #334155; }
.toolbar-divider {
    width: 1px; height: 18px;
    background: #d1d5db;
    margin: 0 4px;
    flex-shrink: 0; align-self: center;
}
.dark .toolbar-divider { background: #475569; }

/* ── Toolbar buttons ── */
.tb-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 27px; height: 27px;
    border: none; background: transparent; border-radius: 4px;
    cursor: pointer; color: #374151; flex-shrink: 0;
    transition: background 0.1s; padding: 0;
}
.dark .tb-btn { color: #cbd5e1; }
.tb-btn:hover:not(:disabled) { background: #e5e7eb; }
.dark .tb-btn:hover:not(:disabled) { background: #334155; }
.tb-btn.active { background: #dbeafe; color: #1d4ed8; }
.dark .tb-btn.active { background: #1e3a8a; color: #93c5fd; }
.tb-btn:disabled { opacity: 0.38; cursor: not-allowed; }

.tb-select {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 0 7px; height: 27px;
    border: none; background: transparent; border-radius: 4px;
    cursor: pointer; color: #374151; font-size: 12px; font-weight: 500;
    flex-shrink: 0; transition: background 0.1s; white-space: nowrap;
}
.dark .tb-select { color: #cbd5e1; }
.tb-select:hover { background: #e5e7eb; }
.dark .tb-select:hover { background: #334155; }
.tb-select:disabled { opacity: 0.38; cursor: not-allowed; }

/* ── Dropdown ── */
.tb-dropdown {
    position: fixed; z-index: 9999;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    overflow: hidden;
}
.dark .tb-dropdown { background: #1e293b; border-color: #334155; }
.tb-dropdown-item {
    display: block; width: 100%; text-align: left;
    padding: 6px 14px; font-size: 12.5px;
    border: none; background: transparent; cursor: pointer;
    color: #374151; transition: background 0.08s; white-space: nowrap;
}
.dark .tb-dropdown-item { color: #cbd5e1; }
.tb-dropdown-item:hover { background: #eff6ff; }
.dark .tb-dropdown-item:hover { background: rgba(30,58,138,0.25); }
.tb-dropdown-item.active { color: #1d4ed8; font-weight: 600; }
.dark .tb-dropdown-item.active { color: #93c5fd; }

/* ── Canvas (scrollable grey shell) ── */
.editor-canvas {
    flex: 1;
    overflow-x: auto;
    overflow-y: auto;
    background: #d6d6d6;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 20px 60px;
    box-sizing: border-box;
    gap: 20px;  /* gap between pages */
}
.dark .editor-canvas { background: #0b1120; }

/* ── A4 page ── */
.editor-page {
    background: white;
    width: 794px;
    min-height: ${PAGE_H_PX}px;
    /* Padding is controlled via inline styles (margins state) to avoid being additive to imported DOCX spacing */
    padding: 0;
    box-shadow: 0 2px 14px rgba(0,0,0,0.2);
    flex-shrink: 0;
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    line-height: 1.6;
    outline: none;
    box-sizing: border-box;
    color: #111;
    border-radius: 1px;
    position: relative;
}

/* ── ProseMirror content ── */
.editor-page .ProseMirror { outline: none; min-height: 400px; white-space: pre-wrap !important; }
.editor-page .ProseMirror > * + * { margin-top: 0; }
.editor-page .ProseMirror p { margin: 0 0 0.4em; }
.editor-page .ProseMirror h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0 0.3em; }
.editor-page .ProseMirror h2 { font-size: 1.5em; font-weight: 600; margin: 0.5em 0 0.3em; }
.editor-page .ProseMirror h3 { font-size: 1.17em; font-weight: 600; margin: 0.4em 0 0.2em; }
.editor-page .ProseMirror ul { list-style: disc; padding-left: 1.5em; margin: 0.4em 0; }
.editor-page .ProseMirror ol { list-style: decimal; padding-left: 1.5em; margin: 0.4em 0; }
.editor-page .ProseMirror li { margin: 0.1em 0; }
.editor-page .ProseMirror blockquote {
    border-left: 3px solid #d1d5db; padding-left: 1em; color: #6b7280; margin: 0.5em 0;
}
.editor-page .ProseMirror code {
    background: #f3f4f6; border-radius: 3px; padding: 0 3px; font-size: 0.9em; font-family: monospace;
}
.editor-page .ProseMirror pre {
    background: #1e293b; color: #e2e8f0; padding: 12px 16px;
    border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 13px;
}
.editor-page .ProseMirror a { color: #2563eb; text-decoration: underline; }
.editor-page .ProseMirror hr { border: none; border-top: 1px solid #d1d5db; margin: 1em 0; }

/* ── Images ── */
.editor-page .ProseMirror img {
    max-width: 100%; height: auto; cursor: pointer;
    display: block; margin: 4px 0;
}
.editor-page .ProseMirror img.ProseMirror-selectednode {
    outline: 2px solid #3b82f6; outline-offset: 2px;
}

/* ── Tables (Word-style) ── */
.editor-page .ProseMirror table {
    border-collapse: collapse; width: 100%; margin: 0.5em 0;
}
.editor-page .ProseMirror th, .editor-page .ProseMirror td {
    border: 1px solid #9ca3af;
    padding: 5px 8px; vertical-align: top;
    min-width: 60px; position: relative;
}
.editor-page .ProseMirror th {
    background: #f3f4f6; font-weight: 600; text-align: left;
}
.editor-page .ProseMirror .selectedCell { background: rgba(59,130,246,0.09); }
.editor-page .ProseMirror .column-resize-handle {
    position: absolute; right: -2px; top: 0; bottom: 0; width: 4px;
    background: #3b82f6; cursor: col-resize;
}

/* ── Field/placeholder tokens ── */
.editor-page .ProseMirror .field-token,
.field-token {
    background: rgba(59,130,246,0.12);
    border: 1px solid rgba(59,130,246,0.35);
    border-radius: 3px; padding: 0 2px;
    font-family: monospace; font-size: 0.88em; color: #1d4ed8;
    cursor: default;
}

/* ── Page number footer ── */
.page-number {
    position: absolute; bottom: 10mm; left: 0; right: 0;
    text-align: center; font-size: 9pt; color: #9ca3af;
    pointer-events: none;
}

/* ── Link dialog overlay ── */
.link-dialog-overlay {
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(0,0,0,0.4); display: flex;
    align-items: center; justify-content: center;
}
.link-dialog {
    background: #fff; border-radius: 10px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    padding: 20px 24px; width: 360px;
}
.dark .link-dialog { background: #1e293b; }

/* ── Canvas zoom wrapper ── */
.canvas-zoom-wrap {
    transform-origin: top center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 32px 20px 60px;
    box-sizing: border-box;
    width: 100%;
}

/* ── Rulers ── */
.ruler-row {
    display: flex;
    flex-shrink: 0;
    background: #e8e8e8;
    border-bottom: 1px solid #ccc;
    position: sticky;
    top: 0;
    z-index: 10;
    width: 100%;
}
.dark .ruler-row { background: #1e293b; border-color: #334155; }
.ruler-corner { width: 30px; height: 20px; flex-shrink: 0; background: #d0d0d0; border-right: 1px solid #ccc; }
.dark .ruler-corner { background: #334155; border-color: #475569; }
.ruler-h-canvas { height: 20px; }
.ruler-v-wrap {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}
.ruler-v-canvas { width: 30px; flex-shrink: 0; }

/* ── Image resize container ── */
.img-resize-wrap {
    display: inline-block;
    position: relative;
    line-height: 0;
    cursor: default;
}
.img-resize-wrap img { display: block; }
.img-resize-wrap.selected img { outline: 2px solid #3b82f6; outline-offset: 1px; }
.resize-handle {
    position: absolute;
    width: 9px; height: 9px;
    background: #fff;
    border: 2px solid #3b82f6;
    border-radius: 2px;
    z-index: 20;
}
.resize-nw { top: -5px; left: -5px; cursor: nw-resize; }
.resize-n  { top: -5px; left: calc(50% - 4px); cursor: n-resize; }
.resize-ne { top: -5px; right: -5px; cursor: ne-resize; }
.resize-e  { top: calc(50% - 4px); right: -5px; cursor: e-resize; }
.resize-se { bottom: -5px; right: -5px; cursor: se-resize; }
.resize-s  { bottom: -5px; left: calc(50% - 4px); cursor: s-resize; }
.resize-sw { bottom: -5px; left: -5px; cursor: sw-resize; }
.resize-w  { top: calc(50% - 4px); left: -5px; cursor: w-resize; }
.resize-tooltip {
    position: absolute;
    top: -28px; left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.75);
    color: #fff; font-size: 11px;
    padding: 2px 7px; border-radius: 4px;
    white-space: nowrap; pointer-events: none;
    z-index: 30;
}
`

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function TbBtn({
    onClick, active = false, disabled = false, title, children,
}: {
    onClick: () => void; active?: boolean; disabled?: boolean
    title: string; children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onClick() }}
            disabled={disabled}
            title={title}
            aria-label={title}
            className={`tb-btn${active ? ' active' : ''}`}
            style={{ position: 'relative' }}
        >
            {children}
        </button>
    )
}

function Divider() { return <span className="toolbar-divider" aria-hidden /> }

function TbDropdown({
    label, open, onToggle, onClose, anchorRef, children, minWidth = 140, title,
}: {
    label: React.ReactNode; open: boolean; onToggle: () => void; onClose: () => void
    anchorRef: React.RefObject<HTMLButtonElement | null>; children: React.ReactNode; minWidth?: number; title?: string
}) {
    const [rect, setRect] = useState<DOMRect | null>(null)
    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
                ref={anchorRef}
                type="button"
                title={title}
                className="tb-select"
                onMouseDown={e => {
                    e.preventDefault()
                    setRect(anchorRef.current?.getBoundingClientRect() ?? null)
                    onToggle()
                }}
            >
                {label}
            </button>
            {open && rect && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onMouseDown={onClose} />
                    <div className="tb-dropdown" style={{ top: rect.bottom + 3, left: rect.left, minWidth }}>
                        {children}
                    </div>
                </>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Resizable Image NodeView + Extension
// ─────────────────────────────────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes }: { node: { attrs: Record<string, unknown> }, updateAttributes: (a: Record<string, unknown>) => void, [k: string]: unknown }) {
    const [selected, setSelected] = useState(false)
    const [tooltip, setTooltip] = useState('')
    const imgRef = useRef<HTMLImageElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)

    // Dismiss on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as globalThis.Node)) setSelected(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const startResize = (e: React.MouseEvent, dir: string) => {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.clientX
        const startY = e.clientY
        const startW = imgRef.current?.offsetWidth ?? 200
        const startH = imgRef.current?.offsetHeight ?? 150

        const onMouseMove = (ev: MouseEvent) => {
            let newW = startW
            let newH = startH
            const dx = ev.clientX - startX
            const dy = ev.clientY - startY
            if (dir.includes('e')) newW = Math.max(50, startW + dx)
            if (dir.includes('w')) newW = Math.max(50, startW - dx)
            if (dir.includes('s')) newH = Math.max(30, startH + dy)
            if (dir.includes('n')) newH = Math.max(30, startH - dy)
            setTooltip(`${Math.round(newW)} × ${Math.round(newH)} px`)
            updateAttributes({ width: Math.round(newW), height: Math.round(newH) })
        }
        const onMouseUp = () => {
            setTooltip('')
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
    }

    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
    return (
        <NodeViewWrapper>
            <div
                ref={wrapRef}
                className={`img-resize-wrap${selected ? ' selected' : ''}`}
                onMouseDown={e => { e.preventDefault(); setSelected(true) }}
                style={{ display: 'inline-block' }}
            >
                {tooltip && <div className="resize-tooltip">{tooltip}</div>}
                <img
                    ref={imgRef}
                    src={node.attrs.src as string}
                    alt={(node.attrs.alt as string) || ''}
                    width={(node.attrs.width as number) || undefined}
                    height={(node.attrs.height as number) || undefined}
                    style={{ maxWidth: '100%', display: 'block', cursor: 'pointer' }}
                />
                {selected && handles.map(h => (
                    <div key={h} className={`resize-handle resize-${h}`} onMouseDown={e => startResize(e, h)} />
                ))}
            </div>
        </NodeViewWrapper>
    )
}

const ResizableImage: any = Node.create({
    name: 'image',
    group: 'block',
    atom: true,
    addAttributes() {
        return {
            src: { default: null },
            alt: { default: null },
            title: { default: null },
            width: { default: null },
            height: { default: null },
        }
    },
    parseHTML() {
        return [{ tag: 'img[src]' }]
    },
    renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
        return ['img', mergeAttributes(HTMLAttributes)]
    },
    addNodeView() {
        return ReactNodeViewRenderer(ResizableImageView as any)
    },
    addCommands(): any {
        return {
            setImage: (options: Record<string, unknown>) => ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) => {
                return commands.insertContent({ type: this.name, attrs: options })
            },
        }
    },
})

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Horizontal Ruler with draggable margin markers
// ─────────────────────────────────────────────────────────────────────────────

const PX_PER_MM = 3.7795275591  // at 96 dpi

function HorizRuler({
    zoom, canvasScrollLeft, margins, onMarginsChange,
}: {
    zoom: number; canvasScrollLeft: number
    margins: { top: number; bottom: number; left: number; right: number }
    onMarginsChange: (m: Partial<{ top: number; bottom: number; left: number; right: number }>) => void
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const dragging = useRef<null | 'left' | 'right'>(null)
    const [tooltip, setTooltip] = useState('')
    const [tooltipX, setTooltipX] = useState(0)

    const getPageLeft = useCallback((W: number) => {
        const pageWidthPx = PAGE_W_PX * zoom
        // Matches the 20px horizontal padding in .canvas-zoom-wrap
        const gutter = 20 * zoom
        const centerOffset = Math.max(gutter, (W - pageWidthPx) / 2)
        return centerOffset - canvasScrollLeft
    }, [zoom, canvasScrollLeft])

    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return
        const ctx = canvas.getContext('2d'); if (!ctx) return

        // Sync canvas resolution to client width
        const rect = canvas.getBoundingClientRect()
        if (canvas.width !== Math.floor(rect.width)) canvas.width = Math.floor(rect.width)
        if (canvas.height !== Math.floor(rect.height)) canvas.height = Math.floor(rect.height)

        const W = canvas.width; const H = canvas.height
        ctx.clearRect(0, 0, W, H)
        // Background - Area outside page
        ctx.fillStyle = '#c0c0c0'; ctx.fillRect(0, 0, W, H)

        const leftPx = margins.left * PX_PER_MM * zoom
        const rightPx = margins.right * PX_PER_MM * zoom
        const pageLeft = getPageLeft(W)
        const pageWidthPx = PAGE_W_PX * zoom

        // Page area (white content area + grey margins)
        // Draw the whole page background as white first
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(pageLeft, 0, pageWidthPx, H)

        // Draw margin overlays in light grey
        ctx.fillStyle = '#e8e8e8'
        ctx.fillRect(pageLeft, 0, leftPx, H)
        ctx.fillRect(pageLeft + pageWidthPx - rightPx, 0, rightPx, H)

        const pxPerMm = PX_PER_MM * zoom
        ctx.fillStyle = '#333'; ctx.font = '9px Arial'; ctx.textAlign = 'center'

        // Rulers ticks for the whole page (0 to 210mm)
        for (let mm = 0; mm <= 210; mm++) {
            const x = pageLeft + mm * pxPerMm
            if (x < pageLeft || x > pageLeft + pageWidthPx) continue

            const isCm = mm % 10 === 0
            const tickH = isCm ? 10 : (mm % 5 === 0 ? 6 : 3)
            ctx.fillRect(x, H - tickH, 1, tickH)
            if (isCm && mm > 0 && mm < 210) ctx.fillText(String(mm / 10), x, H - tickH - 1)
        }

        // Margin markers
        const lx = pageLeft + leftPx
        const rx = pageLeft + pageWidthPx - rightPx
        ctx.fillStyle = '#3b82f6'
        ctx.beginPath(); ctx.moveTo(lx - 5, 0); ctx.lineTo(lx + 5, 0); ctx.lineTo(lx, 8); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(rx - 5, 0); ctx.lineTo(rx + 5, 0); ctx.lineTo(rx, 8); ctx.closePath(); ctx.fill()

        ctx.strokeStyle = '#999'; ctx.strokeRect(0, 0, W, H)
    }, [zoom, canvasScrollLeft, margins, getPageLeft])

    useEffect(() => { draw() }, [draw])

    const hitTest = (clientX: number): 'left' | 'right' | null => {
        const canvas = canvasRef.current; if (!canvas) return null
        const rect = canvas.getBoundingClientRect()
        const x = (clientX - rect.left) * (canvas.width / rect.width)
        const W = canvas.width
        const pageLeft = getPageLeft(W)
        const leftPx = pageLeft + margins.left * PX_PER_MM * zoom
        const rightPx = pageLeft + PAGE_W_PX * zoom - margins.right * PX_PER_MM * zoom
        if (Math.abs(x - leftPx) < 8) return 'left'
        if (Math.abs(x - rightPx) < 8) return 'right'
        return null
    }

    const onMouseDown = (e: React.MouseEvent) => {
        const hit = hitTest(e.clientX)
        if (!hit) return
        e.preventDefault(); dragging.current = hit
        const canvas = canvasRef.current; if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const W = canvas.width; const pageLeft = getPageLeft(W)
        const pxPerMm = PX_PER_MM * zoom

        const onMove = (ev: MouseEvent) => {
            const x = (ev.clientX - rect.left) * (canvas.width / rect.width)
            if (dragging.current === 'left') {
                const mm = Math.round(Math.max(0, (x - pageLeft) / pxPerMm))
                onMarginsChange({ left: mm })
                setTooltip(`L: ${mm}mm`); setTooltipX(ev.clientX - rect.left)
            } else {
                const mm = Math.round(Math.max(0, (pageLeft + PAGE_W_PX * zoom - x) / pxPerMm))
                onMarginsChange({ right: mm })
                setTooltip(`R: ${mm}mm`); setTooltipX(ev.clientX - rect.left)
            }
        }
        const onUp = () => {
            dragging.current = null; setTooltip('')
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    const onMouseMove = (e: React.MouseEvent) => {
        if (!dragging.current) {
            const hit = hitTest(e.clientX)
            if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'ew-resize' : 'default'
        }
    }

    return (
        <div className="ruler-row" style={{ height: 22, position: 'relative' }}>
            <div className="ruler-corner" style={{ height: 22 }} />
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {tooltip && (
                    <div style={{
                        position: 'absolute', top: 0, left: tooltipX, transform: 'translateX(-50%)',
                        background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10,
                        padding: '1px 5px', borderRadius: 3, pointerEvents: 'none', zIndex: 50, whiteSpace: 'nowrap',
                    }}>{tooltip}</div>
                )}
                <canvas
                    ref={canvasRef}
                    className="ruler-h-canvas"
                    width={800} height={22}
                    style={{ width: '100%', height: 22, display: 'block' }}
                    onMouseDown={e => { e.preventDefault(); onMouseDown(e) }}
                    onMouseMove={onMouseMove}
                />
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Vertical Ruler with draggable margin markers
// ─────────────────────────────────────────────────────────────────────────────

function VertRuler({
    zoom, canvasScrollTop, margins, onMarginsChange, pageCount = 1,
}: {
    zoom: number; canvasScrollTop: number
    margins: { top: number; bottom: number; left: number; right: number }
    onMarginsChange: (m: Partial<{ top: number; bottom: number; left: number; right: number }>) => void
    pageCount?: number
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const dragging = useRef<null | 'top' | 'bottom'>(null)
    const [tooltip, setTooltip] = useState('')
    const [tooltipY, setTooltipY] = useState(0)
    const CANVAS_PAD = 32 // px of grey padding above first page

    const draw = useCallback(() => {
        const canvas = canvasRef.current; if (!canvas) return
        const ctx = canvas.getContext('2d'); if (!ctx) return
        const W = canvas.width; const H = canvas.height

        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = '#c0c0c0'; ctx.fillRect(0, 0, W, H)

        const topPx = margins.top * PX_PER_MM * zoom
        const bottomPx = margins.bottom * PX_PER_MM * zoom
        const pxPerMm = PX_PER_MM * zoom
        const pageHpx = PAGE_H_PX * zoom
        const canvasPad = 32 * zoom
        const pageGap = 20 * zoom

        for (let i = 0; i < pageCount; i++) {
            const pageTop = canvasPad + i * (pageHpx + pageGap) - canvasScrollTop
            if (pageTop > H) break
            if (pageTop + pageHpx < 0) continue

            // Page Background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, pageTop, W, pageHpx)

            // Margin overlays
            ctx.fillStyle = '#e8e8e8'
            ctx.fillRect(0, pageTop, W, topPx)
            ctx.fillRect(0, pageTop + pageHpx - bottomPx, W, bottomPx)

            // Ticks
            ctx.fillStyle = '#333'; ctx.font = '9px Arial'; ctx.textAlign = 'right'
            const totalContentMm = Math.floor(297 - margins.top - margins.bottom)

            // Content area ticks
            for (let mm = 0; mm <= totalContentMm; mm++) {
                const y = pageTop + topPx + mm * pxPerMm
                if (y < pageTop || y > pageTop + pageHpx) continue
                if (y < 0 || y > H) continue
                const isCm = mm % 10 === 0
                const tickW = isCm ? 10 : (mm % 5 === 0 ? 6 : 3)
                ctx.fillRect(W - tickW, y, tickW, 1)
                if (isCm && mm > 0 && mm < totalContentMm) {
                    ctx.save(); ctx.translate(W - tickW - 2, y + 4); ctx.rotate(-Math.PI / 2)
                    ctx.fillText(String(mm / 10), 0, 0); ctx.restore()
                }
            }

            // Top margin area ticks (negative)
            for (let mm = 1; mm <= margins.top; mm++) {
                const y = pageTop + topPx - mm * pxPerMm
                if (y < pageTop) break
                const isCm = mm % 10 === 0
                const tickW = isCm ? 10 : (mm % 5 === 0 ? 6 : 3)
                ctx.fillRect(W - tickW, y, tickW, 1)
            }

            // Margin marker triangles (only for first page to avoid clutter)
            if (i === 0) {
                const ty = pageTop + topPx
                const by = pageTop + pageHpx - bottomPx
                ctx.fillStyle = '#3b82f6'
                ctx.beginPath(); ctx.moveTo(0, ty - 5); ctx.lineTo(0, ty + 5); ctx.lineTo(8, ty); ctx.closePath(); ctx.fill()
                ctx.beginPath(); ctx.moveTo(0, by - 5); ctx.lineTo(0, by + 5); ctx.lineTo(8, by); ctx.closePath(); ctx.fill()
            }
        }

        ctx.strokeStyle = '#999'; ctx.strokeRect(0, 0, W, H)
    }, [zoom, canvasScrollTop, margins, pageCount])

    useEffect(() => { draw() }, [draw])

    const hitTest = (clientY: number): 'top' | 'bottom' | null => {
        const canvas = canvasRef.current; if (!canvas) return null
        const rect = canvas.getBoundingClientRect()
        const y = (clientY - rect.top) * (canvas.height / rect.height)
        const pageTop = CANVAS_PAD * zoom - canvasScrollTop
        const topY = pageTop + margins.top * PX_PER_MM * zoom
        const bottomY = pageTop + PAGE_H_PX * zoom - margins.bottom * PX_PER_MM * zoom
        if (Math.abs(y - topY) < 8) return 'top'
        if (Math.abs(y - bottomY) < 8) return 'bottom'
        return null
    }

    const onMouseDown = (e: React.MouseEvent) => {
        const hit = hitTest(e.clientY); if (!hit) return
        e.preventDefault(); dragging.current = hit
        const canvas = canvasRef.current; if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const pageTop = CANVAS_PAD * zoom - canvasScrollTop
        const pxPerMm = PX_PER_MM * zoom

        const onMove = (ev: MouseEvent) => {
            const y = (ev.clientY - rect.top) * (canvas.height / rect.height)
            if (dragging.current === 'top') {
                const mm = Math.round(Math.max(0, (y - pageTop) / pxPerMm))
                onMarginsChange({ top: mm })
                setTooltip(`T: ${mm}mm`); setTooltipY(ev.clientY - rect.top)
            } else {
                const mm = Math.round(Math.max(0, (pageTop + PAGE_H_PX * zoom - y) / pxPerMm))
                onMarginsChange({ bottom: mm })
                setTooltip(`B: ${mm}mm`); setTooltipY(ev.clientY - rect.top)
            }
        }
        const onUp = () => {
            dragging.current = null; setTooltip('')
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    const onMouseMove = (e: React.MouseEvent) => {
        if (!dragging.current) {
            const hit = hitTest(e.clientY)
            if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'ns-resize' : 'default'
        }
    }

    return (
        <div style={{ width: 30, flexShrink: 0, position: 'relative' }}>
            {tooltip && (
                <div style={{
                    position: 'absolute', top: tooltipY, left: 32, transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10,
                    padding: '1px 5px', borderRadius: 3, pointerEvents: 'none', zIndex: 50, whiteSpace: 'nowrap',
                }}>{tooltip}</div>
            )}
            <canvas
                ref={canvasRef}
                className="ruler-v-canvas"
                width={30} height={4000}
                style={{ width: 30, display: 'block' }}
                onMouseDown={e => { e.preventDefault(); onMouseDown(e) }}
                onMouseMove={onMouseMove}
            />
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

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
    const [docxBuffer, setDocxBuffer] = useState<ArrayBuffer | null>(null)
    // Tracks whether user imported a NEW .docx during this editing session
    const [docxImported, setDocxImported] = useState(false)

    // UI flags
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [importing, setImporting] = useState(false)
    const [uploadingPdf, setUploadingPdf] = useState(false)

    // Field / preview panel
    const [previewData, setPreviewData] = useState<Record<string, string>>({})
    const [fieldPanelOpen, setFieldPanelOpen] = useState(false)
    const [customPlaceholder, setCustomPlaceholder] = useState('')

    // Pagination: how many page "sheets" to render
    const [pageCount, setPageCount] = useState(1)
    const proseMirrorRef = useRef<HTMLElement | null>(null)

    // Link dialog
    const [linkDialogOpen, setLinkDialogOpen] = useState(false)
    const [linkUrl, setLinkUrl] = useState('')

    // Dropdown open/close
    const [fontFamilyOpen, setFontFamilyOpen] = useState(false)
    const [fontSizeOpen, setFontSizeOpen] = useState(false)
    const [placeholderOpen, setPlaceholderOpen] = useState(false)
    const [tableMenuOpen, setTableMenuOpen] = useState(false)
    const [alignOpen, setAlignOpen] = useState(false)
    const [lineSpacingOpen, setLineSpacingOpen] = useState(false)
    const [charSpacingOpen, setCharSpacingOpen] = useState(false)
    const [zoomOpen, setZoomOpen] = useState(false)
    const templateLoadedRef = useRef(false)

    // Zoom
    const [zoom, setZoom] = useState(100)
    const [zoomInput, setZoomInput] = useState('100')
    const canvasRef = useRef<HTMLDivElement>(null)
    const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 })

    // Spacing state
    const [charSpacing, setCharSpacing] = useState('0em')
    const [, setLineSpacing] = useState('1.5')

    // Page margins state (mm) — Default to Narrow (12.7mm)
    const [margins, setMargins] = useState({ top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 })
    const updateMargins = useCallback((m: Partial<typeof margins>) =>
        setMargins(prev => ({ ...prev, ...m }))
        , [])

    // Refs for dropdown anchor
    const fontFamilyRef = useRef<HTMLButtonElement>(null)
    const fontSizeRef = useRef<HTMLButtonElement>(null)
    const placeholderRef = useRef<HTMLButtonElement>(null)
    const tableMenuRef = useRef<HTMLButtonElement>(null)
    const alignRef = useRef<HTMLButtonElement>(null)
    const lineSpacingRef = useRef<HTMLButtonElement>(null)
    const charSpacingRef = useRef<HTMLButtonElement>(null)
    const zoomRef = useRef<HTMLButtonElement>(null)

    // Hidden file inputs
    const docxInputRef = useRef<HTMLInputElement>(null)
    const pdfInputRef = useRef<HTMLInputElement>(null)
    const imgInputRef = useRef<HTMLInputElement>(null)

    const closeDropdowns = useCallback(() => {
        setFontFamilyOpen(false)
        setFontSizeOpen(false); setPlaceholderOpen(false)
        setTableMenuOpen(false); setAlignOpen(false)
        setLineSpacingOpen(false); setCharSpacingOpen(false)
        setZoomOpen(false)
    }, [])

    // ── TipTap ──────────────────────────────────────────────────────────────
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                // Exclude extensions we register explicitly to avoid duplicate name warnings
                underline: false,
                link: false,
            } as Parameters<typeof StarterKit.configure>[0]),
            UnderlineExt,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            TextStyle,
            FontSize,
            LineHeight,
            Indent,
            Color,
            FontFamily,
            Highlight.configure({ multicolor: true }),
            Link.configure({ openOnClick: false }),
            ResizableImage,
            Subscript,
            Superscript,
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: '<p></p>',
        editorProps: { attributes: { spellcheck: 'true' } },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML()
            const fields = extractFields(html)
            setPreviewData(prev => {
                const next: Record<string, string> = {}
                fields.forEach(f => { next[f] = prev[f] ?? `[${f}]` })
                return next
            })
            measurePages()
        },
    })

    // Track canvas scroll for ruler sync
    useEffect(() => {
        const el = canvasRef.current
        if (!el) return
        const onScroll = () => setScrollPos({ x: el.scrollLeft, y: el.scrollTop })
        el.addEventListener('scroll', onScroll)
        return () => el.removeEventListener('scroll', onScroll)
    }, [])

    // Apply line-height via our custom LineHeight extension (scoped to selection)
    const applyLineSpacing = useCallback((val: string) => {
        setLineSpacing(val)
        editor?.chain().focus().setLineHeight?.(val)?.run()
    }, [editor])

    // Apply letter-spacing to selected text via TextStyle
    const applyCharSpacing = useCallback((val: string) => {
        setCharSpacing(val)
        editor?.chain().focus().setMark('textStyle', { letterSpacing: val } as Record<string, string>).run()
        setCharSpacingOpen(false)
    }, [editor])

    // Indent controls

    // ── Pagination via ResizeObserver ────────────────────────────────────────
    const measurePages = useCallback(() => {
        // The ProseMirror div lives inside .editor-page; measure its scrollHeight
        const pm = proseMirrorRef.current
        if (!pm) return
        // usable height inside A4 page = PAGE_H_PX minus padding (96+96 = 192 px approx)
        const USABLE = PAGE_H_PX - (margins.top + margins.bottom) * PX_PER_MM
        const contentH = pm.scrollHeight
        const pages = Math.max(1, Math.ceil(contentH / USABLE))
        setPageCount(pages)
    }, [margins])

    useEffect(() => {
        if (!editor) return
        // After editor mounts, grab the ProseMirror DOM element
        const pm = editor.view.dom as HTMLElement
        proseMirrorRef.current = pm
        const ro = new ResizeObserver(measurePages)
        ro.observe(pm)
        return () => ro.disconnect()
    }, [editor, measurePages])

    // ── Derived state ─────────────────────────────────────────────────────────
    const editorHtml = editor?.getHTML() ?? ''
    const fields = extractFields(editorHtml)
    const currentFont = editor?.getAttributes('textStyle').fontFamily ?? ''
    const currentFontLabel = FONT_FAMILIES.find(f => f.value === currentFont)?.label ?? 'Font'
    // Read font-size at cursor; strip 'pt' suffix for display; default 12
    const rawSize = editor?.getAttributes('textStyle').fontSize ?? ''
    const currentSizePt = rawSize ? parseInt(rawSize, 10) || 12 : 12

    // Read line-height at cursor paragraph
    const currentLineSpacingLabel = LINE_SPACING_OPTIONS.find(o => o.value === (editor?.getAttributes('paragraph').lineHeight ?? ''))?.label ?? 'Line Spacing'

    const currentAlign = (() => {
        if (editor?.isActive({ textAlign: 'center' })) return 'center'
        if (editor?.isActive({ textAlign: 'right' })) return 'right'
        if (editor?.isActive({ textAlign: 'justify' })) return 'justify'
        return 'left'
    })()
    const alignIcon: Record<string, ReactNode> = {
        left: <AlignLeft size={14} />, center: <AlignCenter size={14} />,
        right: <AlignRight size={14} />, justify: <AlignJustify size={14} />,
    }
    const currentCharSpacingLabel = CHAR_SPACING_OPTIONS.find(o => o.value === charSpacing)?.label ?? 'Normal'

    // ── Load existing template ────────────────────────────────────────────────
    useEffect(() => {
        if (!existingId || !editor || editor.isDestroyed || templateLoadedRef.current) return
        setLoading(true)
        getTemplate(existingId).then(tpl => {
            if (!tpl) return
            templateLoadedRef.current = true
            setName(tpl.name)
            setDescription(tpl.description ?? '')
            setPdfReferenceUrl(tpl.pdfReferenceUrl ?? null)

            // Extract margins from HTML metadata if present
            if (tpl.contentHtml) {
                const m = tpl.contentHtml.match(/<!-- MARGINS: ({.*?}) -->/)
                if (m && m[1]) {
                    try { setMargins(JSON.parse(m[1])) } catch (e) { console.warn("Margins parse failed:", e) }
                }
            }

            setTimeout(() => {
                if (!editor || editor.isDestroyed) return
                if (tpl.contentHtml) {
                    const cleanHtml = tpl.contentHtml.replace(/<!-- MARGINS: {.*?} -->\n?/, '')
                    editor.commands.setContent(cleanHtml)
                    if (tpl.content instanceof ArrayBuffer && tpl.content.byteLength > 0) setDocxBuffer(tpl.content)
                } else if (tpl.content instanceof ArrayBuffer && tpl.content.byteLength > 0) {
                    setDocxBuffer(tpl.content)
                    convertDocxToHtml(tpl.content).then(res => {
                        if (res.html && !editor.isDestroyed) editor.commands.setContent(res.html)
                    }).catch(console.warn)
                } else if (typeof tpl.content === 'string') {
                    editor.commands.setContent(tpl.content)
                }
            }, 0)
        }).finally(() => setLoading(false))
    }, [existingId, editor])

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!schoolId || !user) return
        if (!name.trim()) { setError(t('editor.nameRequired')); return }

        // Always derive fields from the current editor HTML so edits are captured
        const html = editor?.getHTML() ?? ''
        if (!html || html === '<p></p>') { setError(t('editor.contentRequired')); return }

        setError(null); setSaving(true)
        try {
            // Extract fields from current HTML to ensure any edits are captured
            const updatedFields = extractFields(html)

            if (existingId) {
                // ── UPDATE ──────────────────────────────────────────────────
                await updateTemplate(existingId, {
                    name: name.trim(),
                    description: description.trim(),
                    fields: updatedFields,
                    schoolId,
                    pdfReferenceUrl: pdfReferenceUrl ?? undefined,
                    isActive: true,
                    contentHtml: `<!-- MARGINS: ${JSON.stringify(margins)} -->\n${html}`,
                    content: (docxImported && docxBuffer) ? docxBuffer : new ArrayBuffer(0),
                })
            } else {
                const tplData: Omit<Template, 'id'> = {
                    name: name.trim(),
                    description: description.trim(),
                    fields: updatedFields,
                    schoolId,
                    createdBy: user.id,
                    pdfReferenceUrl: pdfReferenceUrl ?? undefined,
                    isActive: true,
                    contentHtml: `<!-- MARGINS: ${JSON.stringify(margins)} -->\n${html}`,
                    content: docxBuffer || new ArrayBuffer(0),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }
                await createTemplate(tplData)
            }
            setSaved(true)
            setTimeout(() => { setSaved(false); navigate('/templates') }, 1500)
        } catch (e) {
            setError(t('editor.saveFailed')); console.error(e)
        } finally { setSaving(false) }
    }

    // ── Import DOCX ───────────────────────────────────────────────────────────
    const handleDocxImport = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.docx')) { setError(t('editor.docxTypeError')); return }
        setImporting(true); setError(null)
        try {
            const buffer = await readDocxFile(file)
            setDocxBuffer(buffer)
            setDocxImported(true)
            const result = await convertDocxToHtml(buffer)
            if (result.margins) {
                setMargins(result.margins)
            } else {
                // If the DOCX has no margins, we set them to 0 as per user request to avoid "added margin"
                setMargins({ top: 0, bottom: 0, left: 0, right: 0 })
            }
            if (result.html?.trim()) {
                setTimeout(() => {
                    if (!editor?.isDestroyed) editor?.commands.setContent(result.html!)
                }, 0)
            }
        } catch (e) {
            setError(t('editor.importFailed')); console.error(e)
        } finally {
            setImporting(false)
            if (docxInputRef.current) docxInputRef.current.value = ''
        }
    }

    // ── Upload PDF reference ──────────────────────────────────────────────────
    const handlePdfUpload = async (file: File) => {
        if (!schoolId) return
        setUploadingPdf(true); setError(null)
        try {
            const path = `schools/${schoolId}/pdf-references/${Date.now()}_${file.name}`
            const { error: uploadError } = await supabase.storage.from('templates').upload(path, file)
            if (uploadError) throw uploadError
            const { data } = supabase.storage.from('templates').getPublicUrl(path)
            setPdfReferenceUrl(data.publicUrl)
        } catch (e) {
            setError(t('editor.pdfUploadFailed')); console.error(e)
        } finally {
            setUploadingPdf(false)
            if (pdfInputRef.current) pdfInputRef.current.value = ''
        }
    }

    // ── Insert image (base64) ─────────────────────────────────────────────────
    const handleImageUpload = (file: File) => {
        const reader = new FileReader()
        reader.onload = () => {
            const src = reader.result as string;
            (editor?.chain().focus() as any).setImage({ src }).run()
        }
        reader.readAsDataURL(file)
    }

    // ── Insert placeholder ─────────────────────────────────────────────────────
    const insertPlaceholder = useCallback((key: string) => {
        editor?.chain().focus().insertContent(`{${key}}`).run()
        setPlaceholderOpen(false); setCustomPlaceholder('')
    }, [editor])

    // ── Font size — uses custom FontSize extension ———————————————————————
    const setFontSizePt = useCallback((size: number) => {
        const clamped = Math.min(96, Math.max(6, size))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ; (editor?.chain().focus() as any).setFontSize?.(`${clamped}pt`)?.run()
        setFontSizeOpen(false)
    }, [editor])
    // Legacy wrapper for dropdown clicks
    const setFontSize = useCallback((size: string) => setFontSizePt(parseInt(size, 10)), [setFontSizePt])

    // ── Link ───────────────────────────────────────────────────────────────────
    const applyLink = () => {
        if (!linkUrl.trim()) {
            editor?.chain().focus().unsetLink().run()
        } else {
            editor?.chain().focus().setLink({ href: linkUrl.trim() }).run()
        }
        setLinkDialogOpen(false); setLinkUrl('')
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Guard renders
    // ─────────────────────────────────────────────────────────────────────────
    if (role !== 'admin') {
        return (
            <div className="p-8 text-center">
                <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-slate-400">{t('editor.adminOnly')}</p>
            </div>
        )
    }
    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
            </div>
        )
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: STYLES }} />

            <div className="editor-shell" onClick={closeDropdowns}>

                {/* ── 1. Header / meta bar ─────────────────────────────────── */}
                <div className="editor-metabar" onClick={e => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={() => navigate('/templates')}
                        className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-400 flex-shrink-0 transition-colors"
                        title="Back to templates"
                    >
                        <ArrowLeft size={16} />
                    </button>

                    <input
                        className="flex-1 text-sm font-semibold bg-transparent border-0 outline-none text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 min-w-0"
                        placeholder={t('editor.untitled')}
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />

                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Field panel toggle */}
                        <button
                            type="button"
                            onClick={() => setFieldPanelOpen(v => !v)}
                            className={`flex items-center gap-1.5 px-3 h-8 rounded text-xs font-medium border transition-colors flex-shrink-0 ${fieldPanelOpen
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 border-indigo-200 dark:border-indigo-800'
                                : 'text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            <Tag size={12} /> Fields ({fields.length})
                        </button>

                        {/* PDF ref */}
                        <button
                            type="button"
                            onClick={() => pdfInputRef.current?.click()}
                            disabled={uploadingPdf}
                            className="flex items-center gap-1.5 px-3 h-8 rounded text-xs font-medium border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
                            title={t('editor.uploadPdf')}
                        >
                            {uploadingPdf ? <Loader2 size={11} className="animate-spin" /> : <FileUp size={11} />}
                            {uploadingPdf ? t('editor.uploading') : 'PDF Ref'}
                        </button>
                        {pdfReferenceUrl && (
                            <a href={pdfReferenceUrl} target="_blank" rel="noreferrer"
                                className="text-xs text-indigo-600 dark:text-indigo-400 underline flex-shrink-0">
                                View PDF
                            </a>
                        )}

                        {saved && <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />}
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 h-8 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex-shrink-0 disabled:opacity-60"
                        >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            {saving ? t('editor.saving') : t('editor.save')}
                        </button>
                    </div>
                </div>

                {/* ── Error bar ──────────────────────────────────────────────── */}
                {error && (
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 14px', background: '#fef2f2',
                            borderBottom: '1px solid #fca5a5', flexShrink: 0,
                        }}
                    >
                        <AlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#b91c1c', flex: 1 }}>{error}</span>
                        <button type="button" onClick={() => setError(null)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                            <X size={13} />
                        </button>
                    </div>
                )}

                {/* ── 2. Toolbar ────────────────────────────────────────────── */}
                <div className="toolbar" onClick={e => e.stopPropagation()}>

                    {/* Undo / Redo */}
                    <TbBtn onClick={() => editor?.chain().focus().undo().run()} title="Undo" disabled={!editor?.can().undo()}><Undo2 size={14} /></TbBtn>
                    <TbBtn onClick={() => editor?.chain().focus().redo().run()} title="Redo" disabled={!editor?.can().redo()}><Redo2 size={14} /></TbBtn>
                    <Divider />

                    {/* Font Family */}
                    <TbDropdown
                        label={<><span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>{currentFontLabel}</span> <ChevronDown size={10} /></>}
                        open={fontFamilyOpen}
                        onToggle={() => { closeDropdowns(); setFontFamilyOpen(v => !v) }}
                        onClose={() => setFontFamilyOpen(false)}
                        anchorRef={fontFamilyRef}
                        minWidth={180}
                        title="Font Family"
                    >
                        {FONT_FAMILIES.map(f => (
                            <button key={f.value} type="button"
                                className={`tb-dropdown-item${currentFont === f.value ? ' active' : ''}`}
                                style={{ fontFamily: f.value }}
                                onMouseDown={e => {
                                    e.preventDefault()
                                    editor?.chain().focus().setFontFamily(f.value).run()
                                    setFontFamilyOpen(false)
                                }}>
                                {f.label}
                            </button>
                        ))}
                    </TbDropdown>

                    {/* Font Size — [−] [size ▾] [+] */}
                    <TbBtn onClick={() => setFontSizePt(currentSizePt - 1)} title="Decrease font size">
                        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>−</span>
                    </TbBtn>
                    <TbDropdown
                        label={<>{currentSizePt} <ChevronDown size={10} /></>}
                        open={fontSizeOpen}
                        onToggle={() => { closeDropdowns(); setFontSizeOpen(v => !v) }}
                        onClose={() => setFontSizeOpen(false)}
                        anchorRef={fontSizeRef}
                        minWidth={60}
                        title="Font Size"
                    >
                        {FONT_SIZES.map(s => (
                            <button key={s} type="button"
                                className={`tb-dropdown-item${currentSizePt === parseInt(s, 10) ? ' active' : ''}`}
                                style={{ textAlign: 'center' }}
                                onMouseDown={e => { e.preventDefault(); setFontSize(s) }}>
                                {s}
                            </button>
                        ))}
                    </TbDropdown>
                    <TbBtn onClick={() => setFontSizePt(currentSizePt + 1)} title="Increase font size">
                        <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>+</span>
                    </TbBtn>
                    <Divider />

                    {/* B / I / U / S */}
                    <TbBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={!!editor?.isActive('bold')} title="Bold (Ctrl+B)"><Bold size={14} /></TbBtn>
                    <TbBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={!!editor?.isActive('italic')} title="Italic (Ctrl+I)"><Italic size={14} /></TbBtn>
                    <TbBtn onClick={() => editor?.chain().focus().toggleUnderline().run()} active={!!editor?.isActive('underline')} title="Underline (Ctrl+U)"><Underline size={14} /></TbBtn>
                    <TbBtn onClick={() => editor?.chain().focus().toggleStrike().run()} active={!!editor?.isActive('strike')} title="Strikethrough"><Strikethrough size={14} /></TbBtn>
                    <TbBtn onClick={() => editor?.chain().focus().toggleSubscript().run()} active={!!editor?.isActive('subscript')} title="Subscript"><SubIcon size={14} /></TbBtn>
                    <TbBtn onClick={() => editor?.chain().focus().toggleSuperscript().run()} active={!!editor?.isActive('superscript')} title="Superscript"><SupIcon size={14} /></TbBtn>
                    <Divider />

                    {/* Text colour */}
                    <label
                        title="Text Colour"
                        className="tb-btn"
                        style={{ cursor: 'pointer', position: 'relative' }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 700, color: editor?.getAttributes('textStyle').color || 'currentColor' }}>A</span>
                        <input
                            type="color"
                            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
                            onChange={e => editor?.chain().focus().setColor(e.target.value).run()}
                        />
                    </label>

                    {/* Highlight */}
                    <label title="Highlight" className={`tb-btn${editor?.isActive('highlight') ? ' active' : ''}`} style={{ cursor: 'pointer', position: 'relative' }}>
                        <Highlighter size={14} />
                        <input
                            type="color"
                            defaultValue="#fef08a"
                            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', cursor: 'pointer' }}
                            onChange={e => editor?.chain().focus().toggleHighlight({ color: e.target.value }).run()}
                        />
                    </label>
                    <Divider />

                    {/* Alignment — single compact dropdown */}
                    <TbDropdown
                        label={<>{alignIcon[currentAlign]} <ChevronDown size={10} /></>}
                        open={alignOpen}
                        onToggle={() => { closeDropdowns(); setAlignOpen(v => !v) }}
                        onClose={() => setAlignOpen(false)}
                        anchorRef={alignRef}
                        minWidth={130}
                        title="Text Alignment"
                    >
                        {(['left', 'center', 'right', 'justify'] as const).map(a => (
                            <button key={a} type="button"
                                className={`tb-dropdown-item${currentAlign === a ? ' active' : ''}`}
                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                onMouseDown={e => { e.preventDefault(); editor?.chain().focus().setTextAlign(a).run(); setAlignOpen(false) }}>
                                {alignIcon[a]} {a.charAt(0).toUpperCase() + a.slice(1)}
                            </button>
                        ))}
                    </TbDropdown>
                    <Divider />

                    {/* Indent / Outdent */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <TbBtn onClick={() => (editor?.chain().focus() as any).indent?.().run()} title="Increase Indent">
                        <IndentIncrease size={14} />
                    </TbBtn>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <TbBtn onClick={() => (editor?.chain().focus() as any).outdent?.().run()} title="Decrease Indent">
                        <IndentDecrease size={14} />
                    </TbBtn>
                    <Divider />

                    {/* Line spacing */}
                    <TbDropdown
                        label={<>&#x2195; {currentLineSpacingLabel} <ChevronDown size={10} /></>}
                        open={lineSpacingOpen}
                        onToggle={() => { closeDropdowns(); setLineSpacingOpen(v => !v) }}
                        onClose={() => setLineSpacingOpen(false)}
                        anchorRef={lineSpacingRef}
                        minWidth={90}
                        title="Line Spacing"
                    >
                        {LINE_SPACING_OPTIONS.map(o => (
                            <button key={o.value} type="button"
                                className={`tb-dropdown-item${currentLineSpacingLabel === o.value ? ' active' : ''}`}
                                onMouseDown={e => { e.preventDefault(); applyLineSpacing(o.value); setLineSpacingOpen(false) }}>
                                {o.label}
                            </button>
                        ))}
                    </TbDropdown>

                    {/* Character spacing */}
                    <TbDropdown
                        label={<>&#x21d4; {currentCharSpacingLabel} <ChevronDown size={10} /></>}
                        open={charSpacingOpen}
                        onToggle={() => { closeDropdowns(); setCharSpacingOpen(v => !v) }}
                        onClose={() => setCharSpacingOpen(false)}
                        anchorRef={charSpacingRef}
                        minWidth={110}
                        title="Character Spacing"
                    >
                        {CHAR_SPACING_OPTIONS.map(o => (
                            <button key={o.value} type="button"
                                className={`tb-dropdown-item${charSpacing === o.value ? ' active' : ''}`}
                                onMouseDown={e => { e.preventDefault(); applyCharSpacing(o.value) }}>
                                {o.label}
                            </button>
                        ))}
                    </TbDropdown>
                    <Divider />

                    {/* Lists */}
                    <TbBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={!!editor?.isActive('bulletList')} title="Bullet List"><List size={14} /></TbBtn>
                    <TbBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={!!editor?.isActive('orderedList')} title="Numbered List"><ListOrdered size={14} /></TbBtn>
                    <Divider />

                    {/* Link */}
                    <TbBtn
                        onClick={() => { setLinkUrl(editor?.getAttributes('link').href ?? ''); setLinkDialogOpen(true) }}
                        active={!!editor?.isActive('link')}
                        title="Insert / Edit Link"
                    >
                        <LinkIcon size={14} />
                    </TbBtn>

                    {/* Image upload */}
                    <TbBtn onClick={() => imgInputRef.current?.click()} title="Insert Image">
                        <ImageIcon size={14} />
                    </TbBtn>

                    {/* Horizontal rule */}
                    <TbBtn onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Horizontal Rule"><Minus size={14} /></TbBtn>

                    {/* Table menu */}
                    <TbDropdown
                        label={<><TableIcon size={12} /> Table <ChevronDown size={10} /></>}
                        open={tableMenuOpen}
                        onToggle={() => { closeDropdowns(); setTableMenuOpen(v => !v) }}
                        onClose={() => setTableMenuOpen(false)}
                        anchorRef={tableMenuRef}
                        minWidth={190}
                        title="Table"
                    >
                        {[
                            ['Insert table', () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()],
                            ['Add row below', () => editor?.chain().focus().addRowAfter().run()],
                            ['Add row above', () => editor?.chain().focus().addRowBefore().run()],
                            ['Delete row', () => editor?.chain().focus().deleteRow().run()],
                            ['Add column after', () => editor?.chain().focus().addColumnAfter().run()],
                            ['Add column before', () => editor?.chain().focus().addColumnBefore().run()],
                            ['Delete column', () => editor?.chain().focus().deleteColumn().run()],
                            ['Merge cells', () => editor?.chain().focus().mergeCells().run()],
                            ['Split cell', () => editor?.chain().focus().splitCell().run()],
                            ['Delete table', () => editor?.chain().focus().deleteTable().run()],
                        ].map(([label, action]) => (
                            <button key={label as string} type="button" className="tb-dropdown-item"
                                onMouseDown={e => { e.preventDefault(); (action as () => void)(); setTableMenuOpen(false) }}>
                                {label as string}
                            </button>
                        ))}
                    </TbDropdown>

                    {/* Clear formatting */}
                    <TbBtn onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting">
                        <RemoveFormatting size={14} />
                    </TbBtn>
                    <Divider />

                    {/* Insert field placeholder — icon only */}
                    <TbDropdown
                        label={<Tag size={13} />}
                        open={placeholderOpen}
                        onToggle={() => { closeDropdowns(); setPlaceholderOpen(v => !v) }}
                        onClose={() => setPlaceholderOpen(false)}
                        anchorRef={placeholderRef}
                        minWidth={210}
                    >
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                    style={{ flex: 1, fontSize: 12, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, outline: 'none' }}
                                    placeholder="custom_field"
                                    value={customPlaceholder}
                                    onChange={e => setCustomPlaceholder(e.target.value.replace(/\s/g, '_'))}
                                    onKeyDown={e => { if (e.key === 'Enter' && customPlaceholder) insertPlaceholder(customPlaceholder) }}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    disabled={!customPlaceholder}
                                    onMouseDown={e => { e.preventDefault(); if (customPlaceholder) insertPlaceholder(customPlaceholder) }}
                                    style={{ padding: '2px 8px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
                                >+</button>
                            </div>
                        </div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            <p style={{ padding: '4px 14px', fontSize: 11, color: '#9ca3af' }}>Common fields</p>
                            {PLACEHOLDER_PRESETS.map(key => (
                                <button key={key} type="button" className="tb-dropdown-item"
                                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                                    onMouseDown={e => { e.preventDefault(); insertPlaceholder(key) }}>
                                    {`{${key}}`}
                                </button>
                            ))}
                        </div>
                    </TbDropdown>
                    <Divider />

                    {/* Import DOCX — icon only */}
                    <TbBtn
                        onClick={() => docxInputRef.current?.click()}
                        title={t('editor.importDocx')}
                        disabled={importing}
                    >
                        {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                    </TbBtn>

                    {/* Spacer to push zoom to right */}
                    <div style={{ flex: 1, minWidth: 8 }} />

                    {/* Zoom control */}
                    <Divider />
                    <ZoomIn size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
                    <TbDropdown
                        label={<>{zoom}% <ChevronDown size={10} /></>}
                        open={zoomOpen}
                        onToggle={() => { closeDropdowns(); setZoomOpen(v => !v) }}
                        onClose={() => setZoomOpen(false)}
                        anchorRef={zoomRef}
                        minWidth={120}
                    >
                        {ZOOM_OPTIONS.map(z => (
                            <button key={z} type="button"
                                className={`tb-dropdown-item${zoom === z ? ' active' : ''}`}
                                onMouseDown={e => { e.preventDefault(); setZoom(z); setZoomInput(String(z)); setZoomOpen(false) }}>
                                {z}%
                            </button>
                        ))}
                        <div style={{ padding: '6px 10px', borderTop: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input
                                    type="number" min={25} max={400} step={5}
                                    value={zoomInput}
                                    style={{ width: 54, fontSize: 12, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4, outline: 'none' }}
                                    onChange={e => setZoomInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { const v = Math.min(400, Math.max(25, Number(zoomInput))); setZoom(v); setZoomOpen(false) } }}
                                />
                                <span style={{ fontSize: 11, color: '#6b7280' }}>%</span>
                            </div>
                        </div>
                    </TbDropdown>

                    {/* Hidden inputs */}
                    <input ref={docxInputRef} type="file" accept=".docx" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDocxImport(f) }} />
                    <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f) }} />
                    <input ref={imgInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }} />
                </div>

                {/* ── 3. Canvas row ─────────────────────────────────────────── */}
                <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                    {/* Ruler + paginated A4 canvas */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        {/* Horizontal ruler */}
                        <HorizRuler zoom={zoom / 100} canvasScrollLeft={scrollPos.x} margins={margins} onMarginsChange={updateMargins} />

                        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            {/* Vertical ruler */}
                            <VertRuler zoom={zoom / 100} canvasScrollTop={scrollPos.y} margins={margins} onMarginsChange={updateMargins} pageCount={pageCount} />

                            {/* Scrollable grey canvas */}
                            <div
                                ref={canvasRef}
                                className="editor-canvas"
                                style={{ padding: 0, flex: 1 }}
                                onClick={closeDropdowns}
                                onScroll={e => setScrollPos({ x: (e.target as HTMLElement).scrollLeft, y: (e.target as HTMLElement).scrollTop })}
                            >
                                {/* Zoom-scaled content wrapper */}
                                <div
                                    className="canvas-zoom-wrap"
                                    style={{
                                        transform: `scale(${zoom / 100})`,
                                        transformOrigin: 'top center',
                                        height: `calc(100% * ${100 / zoom})`,
                                        minHeight: `calc(100% * ${100 / zoom})`,
                                    }}
                                >
                                    {/* Page 1 always has the editor content; margins applied as inline styles */}
                                    <div
                                        className="editor-page"
                                        style={{
                                            position: 'relative',
                                            paddingTop: `${margins.top}mm`,
                                            paddingBottom: `${margins.bottom}mm`,
                                            paddingLeft: `${margins.left}mm`,
                                            paddingRight: `${margins.right}mm`,
                                        }}
                                    >
                                        <EditorContent editor={editor} />
                                        <div className="page-number">1</div>
                                    </div>

                                    {/* Extra blank shadow pages for visual pagination */}
                                    {Array.from({ length: Math.max(0, pageCount - 1) }).map((_, i) => (
                                        <div key={i + 2} className="editor-page" style={{
                                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                                            paddingTop: `${margins.top}mm`, paddingBottom: `${margins.bottom}mm`,
                                            paddingLeft: `${margins.left}mm`, paddingRight: `${margins.right}mm`,
                                        }}>
                                            <div className="page-number">{i + 2}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Field / preview side panel */}
                    {fieldPanelOpen && (
                        <div
                            style={{
                                width: 240, flexShrink: 0,
                                borderLeft: '1px solid #e5e7eb', background: '#fff',
                                overflowY: 'auto', padding: 16,
                                display: 'flex', flexDirection: 'column', gap: 14,
                            }}
                            className="dark:bg-slate-900 dark:border-slate-800"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Description */}
                            <div>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                    Description
                                </p>
                                <textarea
                                    style={{
                                        width: '100%', fontSize: 12, padding: '5px 8px',
                                        border: '1px solid #d1d5db', borderRadius: 6,
                                        resize: 'vertical', minHeight: 60, outline: 'none', boxSizing: 'border-box',
                                    }}
                                    placeholder={t('editor.descriptionPlaceholder')}
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                />
                            </div>

                            {/* Fields list */}
                            <div>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                    Fields ({fields.length})
                                </p>
                                {fields.length === 0
                                    ? <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No fields yet. Use Insert Field.</p>
                                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {fields.map(f => (
                                            <button key={f} type="button"
                                                onClick={() => insertPlaceholder(f)}
                                                style={{
                                                    textAlign: 'left', padding: '3px 8px', borderRadius: 5,
                                                    fontSize: 12, fontFamily: 'monospace',
                                                    border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8',
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                                }}>
                                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                }
                            </div>

                            {/* Preview values */}
                            {fields.length > 0 && (
                                <div>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                                        Preview values
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                                        {fields.map(f => (
                                            <div key={f}>
                                                <label style={{ display: 'block', fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{f}</label>
                                                <input
                                                    style={{
                                                        width: '100%', fontSize: 12, padding: '3px 6px',
                                                        border: '1px solid #d1d5db', borderRadius: 4, outline: 'none', boxSizing: 'border-box',
                                                    }}
                                                    value={previewData[f] ?? ''}
                                                    onChange={e => setPreviewData(prev => ({ ...prev, [f]: e.target.value }))}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Link dialog ─────────────────────────────────────────────── */}
                {linkDialogOpen && (
                    <div className="link-dialog-overlay" onClick={() => setLinkDialogOpen(false)}>
                        <div className="link-dialog" onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                <p style={{ fontWeight: 600, fontSize: 14 }}>Insert Link</p>
                                <button type="button" onClick={() => setLinkDialogOpen(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                                    <X size={16} />
                                </button>
                            </div>
                            <input
                                style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
                                placeholder="https://example.com"
                                value={linkUrl}
                                autoFocus
                                onChange={e => setLinkUrl(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') applyLink() }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" onClick={() => setLinkDialogOpen(false)}
                                    style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                                    Cancel
                                </button>
                                <button type="button" onClick={applyLink}
                                    style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                    {linkUrl ? 'Insert' : 'Remove link'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
