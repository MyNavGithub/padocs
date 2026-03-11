import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import ImageModule from 'docxtemplater-image-module-free'
import { supabase } from './supabase'

export interface Template {
    id?: string
    schoolId: string
    name: string
    description?: string
    content: ArrayBuffer
    contentHtml?: string        // persisted HTML from the rich-text editor
    contentStorageUrl?: string
    fields: string[]
    createdBy?: string
    createdAt?: any
    updatedAt?: any
    pdfReferenceUrl?: string
    isActive?: boolean
    margins?: { top: number; bottom: number; left: number; right: number }
}

export function renderContent(templateBuffer: ArrayBuffer, data: Record<string, string>): Blob {
    const zip = new PizZip(templateBuffer, { base64: false })

    const imageModule = new ImageModule({
        centered: false,
        fileType: 'docx',
        getImage: (tagValue: string) => {
            const base64 = tagValue.replace(/^data:image\/\w+;base64,/, '')
            const binary = atob(base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            return bytes
        },
        getSize: () => [150, 150],
    })

    const docx = new Docxtemplater(zip, {
        modules: [imageModule],
        paragraphLoop: true,
        linebreaks: true,
    })
    docx.render(data)

    const out = docx.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    return out
}

export function renderHtmlContent(html: string, data: Record<string, string>): string {
    return html.replace(/\{([^{}]+)\}/g, (match, field) => {
        const key = field.trim()
        return data[key] !== undefined ? data[key] : match
    })
}

export function readDocxFile(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
    })
}

export function extractFields(input: ArrayBuffer | string): string[] {
    const matches = new Set<string>()
    const regex = /\{([^{}]+)\}/g

    if (typeof input === 'string') {
        let match
        while ((match = regex.exec(input)) !== null) {
            matches.add(match[1].trim())
        }
    } else {
        const zip = new PizZip(input)
        const docx = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        })
        const text = docx.getFullText()
        let match
        while ((match = regex.exec(text)) !== null) {
            matches.add(match[1].trim())
        }
    }
    return Array.from(matches)
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    bytes.forEach(b => binary += String.fromCharCode(b))
    return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
}

// ── Helpers: upload/download .docx binary via Supabase Storage ──────────

async function uploadTemplateDocx(schoolId: string, templateId: string, buffer: ArrayBuffer): Promise<string> {
    const filePath = `schools/${schoolId}/${templateId}.docx`
    const { error } = await supabase.storage
        .from('templates')
        .upload(filePath, buffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true
        })

    if (error) throw error

    const { data } = supabase.storage.from('templates').getPublicUrl(filePath)
    return data.publicUrl
}

async function downloadTemplateDocx(schoolId: string, templateId: string): Promise<ArrayBuffer> {
    const filePath = `schools/${schoolId}/${templateId}.docx`
    const { data, error } = await supabase.storage.from('templates').download(filePath)
    if (error) throw error
    return await data.arrayBuffer()
}

// ── Template CRUD ──────────────────────────────────────────────────────

export async function getSchoolTemplates(schoolId: string): Promise<Template[]> {
    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })

    if (error) throw error

    return data.map(d => ({
        id: d.id,
        schoolId: d.school_id,
        name: d.name,
        fields: d.fields,
        pdfReferenceUrl: d.pdf_reference_url,
        isActive: d.is_active,
        createdAt: d.created_at,
        contentHtml: d.content_html ?? undefined,
        content: new ArrayBuffer(0) // Don't download binary for list view
    } as Template))
}

export async function getTemplate(id: string, includeContent: boolean = true): Promise<Template | null> {
    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !data) return null

    let content: ArrayBuffer = new ArrayBuffer(0)
    if (includeContent) {
        try {
            content = await downloadTemplateDocx(data.school_id, data.id)
        } catch (e) {
            console.warn('Failed to download template content:', e)
        }
    }

    return {
        id: data.id,
        schoolId: data.school_id,
        name: data.name,
        fields: data.fields,
        pdfReferenceUrl: data.pdf_reference_url,
        isActive: data.is_active,
        createdAt: data.created_at,
        contentHtml: data.content_html ?? undefined,
        content
    } as Template
}

export async function createTemplate(templateData: Omit<Template, 'id'>): Promise<string> {
    const { content, ...dbData } = templateData

    const record: any = {
        school_id: dbData.schoolId,
        name: dbData.name,
        fields: dbData.fields,
        pdf_reference_url: dbData.pdfReferenceUrl,
        is_active: dbData.isActive !== false,
        content_html: dbData.contentHtml
    }

    const { data: inserted, error } = await supabase
        .from('templates')
        .insert(record)
        .select()
        .single()

    if (error) throw error

    if (content && content.byteLength > 0) {
        await uploadTemplateDocx(inserted.school_id, inserted.id, content)
    }

    return inserted.id
}

export async function updateTemplate(id: string, templateData: Partial<Template>): Promise<void> {
    const { content, ...dbData } = templateData

    const record: any = {}
    if (dbData.name !== undefined) record.name = dbData.name
    if (dbData.fields !== undefined) record.fields = dbData.fields
    if (dbData.pdfReferenceUrl !== undefined) record.pdf_reference_url = dbData.pdfReferenceUrl
    if (dbData.isActive !== undefined) record.is_active = dbData.isActive
    if (dbData.contentHtml !== undefined) record.content_html = dbData.contentHtml

    if (Object.keys(record).length > 0) {
        const { error } = await supabase
            .from('templates')
            .update(record)
            .eq('id', id)

        if (error) throw error
    }

    if (content && content.byteLength > 0 && dbData.schoolId) {
        await uploadTemplateDocx(dbData.schoolId, id, content)
    }
}

export async function deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id)

    if (error) throw error
}
