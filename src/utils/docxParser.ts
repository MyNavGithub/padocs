/**
 * docxParser.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Deep DOCX → HTML converter that faithfully reproduces MS Word formatting.
 *
 * Strategy:
 *   1. Unzip the .docx (a zip file) with JSZip.
 *   2. Parse word/document.xml for the body paragraphs & runs.
 *   3. Parse word/styles.xml to resolve named styles (Normal, Heading 1, etc.)
 *   4. Parse word/numbering.xml for list bullet/number definitions.
 *   5. Convert every paragraph and run to HTML with full inline styles so the
 *      output looks identical to the original Word document.
 *
 * Supported Word features:
 *   - Paragraph alignment, indentation (left / right / hanging / firstLine)
 *   - Paragraph spacing (before / after / line height)
 *   - Font family, size, bold, italic, underline, strikethrough
 *   - Text color, highlight color
 *   - Subscript / superscript
 *   - Ordered / unordered lists (numPr)
 *   - Tables (with cell borders & padding)
 *   - Embedded images (base64 inline)
 *   - Hyperlinks
 *   - Bookmarks (ignored gracefully)
 *   - Page breaks → <hr>
 */

import JSZip from 'jszip'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse an XML string into a DOM Document */
function parseXml(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'application/xml')
}

/** Get child element(s) by local name (namespace-independent) */
function kids(parent: Element | Document, localName: string): Element[] {
    return Array.from(parent.querySelectorAll('*')).filter(
        (el) => el.localName === localName
    )
}

function kid(parent: Element | null, localName: string): Element | null {
    if (!parent) return null
    // Direct children only
    for (const c of Array.from(parent.children)) {
        if (c.localName === localName) return c
    }
    return null
}

function attr(el: Element | null, ...names: string[]): string | null {
    if (!el) return null
    for (const name of names) {
        const v = el.getAttribute(name) ?? el.getAttribute(`w:${name}`)
        if (v !== null) return v
    }
    return null
}

/** Convert half-points to pt (Word font sizes are in half-points) */
const halfPtToPt = (hp: string | null) =>
    hp ? `${(parseInt(hp, 10) / 2).toFixed(1)}pt` : null

/** Convert twips to px (1 twip = 1/20 pt = 1/1440 inch; 96 DPI) */
const twipsToPx = (tw: string | null) =>
    tw ? `${(parseInt(tw, 10) / 20 / 72 * 96).toFixed(2)}px` : null

/** Convert EMU to px (1 EMU = 1/914400 inch; 96 DPI) */
const emuToPx = (emu: string | null) =>
    emu ? `${(parseInt(emu, 10) / 914400 * 96).toFixed(0)}px` : null

/** Convert Word color (RRGGBB or auto) to CSS */
function wordColor(hex: string | null): string | null {
    if (!hex || hex === 'auto' || hex === 'none') return null
    return `#${hex}`
}

/** Word highlight colors to CSS */
const HIGHLIGHT: Record<string, string> = {
    yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF',
    blue: '#0000FF', red: '#FF0000', darkBlue: '#000080', darkCyan: '#008080',
    darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
    darkYellow: '#808000', darkGray: '#808080', lightGray: '#C0C0C0', black: '#000000',
    white: '#FFFFFF',
}

// ── Style resolution ────────────────────────────────────────────────────────

interface ParagraphStyle {
    alignment?: string
    indentLeft?: string
    indentRight?: string
    indentHanging?: string
    indentFirstLine?: string
    spaceBefore?: string
    spaceAfter?: string
    lineSpacing?: string
    lineSpacingRule?: string
    keepLines?: boolean
    keepNext?: boolean
    pageBreakBefore?: boolean
    numId?: string
    ilvl?: string
    basedOn?: string
    headingLevel?: number | null
    runStyle?: RunStyle
}

interface RunStyle {
    fontFamily?: string
    fontSize?: string  // CSS value e.g. "12pt"
    bold?: boolean
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    color?: string
    highlight?: string
    vertAlign?: 'super' | 'sub' | null
    spacing?: string  // letter-spacing
    basedOn?: string
}

type StyleMap = Map<string, { pStyle: ParagraphStyle; rStyle: RunStyle }>

