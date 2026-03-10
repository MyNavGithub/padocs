/**
 * Email Service — Provider-Agnostic Abstraction
 *
 * Emails are queued in Firestore `mailQueue/{docId}`.
 * A listener (Firebase Trigger Email Extension, Cloud Function, or
 * any backend — Sendgrid, Mailgun, etc.) consumes the queue.
 *
 * This approach:
 * ✅ Works with Firebase Trigger Email Extension (zero backend)
 * ✅ Supports African gateways (Sendgrid Africa, etc.)
 * ✅ No provider lock-in
 * ✅ Fully auditable (every email attempt is recorded)
 */

// import { supabase } from './supabase'

// ── Types ─────────────────────────────────────────────────────────────────

export type EmailTemplate =
    | 'teacher-invite'
    | 'teacher-rejected'
    | 'teacher-activated'

export interface QueuedEmail {
    to: string
    template: EmailTemplate
    data: Record<string, string | number | boolean>
    createdAt: Date
    status: 'pending'
}

// ── Queue email ───────────────────────────────────────────────────────────

async function queueEmail(
    to: string,
    template: EmailTemplate,
    _data: Record<string, string | number | boolean>,
): Promise<void> {
    try {
        // [MANUAL WORKAROUND]
        // Firebase Cloud Functions require a Blaze subscription (billing account).
        // Since no backend infrastructure is available and frontend API calls are insecure,
        // we are shifting to Option 4 (Manual Notification). 
        // 
        // The original logic queued an email in the Firestore 'mailQueue' collection.
        // Uncomment the code below if migrating back to a Cloud Functions/Backend infrastructure.
        /*
        await addDoc(collection(db, 'mailQueue'), email)
        console.log('[EmailService] Queued email:', template, 'to:', to)
        */
        console.log('[EmailService] Automated emailing disabled (Manual Workaround Active). Skipping template:', template, 'to:', to)
    } catch (err) {
        console.error('[EmailService] Failed:', err)
        throw err
    }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Sends teacher activation invite email.
 * Link: /teacher-activate?token=TOKEN
 */
export async function sendTeacherInviteEmail(params: {
    to: string
    schoolName: string
    token: string
    expiresInHours: number
}): Promise<void> {
    const activationUrl = `${window.location.origin}/teacher-activate?token=${params.token}`
    await queueEmail(params.to, 'teacher-invite', {
        schoolName: params.schoolName,
        activationUrl,
        expiresInHours: params.expiresInHours,
    })
}

/**
 * Sends rejection email when email is not on approved list.
 */
export async function sendTeacherRejectionEmail(params: {
    to: string
    schoolName: string
}): Promise<void> {
    await queueEmail(params.to, 'teacher-rejected', {
        schoolName: params.schoolName,
    })
}

/**
 * Sends welcome email after teacher activates their account.
 */
export async function sendTeacherActivatedEmail(params: {
    to: string
    schoolName: string
}): Promise<void> {
    await queueEmail(params.to, 'teacher-activated', {
        schoolName: params.schoolName,
    })
}
