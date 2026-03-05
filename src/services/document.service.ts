import {
    collection, addDoc, getDoc, getDocs,
    query, where, doc, deleteDoc, updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { renderContent } from './template.service'
import type { Template } from './template.service'

// ── Types ─────────────────────────────────────────────────────────────────

export interface GeneratedDocument {
    id?: string
    schoolId: string
    templateId: string
    templateName: string
    title: string
    generatedBy: string          // uid
    data: Record<string, string> // field values used
    htmlContent: string          // rendered output
    createdAt: Date
    status: 'draft' | 'final'
}

// ── Generation ────────────────────────────────────────────────────────────

/**
 * Renders template content with provided data, saves to Firestore,
 * and returns the new document ID.
 */
export async function generateDocument(
    template: Template,
    data: Record<string, string>,
    generatedBy: string,
    title: string,
): Promise<{ id: string; htmlContent: string }> {
    try {
        const htmlContent = renderContent(template.content, data)

        const record: GeneratedDocument = {
            schoolId: template.schoolId,
            templateId: template.id!,
            templateName: template.name,
            title: title.trim() || template.name,
            generatedBy,
            data,
            htmlContent,
            createdAt: new Date(),
            status: 'final',
        }

        const ref = await addDoc(collection(db, 'documents'), record)
        console.log('[DocumentService] Generated document:', ref.id)
        return { id: ref.id, htmlContent }
    } catch (err) {
        console.error('[DocumentService] generateDocument failed:', err)
        throw err
    }
}

// ── Queries ───────────────────────────────────────────────────────────────

export async function getSchoolDocuments(schoolId: string): Promise<GeneratedDocument[]> {
    try {
        // Single-field query — no composite index needed
        const snap = await getDocs(
            query(
                collection(db, 'documents'),
                where('schoolId', '==', schoolId),
            ),
        )
        return snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as GeneratedDocument))
            .sort((a, b) => {
                const aTime = (a.createdAt as unknown as { seconds?: number })?.seconds ?? 0
                const bTime = (b.createdAt as unknown as { seconds?: number })?.seconds ?? 0
                return bTime - aTime
            })
    } catch (err) {
        console.error('[DocumentService] getSchoolDocuments failed:', err)
        throw err
    }
}

export async function getDocument(id: string): Promise<GeneratedDocument | null> {
    const snap = await getDoc(doc(db, 'documents', id))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as GeneratedDocument
}

// ── Mutations ─────────────────────────────────────────────────────────────

/** Re-render document with updated field values and save back to Firestore */
export async function updateDocument(
    documentId: string,
    template: import('./template.service').Template,
    newData: Record<string, string>,
    newTitle: string,
): Promise<{ htmlContent: string }> {
    const { renderContent } = await import('./template.service')
    const htmlContent = renderContent(template.content, newData)
    await updateDoc(doc(db, 'documents', documentId), {
        title: newTitle.trim() || template.name,
        data: newData,
        htmlContent,
        updatedAt: new Date(),
        status: 'final',
    })
    console.log('[DocumentService] Updated document:', documentId)
    return { htmlContent }
}

/** Hard-delete a document from Firestore */
export async function deleteDocument(documentId: string): Promise<void> {
    await deleteDoc(doc(db, 'documents', documentId))
    console.log('[DocumentService] Deleted document:', documentId)
}

// ── Download as standalone HTML ────────────────────────────────────────────

/**
 * Downloads the document as a self-contained .html file.
 * The file is styled and can be opened in Word or any browser.
 */
export function downloadDocumentAsHtml(htmlContent: string, title: string): void {
    const safeTitle = title.replace(/[^\w\s-]/g, '').trim() || 'document'
    const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      color: #111;
      max-width: 794px;
      margin: 0 auto;
      padding: 30mm 25mm;
      line-height: 1.7;
    }
    h1 { font-size: 2em; font-weight: bold; margin: 0.6em 0 0.3em; }
    h2 { font-size: 1.5em; font-weight: bold; margin: 0.5em 0 0.25em; }
    h3 { font-size: 1.2em; font-weight: 600; margin: 0.4em 0 0.2em; }
    p  { margin-bottom: 0.6em; }
    ul { list-style: disc; padding-left: 1.75em; margin-bottom: 0.6em; }
    ol { list-style: decimal; padding-left: 1.75em; margin-bottom: 0.6em; }
    li { margin-bottom: 0.2em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    @media print {
      body { padding: 0; }
      @page { margin: 20mm; size: A4; }
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeTitle}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// ── Print to PDF ──────────────────────────────────────────────────────────

/**
 * Opens a new browser window with the document rendered for printing.
 * Uses browser native print-to-PDF — zero dependencies, works everywhere.
 */
export function printDocument(htmlContent: string, title: string): void {
    const win = window.open('', '_blank')
    if (!win) { alert('Please allow pop-ups to print documents'); return }

    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      color: #000;
      padding: 30mm 25mm;
      line-height: 1.6;
    }
    h1, h2, h3 { margin-bottom: 0.5em; }
    p { margin-bottom: 0.75em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1em; }
    th, td { border: 1px solid #333; padding: 6px 10px; text-align: left; }
    @media print {
      body { padding: 0; }
      @page { margin: 20mm; size: A4; }
    }
  </style>
</head>
<body>${htmlContent}</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 400)
}
