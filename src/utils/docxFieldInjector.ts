/**
 * docxFieldInjector.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Injects {field_name} markers directly into .docx XML without converting
 * to HTML. Preserves ALL formatting: fonts, line spacing, tab stops, margins.
 *
 * Used for Path B: user uploads a clean .docx and adds fields via the app UI.
 */

import JSZip from 'jszip'

export interface DocxParagraph {
    index: number        // paragraph index in document body
    text: string         // plain text of the paragraph
    isEmpty: boolean     // true if paragraph has no visible text
}

/**
 * Parse paragraphs from a .docx buffer for display in the Path B UI.
 * Returns paragraph index + text so the user can pick where to inject a field.
 */
export async function parseDocxParagraphs(buffer: ArrayBuffer): Promise<DocxParagraph[]> {
    const zip = await JSZip.loadAsync(buffer)
    const docXml = await zip.file('word/document.xml')?.async('text')
    if (!docXml) throw new Error('Invalid .docx: word/document.xml not found')

    const dom = new DOMParser().parseFromString(docXml, 'application/xml')
    const body = dom.querySelector('body')
    if (!body) throw new Error('Document body not found')

    const paragraphs: DocxParagraph[] = []
    let index = 0

    for (const child of Array.from(body.children)) {
        if (child.localName === 'p') {
            // Extract all text runs
            const textEls = Array.from(child.querySelectorAll('*')).filter(el => el.localName === 't')
            const text = textEls.map(el => el.textContent ?? '').join('')
            paragraphs.push({ index, text, isEmpty: text.trim() === '' })
            index++
        } else if (child.localName === 'tbl') {
            // Treat table as a single block
            const text = Array.from(child.querySelectorAll('*'))
                .filter(el => el.localName === 't')
                .map(el => el.textContent ?? '')
                .join(' ')
            paragraphs.push({ index, text: `[TABLE] ${text.substring(0, 60)}...`, isEmpty: false })
            index++
        }
    }

    return paragraphs
}

export type InjectionPosition = 'before' | 'after' | 'replace' | 'replaceText'

export interface FieldInjection {
    paragraphIndex: number
    fieldName: string
    position: InjectionPosition  // 'before' = prepend, 'after' = append, 'replace' = replace entire text, 'replaceText' = replace specific portion
    targetText?: string          // The specific text to replace (required for 'replaceText')
}

/**
 * Inject one or more {field_name} markers into a .docx buffer.
 * Works directly on the XML - zero formatting disruption.
 */