/** Extract paragraph properties from a <w:pPr> element */
function extractPPr(pPr: Element | null, styles: StyleMap): ParagraphStyle {
    if (!pPr) return {}
    const style: ParagraphStyle = {}

    const jc = kid(pPr, 'jc')
    if (jc) {
        const align = attr(jc, 'val') ?? ''
        style.alignment = align === 'both' ? 'justify' : align
    }

    const ind = kid(pPr, 'ind')
    if (ind) {
        style.indentLeft = twipsToPx(attr(ind, 'left')) ?? undefined
        style.indentRight = twipsToPx(attr(ind, 'right')) ?? undefined
        style.indentHanging = twipsToPx(attr(ind, 'hanging')) ?? undefined
        style.indentFirstLine = twipsToPx(attr(ind, 'firstLine')) ?? undefined
    }

    const spacing = kid(pPr, 'spacing')
    if (spacing) {
        style.spaceBefore = twipsToPx(attr(spacing, 'before')) ?? undefined
        style.spaceAfter = twipsToPx(attr(spacing, 'after')) ?? undefined
        const lineRaw = attr(spacing, 'line')
        const lineRule = attr(spacing, 'lineRule') ?? 'auto'
        style.lineSpacingRule = lineRule
        if (lineRaw) {
            if (lineRule === 'exact' || lineRule === 'atLeast') {
                style.lineSpacing = twipsToPx(lineRaw) ?? undefined
            } else {
                // "auto": 240 = single, 360 = 1.5, 480 = double
                style.lineSpacing = `${(parseInt(lineRaw, 10) / 240).toFixed(3)}`
            }
        }
    }

    if (kid(pPr, 'keepLines')) style.keepLines = true
    if (kid(pPr, 'keepNext')) style.keepNext = true
    if (kid(pPr, 'pageBreakBefore')) style.pageBreakBefore = true

    const numPr = kid(pPr, 'numPr')
    if (numPr) {
        style.numId = attr(kid(numPr, 'numId'), 'val') ?? undefined
        style.ilvl = attr(kid(numPr, 'ilvl'), 'val') ?? undefined
    }

    // Named style → resolve via styles map
    const pStyleEl = kid(pPr, 'pStyle')
    if (pStyleEl) {
        const styleId = attr(pStyleEl, 'val')
        if (styleId) {
            const base = styles.get(styleId)
            if (base) {
                // Merge: local overrides base
                const merged = { ...base.pStyle, ...style }
                merged.runStyle = { ...base.rStyle, ...(style.runStyle ?? {}) }
                return merged
            }
        }
    }

    return style
}

/** Extract run properties from a <w:rPr> element */
function extractRPr(rPr: Element | null): RunStyle {
    if (!rPr) return {}
    const style: RunStyle = {}

    // Font
    const rFonts = kid(rPr, 'rFonts')
    if (rFonts) {
        style.fontFamily =
            attr(rFonts, 'ascii') ??
            attr(rFonts, 'hAnsi') ??
            attr(rFonts, 'cs') ??
            undefined
    }

    // Size (half-points)
    const sz = kid(rPr, 'sz') ?? kid(rPr, 'szCs')
    if (sz) style.fontSize = halfPtToPt(attr(sz, 'val')) ?? undefined

    // Bold
    const b = kid(rPr, 'b')
    if (b) style.bold = attr(b, 'val') !== '0'

    // Italic
    const i = kid(rPr, 'i')
    if (i) style.italic = attr(i, 'val') !== '0'

    // Underline
    const u = kid(rPr, 'u')
    if (u) {
        const val = attr(u, 'val')
        style.underline = val !== 'none' && val !== null
    }

    // Strikethrough
    if (kid(rPr, 'strike') || kid(rPr, 'dstrike')) style.strikethrough = true

    // Color
    const color = kid(rPr, 'color')
    if (color) style.color = wordColor(attr(color, 'val')) ?? undefined

    // Highlight
    const hl = kid(rPr, 'highlight')
    if (hl) style.highlight = HIGHLIGHT[attr(hl, 'val') ?? ''] ?? undefined

    // Vertical alignment
    const vertAlign = kid(rPr, 'vertAlign')
    if (vertAlign) {
        const v = attr(vertAlign, 'val')
        style.vertAlign = v === 'superscript' ? 'super' : v === 'subscript' ? 'sub' : null
    }

    // Letter spacing (in twentieths of a point)
    const css = kid(rPr, 'spacing')
    if (css) {
        const twips = parseInt(attr(css, 'val') ?? '0', 10)
        if (twips) style.spacing = `${(twips / 20).toFixed(1)}pt`
    }

    return style
}

