import {
    collection, doc, addDoc, updateDoc, deleteDoc,
    getDoc, getDocs, query, where, deleteField,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Types ─────────────────────────────────────────────────────────────────

export interface TemplateField {
    key: string
    label: string
}

export interface Template {
    id?: string
    schoolId: string
    name: string
    description: string
    content: string          // HTML/text with {{placeholder}} tokens
    fields: TemplateField[]  // auto-detected from content
    pdfReferenceUrl?: string // Firebase Storage URL for reference PDF
    createdBy: string
    createdAt: Date
    updatedAt: Date
    isActive: boolean
}

// ── Utilities ─────────────────────────────────────────────────────────────

/**
 * Scans template content for {{placeholder}} tokens AND image-placeholder nodes
 * and returns a deduplicated list of TemplateField objects with auto-generated labels.
 */
export function extractFields(content: string = ''): TemplateField[] {
    const fields: TemplateField[] = []
    const seen = new Set<string>()

    const addField = (key: string) => {
        if (!seen.has(key)) {
            seen.add(key)
            fields.push({
                key,
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            })
        }
    }

    // Hand-coded {{text}} placeholders
    let match: RegExpExecArray | null
    const regex = /\{\{([^}]+)\}\}/g
    while ((match = regex.exec(content || '')) !== null) addField(match[1].trim())

    // Image placeholder nodes via DOM Parsing
    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(content || '', 'text/html')
        const imgNodes = doc.querySelectorAll('[data-type="image-placeholder"]')
        imgNodes.forEach(node => {
            const k = node.getAttribute('data-field-key')
            if (k) addField(k)
        })
    } catch (e) {
        console.warn('DOM parser not available for extractFields')
    }

    return fields
}

/**
 * Fills {{placeholder}} tokens in content with values from data map.
 * Also replaces <span data-type="image-placeholder"> with actual <img>.
 * Unknown tokens are left as [key] for visibility.
 */
export function renderContent(content: string = '', data: Record<string, string>): string {
    let result = (content || '').replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        const k = key.trim()
        return data[k] ?? `[${k}]`
    })

    try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(result, 'text/html')
        const imgNodes = doc.querySelectorAll('[data-type="image-placeholder"]')

        imgNodes.forEach(node => {
            const k = node.getAttribute('data-field-key')
            const w = node.getAttribute('data-width') || '150'
            const h = node.getAttribute('data-height') || '150'
            const x = node.getAttribute('data-x')
            const y = node.getAttribute('data-y')
            if (!k) return

            const imgSrc = data[k]
            const isFloating = x !== null && y !== null

            if (imgSrc && (imgSrc.startsWith('http') || imgSrc.startsWith('data:'))) {
                const img = doc.createElement('img')
                img.src = imgSrc
                img.style.width = `${w}px`
                img.style.height = `${h}px`
                img.style.objectFit = 'cover'
                img.style.display = 'block'

                if (isFloating) {
                    // Wrap in absolute-positioned container (matches editor position)
                    const wrapper = doc.createElement('div')
                    wrapper.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`
                    wrapper.appendChild(img)
                    node.replaceWith(wrapper)
                } else {
                    img.style.maxWidth = '100%'
                    node.replaceWith(img)
                }
            } else {
                // Placeholder box: show label + grey fill if image not provided
                const div = doc.createElement('div')
                const baseStyle = `width:${w}px;height:${h}px;background:#f3f4f6;border:2px dashed #d1d5db;color:#9ca3af;display:inline-flex;align-items:center;justify-content:center;font-family:monospace;font-size:12px;box-sizing:border-box;`
                if (isFloating) {
                    div.style.cssText = `position:absolute;left:${x}px;top:${y}px;` + baseStyle
                } else {
                    div.style.cssText = baseStyle
                }
                div.textContent = `Image: ${k}`
                node.replaceWith(div)
            }
        })
        return doc.body.innerHTML
    } catch (e) {
        return result
    }
}


// ── CRUD ──────────────────────────────────────────────────────────────────


/** Strips undefined values — Firestore rejects undefined fields */
function sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
        out[k] = v === undefined ? deleteField() : v
    }
    return out
}

export async function createTemplate(
    data: Omit<Template, 'id'>,
): Promise<string> {
    try {
        // Build Firestore-safe payload — no undefined values
        const payload: Record<string, unknown> = {
            schoolId: data.schoolId,
            name: data.name,
            description: data.description,
            content: data.content,
            fields: data.fields,
            createdBy: data.createdBy,
            isActive: data.isActive ?? true,
            createdAt: data.createdAt ?? new Date(),
            updatedAt: new Date(),
        }
        if (data.pdfReferenceUrl) payload.pdfReferenceUrl = data.pdfReferenceUrl
        const ref = await addDoc(collection(db, 'templates'), payload)
        console.log('[TemplateService] Created template:', ref.id)
        return ref.id
    } catch (err) {
        console.error('[TemplateService] createTemplate failed:', err)
        throw err
    }
}

export async function updateTemplate(
    id: string,
    data: Partial<Omit<Template, 'id'>>,
): Promise<void> {
    try {
        // Build Firestore-safe payload — replace undefined with deleteField()
        const base: Record<string, unknown> = {
            name: data.name,
            description: data.description,
            content: data.content,
            fields: data.fields,
            schoolId: data.schoolId,
            createdBy: data.createdBy,
            updatedAt: new Date(),
        }
        // Optional field: only set if we have a value, remove from Firestore if null/undefined
        base.pdfReferenceUrl = data.pdfReferenceUrl ? data.pdfReferenceUrl : deleteField()

        // Remove keys from the base that were not provided in 'data'
        const payload = sanitize(Object.fromEntries(
            Object.entries(base).filter(([k]) => k === 'updatedAt' || k === 'pdfReferenceUrl' || k in data)
        ))

        await updateDoc(doc(db, 'templates', id), payload)
        console.log('[TemplateService] Updated template:', id)
    } catch (err) {
        console.error('[TemplateService] updateTemplate failed:', err)
        throw err
    }
}

/** Soft-delete: sets isActive=false */
export async function archiveTemplate(id: string): Promise<void> {
    await updateDoc(doc(db, 'templates', id), {
        isActive: false,
        updatedAt: new Date(),
    })
}

/** Hard-delete: permanently removes the template document */
export async function deleteTemplate(id: string): Promise<void> {
    await deleteDoc(doc(db, 'templates', id))
    console.log('[TemplateService] Deleted template:', id)
}

export async function getTemplate(id: string): Promise<Template | null> {
    const snap = await getDoc(doc(db, 'templates', id))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as Template
}

export async function getSchoolTemplates(schoolId: string): Promise<Template[]> {
    try {
        // Single-field query — no composite index needed
        // isActive filter + date sort done client-side
        const snap = await getDocs(
            query(
                collection(db, 'templates'),
                where('schoolId', '==', schoolId),
            ),
        )
        return snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Template))
            .filter((t) => t.isActive !== false)
            .sort((a, b) => {
                const aTime = (a.createdAt as unknown as { seconds?: number })?.seconds ?? 0
                const bTime = (b.createdAt as unknown as { seconds?: number })?.seconds ?? 0
                return bTime - aTime
            })
    } catch (err) {
        console.error('[TemplateService] getSchoolTemplates failed:', err)
        throw err
    }
}
