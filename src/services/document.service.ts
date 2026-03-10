import { supabase } from './supabase'
import { renderContent } from './template.service'
import type { Template } from './template.service'

export interface GeneratedDocument {
    id?: string
    schoolId: string
    templateId: string
    templateName: string
    title: string
    generatedBy: string
    data: Record<string, string>
    createdAt: Date
    status: 'draft' | 'final'
}

export async function generateDocument(template: Template, data: Record<string, string>, generatedBy: string, title: string): Promise<{ id: string; docxBlob: Blob }> {
    const docxBlob = renderContent(template.content, data)

    const record = {
        school_id: template.schoolId,
        template_id: template.id!,
        template_name: template.name,
        title: title.trim() || template.name,
        generated_by: generatedBy,
        form_data: data,
        status: 'final'
    }

    const { data: inserted, error } = await supabase
        .from('documents')
        .insert(record)
        .select()
        .single()

    if (error) throw error

    return { id: inserted.id, docxBlob }
}

export async function getSchoolDocuments(schoolId: string): Promise<GeneratedDocument[]> {
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })

    if (error) throw error

    return data.map(d => ({
        id: d.id,
        schoolId: d.school_id,
        templateId: d.template_id,
        templateName: d.template_name,
        title: d.title,
        generatedBy: d.generated_by,
        data: d.form_data,
        createdAt: new Date(d.created_at),
        status: d.status
    } as GeneratedDocument))
}

export async function getDocument(id: string): Promise<GeneratedDocument | null> {
    const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !data) return null

    return {
        id: data.id,
        schoolId: data.school_id,
        templateId: data.template_id,
        templateName: data.template_name,
        title: data.title,
        generatedBy: data.generated_by,
        data: data.form_data,
        createdAt: new Date(data.created_at),
        status: data.status
    } as GeneratedDocument
}

export async function updateDocument(documentId: string, template: Template, newData: Record<string, string>, newTitle: string): Promise<{ docxBlob: Blob }> {
    const docxBlob = renderContent(template.content, newData)

    const { error } = await supabase
        .from('documents')
        .update({
            title: newTitle.trim() || template.name,
            form_data: newData,
            status: 'final'
        })
        .eq('id', documentId)

    if (error) throw error

    return { docxBlob }
}

export async function deleteDocument(documentId: string): Promise<void> {
    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId)

    if (error) throw error
}

export function downloadDocument(docxBlob: Blob, title: string): void {
    const safeTitle = title.replace(/[^\w\s-]/g, '').trim() || 'document'
    const url = URL.createObjectURL(docxBlob)
    const link = Object.assign(document.createElement('a'), { href: url, download: `${safeTitle}.docx` })
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function printDocument(docxBlob: Blob, title: string): void {
    downloadDocument(docxBlob, title)
}

export function printDocumentAsPdf(htmlContent: string, title: string, margins?: { top: number; bottom: number; left: number; right: number }): void {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
        alert('Please allow popups to print')
        return
    }

    const mg = margins || { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 }

    const printHtml = `
        <!DOCTYPE html>
        <html>
            <head>
                <title>${title}</title>
                <style>
                    @page { 
                        size: A4; 
                        margin: 0; 
                    }
                    body { 
                        margin: 0; 
                        background: #f0f2f5;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding: 40px 0;
                        -webkit-print-color-adjust: exact;
                        font-family: Arial, sans-serif;
                    }
                    .print-container {
                        background: white;
                        width: 210mm;
                        min-height: 297mm;
                        padding: ${mg.top}mm ${mg.right}mm ${mg.bottom}mm ${mg.left}mm;
                        box-sizing: border-box;
                        font-family: 'Times New Roman', Times, serif;
                        font-size: 12pt;
                        line-height: 1.6;
                        color: #111;
                        box-shadow: 0 0 10px rgba(0,0,0,0.2);
                        position: relative;
                        
                        /* Word-style Paged View: Gap between pages in browser */
                        /* We use a background gradient with solid stops to create the gap */
                        background-image: linear-gradient(to bottom, #fff 296mm, #eee 296mm, #eee 297mm, #f0f2f5 297mm, #f0f2f5 307mm, #eee 307mm, #eee 308mm, #fff 308mm);
                        background-size: 100% 307mm;
                    }
                    /* Preservation of Tiptap styles */
                    .print-container h1 { font-size: 2.5em; font-weight: 700; margin: 0.5em 0 0.35em; line-height: 1.1; }
                    .print-container h2 { font-size: 1.75em; font-weight: 700; margin: 0.4em 0 0.3em; line-height: 1.2; }
                    .print-container h3 { font-size: 1.3em; font-weight: 600; margin: 0.3em 0 0.25em; }
                    .print-container p { margin: 0.4em 0; }
                    .print-container ul, .print-container ol { padding-left: 1.75em; margin: 0.5em 0; }
                    .print-container li { margin: 0.2em 0; }
                    .print-container table { border-collapse: collapse; width: 100%; margin: 1em 0; border: 1px solid #000; table-layout: fixed; }
                    .print-container th, .print-container td { border: 1px solid #000; padding: 8px 12px; vertical-align: top; overflow-wrap: break-word; }
                    .print-container th { background: #f3f4f6; font-weight: 600; }
                    .print-container img { max-width: 100%; height: auto; display: block; margin: 1em 0; }
                    .print-container blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; margin: 1em 0; color: #4b5563; font-style: italic; }
                    .print-container hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }

                    /* Smart Page Breaking */
                    .print-container h1, .print-container h2, .print-container h3 { page-break-after: avoid; break-after: avoid; }
                    .print-container table, .print-container img, .print-container blockquote { 
                        page-break-inside: avoid; 
                        break-inside: avoid; 
                    }

                    @media print {
                        body { background: none; padding: 0; }
                        .print-container { 
                            box-shadow: none; 
                            width: 100%; 
                            margin: 0; 
                            padding: ${mg.top}mm ${mg.right}mm ${mg.bottom}mm ${mg.left}mm;
                            background-image: none !important; /* Hide gaps during print */
                        }
                    }
                </style>
            </head>
            <body>
                <div class="print-container">${htmlContent}</div>
                <script>
                    window.onload = () => {
                        window.print();
                    };
                </script>
            </body>
        </html>
    `

    printWindow.document.open()
    printWindow.document.write(printHtml)
    printWindow.document.close()
}