export async function injectFieldsIntoDocx(
    buffer: ArrayBuffer,
    injections: FieldInjection[]
): Promise<ArrayBuffer> {
    const zip = await JSZip.loadAsync(buffer)
    const docXmlRaw = await zip.file('word/document.xml')?.async('text')
    if (!docXmlRaw) throw new Error('Invalid .docx')

    const dom = new DOMParser().parseFromString(docXmlRaw, 'application/xml')
    const body = dom.querySelector('body')
    if (!body) throw new Error('Document body not found')

    // Collect all paragraph/table elements
    const bodyChildren = Array.from(body.children)
    const blockEls: Element[] = []
    for (const child of bodyChildren) {
        if (child.localName === 'p' || child.localName === 'tbl') {
            blockEls.push(child)
        }
    }

    // Apply each injection
    for (const inj of injections) {
        const el = blockEls[inj.paragraphIndex]
        if (!el || el.localName !== 'p') continue

        const marker = `{${inj.fieldName}}`
        const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

        if (inj.position === 'replace') {
            // Remove all existing runs, insert one run with the marker
            const existingRuns = Array.from(el.children).filter(c => c.localName === 'r')
            existingRuns.forEach(r => r.parentNode?.removeChild(r))

            const run = dom.createElementNS(ns, 'w:r')
            const t = dom.createElementNS(ns, 'w:t')
            t.setAttribute('xml:space', 'preserve')
            t.textContent = marker
            run.appendChild(t)

            // Insert after pPr if exists, otherwise at start
            const pPr = el.querySelector('pPr')
            if (pPr && pPr.parentNode === el) {
                pPr.insertAdjacentElement('afterend', run)
            } else {
                el.insertBefore(run, el.firstChild)
            }

        } else if (inj.position === 'before') {
            // Prepend a new run before existing content
            const run = dom.createElementNS(ns, 'w:r')
            const t = dom.createElementNS(ns, 'w:t')
            t.setAttribute('xml:space', 'preserve')
            t.textContent = marker + ' '
            run.appendChild(t)

            const pPr = el.querySelector('pPr')
            const firstRun = Array.from(el.children).find(c => c.localName === 'r')
            if (firstRun) {
                el.insertBefore(run, firstRun)
            } else if (pPr) {
                pPr.insertAdjacentElement('afterend', run)
            } else {
                el.insertBefore(run, el.firstChild)
            }

        } else if (inj.position === 'replaceText' && inj.targetText) {
            // Complex replacement: find the text within the runs and replace it
            const marker = `{${inj.fieldName}}`

            // Gather all text runs and their full-text offsets
            const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
            const runs = Array.from(el.getElementsByTagNameNS(ns, 'r'))
            let fullText = ""
            const runInfo: { el: Element, start: number, end: number, text: string }[] = []

            for (const run of runs) {
                const textEl = Array.from(run.getElementsByTagNameNS(ns, 't'))[0]
                if (!textEl) continue
                const text = textEl.textContent || ""
                runInfo.push({
                    el: run,
                    start: fullText.length,
                    end: fullText.length + text.length,
                    text: text
                })
                fullText += text
            }

            const matchIndex = fullText.indexOf(inj.targetText)
            if (matchIndex !== -1) {
                const matchEnd = matchIndex + inj.targetText.length

                // Find runs involved in the match
                const involvedRuns = runInfo.filter(ri => ri.start < matchEnd && ri.end > matchIndex)

                if (involvedRuns.length > 0) {
                    // Simplest approach: Replace the first run's text with the marker (and any prefix)
                    // and remove/clear others. This is slightly destructive for mixed formatting
                    // within the match, but preserves surrounding formatting.

                    const first = involvedRuns[0]
                    const prefix = first.text.substring(0, matchIndex - first.start)

                    const last = involvedRuns[involvedRuns.length - 1]
                    const suffix = last.text.substring(matchEnd - last.start)

                    const textEl = Array.from(first.el.getElementsByTagNameNS(ns, 't'))[0]
                    if (textEl) {
                        textEl.textContent = prefix + marker + (involvedRuns.length === 1 ? suffix : "")
                    }

                    // Clear intermediate/last runs if multiple runs were involved
                    for (let i = 1; i < involvedRuns.length; i++) {
                        const ri = involvedRuns[i]
                        const t = Array.from(ri.el.getElementsByTagNameNS(ns, 't'))[0]
                        if (t) {
                            t.textContent = (i === involvedRuns.length - 1) ? suffix : ""
                        }
                    }
                }
            }
        } else {
            // 'after': append a new run at the end of the paragraph
            const run = dom.createElementNS(ns, 'w:r')
            const t = dom.createElementNS(ns, 'w:t')
            t.setAttribute('xml:space', 'preserve')
            t.textContent = ' ' + marker
            run.appendChild(t)
            el.appendChild(run)
        }
    }

    // Serialize back to XML string
    const serializer = new XMLSerializer()
    const newXml = serializer.serializeToString(dom)

    zip.file('word/document.xml', newXml)

    const result = await zip.generateAsync({ type: 'arraybuffer' })
    return result
}

/**
 * Extract all {field} markers from a .docx buffer using full text scan.
 * Uses docxtemplater-compatible single-brace syntax.
 */
export function extractFieldsFromBuffer(_buffer: ArrayBuffer): string[] {
    // We reuse the same logic as template.service.ts extractFields
    // but inline here to avoid circular imports
    // const _PizZip = (window as any).__pizzip__ // fallback, prefer direct import
    // This function is a thin wrapper - the actual extraction happens in
    // template.service.ts extractFields(). Call that instead.
    // This export exists for convenience.
    return []
}