/** Parse word/styles.xml into a StyleMap */
function parseStyles(stylesXml: string | null): StyleMap {
    const map: StyleMap = new Map()
    if (!stylesXml) return map

    const doc = parseXml(stylesXml)
    const styleEls = kids(doc, 'style')
    for (const el of styleEls) {
        const id = attr(el, 'styleId')
        if (!id) continue
        const pPrEl = kid(el, 'pPr')
        const rPrEl = kid(el, 'rPr')
        map.set(id, {
            pStyle: pPrEl ? extractPPr(pPrEl, map) : {},
            rStyle: rPrEl ? extractRPr(rPrEl) : {},
        })
    }

    // Second pass: resolve basedOn chains
    for (const [id, entry] of map.entries()) {
        let chain = 0
        let cur = id
        while (chain++ < 20) {
            const parent = map.get(cur)
            if (!parent) break
            const basedOnId = parent.pStyle.basedOn
            if (!basedOnId || !map.has(basedOnId)) break
            const base = map.get(basedOnId)!
            map.set(id, {
                pStyle: { ...base.pStyle, ...entry.pStyle },
                rStyle: { ...base.rStyle, ...entry.rStyle },
            })
            cur = basedOnId
        }
    }

    return map
}

// ── Numbering ────────────────────────────────────────────────────────────────

interface NumLevel {
    numFmt: string   // 'bullet', 'decimal', 'lowerLetter', etc.
    lvlText: string  // '•', '%1.', '(%2)', etc.
    indent: string
    hanging: string
    start: number
}

type NumberingMap = Map<string, Map<number, NumLevel>>  // numId → ilvl → level

function parseNumbering(numXml: string | null): NumberingMap {
    const map: NumberingMap = new Map()
    if (!numXml) return map

    const doc = parseXml(numXml)

    // abstractNum definitions
    const abstractNums = new Map<string, Map<number, NumLevel>>()
    for (const an of kids(doc, 'abstractNum')) {
        const anId = attr(an, 'abstractNumId') ?? ''
        const lvlMap = new Map<number, NumLevel>()
        for (const lvl of kids(an, 'lvl')) {
            const ilvl = parseInt(attr(lvl, 'ilvl') ?? '0', 10)
            const numFmt = attr(kid(lvl, 'numFmt'), 'val') ?? 'bullet'
            const lvlText = attr(kid(lvl, 'lvlText'), 'val') ?? '•'
            const ind = kid(lvl, 'ind')
            const indent = twipsToPx(attr(ind, 'left')) ?? `${(ilvl + 1) * 36}px`
            const hanging = twipsToPx(attr(ind, 'hanging')) ?? '18px'
            const start = parseInt(attr(kid(lvl, 'start'), 'val') ?? '1', 10)
            lvlMap.set(ilvl, { numFmt, lvlText, indent, hanging, start })
        }
        abstractNums.set(anId, lvlMap)
    }

    // num → abstractNum mapping
    for (const num of kids(doc, 'num')) {
        const numId = attr(num, 'numId') ?? ''
        const anId = attr(kid(num, 'abstractNumId'), 'val') ?? ''
        const lvls = abstractNums.get(anId)
        if (lvls) map.set(numId, lvls)
    }

    return map
}

// ── CSS builders ─────────────────────────────────────────────────────────────

function pStyleToCSS(p: ParagraphStyle): string {
    const parts: string[] = []
    if (p.alignment) parts.push(`text-align:${p.alignment}`)
    if (p.spaceBefore) parts.push(`margin-top:${p.spaceBefore}`)
    if (p.spaceAfter) parts.push(`margin-bottom:${p.spaceAfter}`)

    if (p.lineSpacing) {
        if (p.lineSpacingRule === 'exact' || p.lineSpacingRule === 'atLeast') {
            parts.push(`line-height:${p.lineSpacing}`)
        } else {
            parts.push(`line-height:${p.lineSpacing}`)
        }
    }

    // Indentation
    const leftInd = p.indentLeft
    const hangInd = p.indentHanging
    const firstInd = p.indentFirstLine

    if (hangInd) {
        // Hanging indent: paddingLeft = left; textIndent = -hanging
        parts.push(`padding-left:${leftInd ?? hangInd}`)
        parts.push(`text-indent:-${hangInd}`)
    } else if (firstInd) {
        if (leftInd) parts.push(`padding-left:${leftInd}`)
        parts.push(`text-indent:${firstInd}`)
    } else if (leftInd) {
        parts.push(`padding-left:${leftInd}`)
    }

    if (p.indentRight) parts.push(`padding-right:${p.indentRight}`)
    return parts.join(';')
}

