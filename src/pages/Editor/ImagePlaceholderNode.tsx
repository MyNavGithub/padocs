/**
 * ImagePlaceholderExtension – pure vanilla-JS TipTap NodeView.
 * No React, no @tiptap/react. Only @tiptap/core.
 * Supports: drag-and-drop (via draggable:true), resize via bottom-right handle.
 */
import { Node, mergeAttributes } from '@tiptap/core'

// Inline SVG so we never need an external asset
const PHOTO_ICON = (size: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
        fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        style="opacity:.6;flex-shrink:0;">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
        <circle cx="9" cy="9" r="2"/>
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>`

export const ImagePlaceholderExtension = Node.create({
    name: 'imagePlaceholder',
    group: 'inline',
    inline: true,
    draggable: true,   // TipTap native drag — no extra code needed
    atom: true,        // Treat as single unit; cursor can't enter it

    addAttributes() {
        return {
            fieldKey: {
                default: 'image',
                parseHTML: (el) => el.getAttribute('data-field-key') ?? 'image',
                renderHTML: (attrs) => ({ 'data-field-key': attrs.fieldKey }),
            },
            width: {
                default: 150,
                parseHTML: (el) => Number(el.getAttribute('data-width') ?? 150),
                renderHTML: (attrs) => ({ 'data-width': String(attrs.width) }),
            },
            height: {
                default: 150,
                parseHTML: (el) => Number(el.getAttribute('data-height') ?? 150),
                renderHTML: (attrs) => ({ 'data-height': String(attrs.height) }),
            },
        }
    },

    parseHTML() {
        return [{ tag: 'span[data-type="image-placeholder"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-type': 'image-placeholder',
                style: 'display:inline-block;vertical-align:middle;',
            }),
        ]
    },

    // ── Pure JS NodeView — no React dependency ───────────────────────────────
    addNodeView() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ({ node, getPos, editor }: { node: any; getPos: any; editor: any }) => {
            let attrs = { ...node.attrs }
            let selected = false

            // ── DOM ──────────────────────────────────────────────────────────
            const dom = document.createElement('span')
            dom.setAttribute('contenteditable', 'false')
            dom.style.cssText = [
                'display:inline-block',
                'position:relative',
                'vertical-align:middle',
                'line-height:0',
                'user-select:none',
            ].join(';')

            const box = document.createElement('span')

            const handle = document.createElement('span')
            handle.title = 'Drag to resize'
            handle.style.cssText = [
                'display:none',
                'position:absolute',
                'bottom:-7px',
                'right:-7px',
                'width:14px',
                'height:14px',
                'background:#6366f1',
                'border:2px solid #ffffff',
                'border-radius:50%',
                'cursor:se-resize',
                'z-index:10',
                'box-shadow:0 1px 4px rgba(0,0,0,.35)',
            ].join(';')

            // ── Render helper ────────────────────────────────────────────────
            const render = () => {
                const w = Math.max(50, Number(attrs.width) || 150)
                const h = Math.max(50, Number(attrs.height) || 150)
                const iconSize = Math.min(Math.round(Math.min(w, h) / 3), 32)

                box.style.cssText = [
                    'display:inline-flex',
                    'flex-direction:column',
                    'align-items:center',
                    'justify-content:center',
                    `width:${w}px`,
                    `height:${h}px`,
                    'min-width:50px',
                    'min-height:50px',
                    `border:2px ${selected ? 'solid #6366f1' : 'dashed #9ca3af'}`,
                    'border-radius:6px',
                    'background:#f8fafc',
                    'box-sizing:border-box',
                    'overflow:hidden',
                    'gap:5px',
                    'padding:6px',
                    `box-shadow:${selected ? '0 0 0 3px rgba(99,102,241,.2)' : 'none'}`,
                    'transition:border-color .15s,box-shadow .15s',
                ].join(';')

                box.innerHTML = [
                    PHOTO_ICON(iconSize),
                    `<span style="font-family:monospace;font-size:11px;font-weight:600;color:#4f46e5;`,
                    `text-align:center;word-break:break-all;line-height:1.2;">`,
                    `{{${attrs.fieldKey}}}`,
                    `</span>`,
                ].join('')
            }

            // ── Resize logic ─────────────────────────────────────────────────
            handle.addEventListener('mousedown', (e: MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()

                const startX = e.clientX
                const startY = e.clientY
                const startW = Number(attrs.width) || 150
                const startH = Number(attrs.height) || 150

                const onMove = (mv: MouseEvent) => {
                    const newW = Math.max(50, Math.round(startW + mv.clientX - startX))
                    const newH = Math.max(50, Math.round(startH + mv.clientY - startY))
                    const pos = typeof getPos === 'function' ? getPos() : undefined
                    if (typeof pos === 'number') {
                        editor.view.dispatch(
                            editor.view.state.tr.setNodeMarkup(pos, undefined, {
                                ...attrs,
                                width: newW,
                                height: newH,
                            }),
                        )
                    }
                }

                const onUp = () => {
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                }

                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
            })

            // ── Assemble & initial render ────────────────────────────────────
            dom.appendChild(box)
            dom.appendChild(handle)
            render()

            // ── TipTap NodeView interface ────────────────────────────────────
            return {
                dom,

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                update(newNode: any): boolean {
                    if (newNode.type.name !== 'imagePlaceholder') return false
                    attrs = { ...newNode.attrs }
                    render()
                    return true
                },

                selectNode() {
                    selected = true
                    handle.style.display = 'block'
                    render()
                },

                deselectNode() {
                    selected = false
                    handle.style.display = 'none'
                    render()
                },

                destroy() {
                    // nothing to clean up
                },
            }
        }
    },
})