function rStyleToCSS(r: RunStyle): string {
    const parts: string[] = []
    if (r.fontFamily) parts.push(`font-family:"${r.fontFamily}",serif`)
    if (r.fontSize) parts.push(`font-size:${r.fontSize}`)
    if (r.bold) parts.push('font-weight:bold')
    if (r.italic) parts.push('font-style:italic')
    if (r.color) parts.push(`color:${r.color}`)
    if (r.highlight) parts.push(`background-color:${r.highlight}`)
    if (r.spacing) parts.push(`letter-spacing:${r.spacing}`)

    const decors: string[] = []
    if (r.underline) decors.push('underline')
    if (r.strikethrough) decors.push('line-through')
    if (decors.length) parts.push(`text-decoration:${decors.join(' ')}`)

    return parts.join(';')
}

// ── Image handling ───────────────────────────────────────────────────────────

async function extractImages(
    zip: JSZip
): Promise<Map<string, string>> {
    const map = new Map<string, string>()

    // Parse word/_rels/document.xml.rels for relationship ID → target
    const relsFile = zip.file('word/_rels/document.xml.rels')
    if (!relsFile) return map
    const relsXml = await relsFile.async('text')
    const rels = parseXml(relsXml)

    for (const rel of kids(rels, 'Relationship')) {
        const type = attr(rel, 'Type') ?? ''
        if (!type.includes('image')) continue
        const id = attr(rel, 'Id') ?? ''
        const target = attr(rel, 'Target') ?? ''
        const imgPath = target.startsWith('/') ? target.slice(1) : `word/${target}`
        const imgFile = zip.file(imgPath)
        if (!imgFile) continue
        const bytes = await imgFile.async('base64')
        const ext = imgPath.split('.').pop()?.toLowerCase() ?? 'png'
        const mimeMap: Record<string, string> = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml',
            webp: 'image/webp', tiff: 'image/tiff', wmf: 'image/wmf',
        }
        const mime = mimeMap[ext] ?? 'image/png'
        map.set(id, `data:${mime};base64,${bytes}`)
    }
    return map
}

// ── Main converter ───────────────────────────────────────────────────────────



function processRun(
    r: Element,
    images: Map<string, string>,
    pRStyle: RunStyle
): string {
    const rPr = kid(r, 'rPr')
    const rStyle = { ...pRStyle, ...extractRPr(rPr) }
    const css = rStyleToCSS(rStyle)

    const wrapSpan = (inner: string) =>
        css ? `<span style="${css}">${inner}</span>` : inner

    const parts: string[] = []

    for (const child of Array.from(r.children)) {
        switch (child.localName) {
            case 't': {
                // Preserve leading/trailing spaces
                const t = child.textContent ?? ''
                parts.push(t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
                break
            }
            case 'br': {
                const type = attr(child, 'type')
                if (type === 'page') parts.push('<hr style="margin:1em 0;border:none;border-top:1px solid #ccc;">')
                else parts.push('<br>')
                break
            }
            case 'tab':
                parts.push('&nbsp;&nbsp;&nbsp;&nbsp;')
                break
            case 'drawing':
            case 'pict': {
                // Look for blipFill / imagedata
                const blips = kids(child as Element, 'blip')
                for (const b of blips) {
                    const rId = attr(b, 'r:embed') ?? attr(b, 'embed') ?? attr(b, 'r:link') ?? ''
                    const src = images.get(rId)
                    if (src) {
                        // Get size from extent
                        const ext = kids(child as Element, 'extent')[0]
                        const cx = ext ? attr(ext, 'cx') : null
                        const cy = ext ? attr(ext, 'cy') : null
                        const w = emuToPx(cx) ?? 'auto'
                        const h = emuToPx(cy) ?? 'auto'
                        parts.push(`<img src="${src}" style="width:${w};height:${h};max-width:100%;display:inline-block;vertical-align:middle;" alt="">`)
                    }
                }
                // Also check for imagedata (old format)
                const imgData = kids(child as Element, 'imagedata')[0]
                if (imgData) {
                    const rId = attr(imgData, 'r:id') ?? attr(imgData, 'id') ?? ''
                    const src = images.get(rId)
                    if (src) {
                        parts.push(`<img src="${src}" style="max-width:100%;display:inline-block;vertical-align:middle;" alt="">`)
                    }
                }
                break
            }
            default:
                break
        }
    }

    if (!parts.length) return ''

    let content = parts.join('')

    // Apply vertical alignment wrapping
    if (rStyle.vertAlign === 'super') content = `<sup>${content}</sup>`
    else if (rStyle.vertAlign === 'sub') content = `<sub>${content}</sub>`

    return wrapSpan(content)
}

function processHyperlink(
    el: Element,
    images: Map<string, string>,
    pRStyle: RunStyle,
    relationships: Map<string, string>
): string {
    const rId = attr(el, 'r:id') ?? attr(el, 'id') ?? ''
    const href = relationships.get(rId) ?? '#'
    const inner = Array.from(el.children)
        .map((c) => {
            if (c.localName === 'r') return processRun(c, images, pRStyle)
            return ''
        })
        .join('')
    return `<a href="${href}" style="color:#1155CC;text-decoration:underline;">${inner}</a>`
}

function processParagraph(
    p: Element,
    images: Map<string, string>,
    styles: StyleMap,
    numbering: NumberingMap,
    relationships: Map<string, string>
): { html: string; isListItem: boolean; numInfo?: { numId: string; ilvl: number; fmt: string; indent: string; hanging: string } } {
    const pPr = kid(p, 'pPr')
    const pStyle = extractPPr(pPr, styles)
    const pRStyle = pStyle.runStyle ?? {}

    // Detect heading level
    const pStyleEl2 = kid(pPr, 'pStyle')
    const pStyleName = pStyleEl2 ? (attr(pStyleEl2, 'val') ?? '') : ''
    const headingMatch = pStyleName.match(/^[Hh]eading(\d)$/)
    const headingLevel = headingMatch ? parseInt(headingMatch[1], 10) : null

    const css = pStyleToCSS(pStyle)

    // List detection
    const isListItem = !!(pStyle.numId && pStyle.numId !== '0')

    // Process runs, hyperlinks, smartTags
    const innerParts: string[] = []
    for (const child of Array.from(p.children)) {
        switch (child.localName) {
            case 'r':
                innerParts.push(processRun(child, images, pRStyle))
                break
            case 'hyperlink':
                innerParts.push(processHyperlink(child, images, pRStyle, relationships))
                break
            case 'smartTag':
                // Recurse into smartTag children
                for (const sc of Array.from(child.children)) {
                    if (sc.localName === 'r') innerParts.push(processRun(sc, images, pRStyle))
                }
                break
            case 'ins':
            case 'del':
                // Tracked changes — include insertions, skip deletions
                if (child.localName === 'ins') {
                    for (const sc of Array.from(child.children)) {
                        if (sc.localName === 'r') innerParts.push(processRun(sc, images, pRStyle))
                    }
                }
                break
            default:
                break
        }
    }

    const inner = innerParts.join('') || '&nbsp;'

    if (isListItem) {
        const numId = pStyle.numId!
        const ilvl = parseInt(pStyle.ilvl ?? '0', 10)
        const lvlInfo = numbering.get(numId)?.get(ilvl)
        return {
            html: inner,
            isListItem: true,
            numInfo: {
                numId,
                ilvl,
                fmt: lvlInfo?.numFmt ?? 'bullet',
                indent: lvlInfo?.indent ?? `${(ilvl + 1) * 36}px`,
                hanging: lvlInfo?.hanging ?? '18px',
            },
        }
    }

    const tag = headingLevel ? `h${headingLevel}` : 'p'
    const styleAttr = css ? ` style="${css}"` : ''
    return {
        html: `<${tag}${styleAttr}>${inner}</${tag}>`,
        isListItem: false,
    }
}

function processTable(
    tbl: Element,
    images: Map<string, string>,
    styles: StyleMap,
    numbering: NumberingMap,
    relationships: Map<string, string>
): string {
    // Table-level properties
    const tblPr = kid(tbl, 'tblPr')
    const tblW = tblPr ? kid(tblPr, 'tblW') : null
    const tblWidthType = attr(tblW, 'type')
    const tblWidthVal = attr(tblW, 'w')
    let tableWidth = '100%'
    if (tblWidthType === 'pct' && tblWidthVal) {
        tableWidth = `${parseInt(tblWidthVal, 10) / 50}%`
    } else if (tblWidthType === 'dxa' && tblWidthVal) {
        tableWidth = twipsToPx(tblWidthVal) ?? '100%'
    }

    const rows: string[] = []
    for (const row of kids(tbl, 'tr')) {
        const cells: string[] = []
        for (const cell of kids(row, 'tc')) {
            const tcPr = kid(cell, 'tcPr')

            // Cell width
            const tcW = tcPr ? kid(tcPr, 'tcW') : null
            const cellWidthType = attr(tcW, 'type')
            const cellWidthVal = attr(tcW, 'w')
            let cellWidth = ''
            if (cellWidthType === 'dxa' && cellWidthVal) {
                cellWidth = twipsToPx(cellWidthVal) ?? ''
            }

            // Cell borders
            const tblBorders = kid(tcPr, 'tcBorders')
            const borderParts: string[] = []
            if (tblBorders) {
                for (const side of ['top', 'left', 'bottom', 'right']) {
                    const sideEl = kid(tblBorders, side)
                    if (sideEl) {
                        const sz = attr(sideEl, 'sz')
                        const color = wordColor(attr(sideEl, 'color'))
                        const val = attr(sideEl, 'val')
                        if (val && val !== 'none' && val !== 'nil') {
                            const width = sz ? `${parseInt(sz, 10) / 8}px` : '1px'
                            borderParts.push(`border-${side}:${width} solid ${color ?? '#000'}`)
                        } else {
                            borderParts.push(`border-${side}:none`)
                        }
                    }
                }
            }

            // Cell shading
            const shd = kid(tcPr, 'shd')
            const fill = shd ? wordColor(attr(shd, 'fill')) : null

            // Cell padding
            const tblCellMar = kid(tcPr, 'tcMar')
            const padParts: string[] = []
            if (tblCellMar) {
                for (const side of ['top', 'left', 'bottom', 'right']) {
                    const sideEl = kid(tblCellMar, side)
                    if (sideEl) {
                        padParts.push(`padding-${side}:${twipsToPx(attr(sideEl, 'w')) ?? '4px'}`)
                    }
                }
            }

            // Vertical alignment
            const vAlign = kid(tcPr, 'vAlign')
            const valign = vAlign ? (attr(vAlign, 'val') ?? 'top') : 'top'

            // Span
            const gridSpan = kid(tcPr, 'gridSpan')
            const colspan = gridSpan ? attr(gridSpan, 'val') ?? '1' : '1'

            // Cell content
            const cellContent: string[] = []
            for (const child of Array.from(cell.children)) {
                if (child.localName === 'p') {
                    const result = processParagraph(child, images, styles, numbering, relationships)
                    cellContent.push(result.html)
                } else if (child.localName === 'tbl') {
                    cellContent.push(processTable(child, images, styles, numbering, relationships))
                }
            }

            const cellStyle = [
                cellWidth ? `width:${cellWidth}` : '',
                fill ? `background-color:${fill}` : '',
                `vertical-align:${valign}`,
                'padding:4px 6px',
                ...borderParts,
                ...padParts,
            ].filter(Boolean).join(';')

            const colAttr = colspan !== '1' ? ` colspan="${colspan}"` : ''
            cells.push(`<td${colAttr} style="${cellStyle || 'border:1px solid #d1d5db;padding:4px 6px;'}">${cellContent.join('\n')}</td>`)
        }
        rows.push(`<tr>${cells.join('')}</tr>`)
    }

    return `<table style="border-collapse:collapse;width:${tableWidth};margin:0.5em 0;">\n<tbody>\n${rows.join('\n')}\n</tbody>\n</table>`
}

// ── List grouping helper ──────────────────────────────────────────────────────

interface ListItem {
    html: string
    numId: string
    ilvl: number
    fmt: string
    indent: string
    hanging: string
}

function buildListHtml(items: ListItem[]): string {
    if (!items.length) return ''

    const isBullet = (fmt: string) => fmt === 'bullet' || fmt === 'none'

    // Group by numId+ilvl transitions
    function renderGroup(items: ListItem[], startIdx: number, endIdx: number): string {
        if (startIdx >= endIdx) return ''
        const first = items[startIdx]
        const tag = isBullet(first.fmt) ? 'ul' : 'ol'
        const style = `padding-left:${first.indent};list-style-position:outside;margin:0;`
        let out = `<${tag} style="${style}">`
        let i = startIdx
        while (i < endIdx) {
            const item = items[i]
            // Check if next items are deeper
            if (i + 1 < endIdx && items[i + 1].ilvl > item.ilvl) {
                // Find the sub-group
                const subStart = i + 1
                let subEnd = subStart
                while (subEnd < endIdx && items[subEnd].ilvl > item.ilvl) subEnd++
                out += `<li style="margin:0.1em 0;">${item.html}${renderGroup(items, subStart, subEnd)}</li>`
                i = subEnd
            } else {
                out += `<li style="margin:0.1em 0;">${item.html}</li>`
                i++
            }
        }
        out += `</${tag}>`
        return out
    }

    return renderGroup(items, 0, items.length)
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DocxConvertResult {
    html: string
    margins?: { top: number; bottom: number; left: number; right: number }
    warnings: string[]
}

export async function convertDocxToHtml(buffer: ArrayBuffer): Promise<DocxConvertResult> {
    const warnings: string[] = []

    let zip: JSZip
    try {
        zip = await JSZip.loadAsync(buffer)
    } catch (e) {
        throw new Error('Failed to unzip DOCX file. Is it a valid .docx?')
    }

    // Load XML files
    const loadFile = async (path: string) => {
        const f = zip.file(path)
        return f ? f.async('text') : null
    }

    const [docXml, stylesXml, numXml, relsXml] = await Promise.all([
        loadFile('word/document.xml'),
        loadFile('word/styles.xml'),
        loadFile('word/numbering.xml'),
        loadFile('word/_rels/document.xml.rels'),
    ])

    if (!docXml) throw new Error('word/document.xml not found in the DOCX file.')

    // Build lookup tables
    const styles = parseStyles(stylesXml)
    const numbering = parseNumbering(numXml)
    const images = await extractImages(zip)

    // Parse relationships
    const relationships = new Map<string, string>()
    if (relsXml) {
        const rels = parseXml(relsXml)
        for (const rel of kids(rels, 'Relationship')) {
            const id = attr(rel, 'Id') ?? ''
            const target = attr(rel, 'Target') ?? ''
            const type = attr(rel, 'Type') ?? ''
            if (type.includes('hyperlink')) {
                relationships.set(id, target)
            }
        }
    }

    // Parse document body
    const doc = parseXml(docXml)
    const body = kids(doc, 'body')[0]
    if (!body) throw new Error('Document body not found.')

    const htmlParts: string[] = []
    const listBuffer: ListItem[] = []

    const flushList = () => {
        if (listBuffer.length) {
            htmlParts.push(buildListHtml(listBuffer))
            listBuffer.length = 0
        }
    }

    for (const child of Array.from(body.children)) {
        switch (child.localName) {
            case 'p': {
                const result = processParagraph(
                    child, images, styles, numbering, relationships
                )
                if (result.isListItem && result.numInfo) {
                    listBuffer.push({
                        html: result.html,
                        ...result.numInfo,
                    })
                } else {
                    flushList()
                    htmlParts.push(result.html)
                }
                break
            }
            case 'tbl': {
                flushList()
                htmlParts.push(processTable(child, images, styles, numbering, relationships))
                break
            }
            case 'sectPr':
                // Section properties — currently ignored
                break
            default:
                warnings.push(`Unhandled element: ${child.localName}`)
                break
        }
    }

    flushList()
    const html = htmlParts.join('\n')

    // Extract page margins
    let pageMargins = undefined
    const sectPr = kid(body, 'sectPr')
    if (sectPr) {
        const pgMar = kid(sectPr, 'pgMar')
        if (pgMar) {
            const twToMm = (tw: string | null) => tw ? Math.round(parseInt(tw, 10) / 1440 * 25.4) : 0
            pageMargins = {
                top: twToMm(attr(pgMar, 'top')),
                bottom: twToMm(attr(pgMar, 'bottom')),
                left: twToMm(attr(pgMar, 'left')),
                right: twToMm(attr(pgMar, 'right')),
            }
        }
    }

    return { html, margins: pageMargins, warnings }
}
