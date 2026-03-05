/**
 * Teacher Onboarding Service
 *
 * Implements controlled teacher signup for a multi-tenant school SaaS:
 *
 * FLOW A — Admin uploads approved list:
 *   uploadApprovedTeachers(schoolId, emails[])
 *   → Creates approvedTeachers docs with status="unused"
 *
 * FLOW B — Teacher attempts signup:
 *   validateAndInviteTeacher(email, schoolId, schoolName)
 *   → Checks approvedTeachers
 *   → If not found: queues rejection email, throws
 *   → If found: generates token, writes inviteTokens/{token},
 *               updates approvedTeachers status="invited",
 *               queues activation email
 *
 * FLOW C — Teacher opens activation link (/teacher-activate?token=XYZ):
 *   verifyInviteToken(token)        → validates token + expiry
 *   activateTeacherAccount(...)     → creates Auth user + Firestore docs
 */

import {
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    Timestamp,
} from 'firebase/firestore'
import {
    createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth, db } from './firebase'
import {
    sendTeacherInviteEmail,
    sendTeacherRejectionEmail,
    sendTeacherActivatedEmail,
} from './email.service'
import type { UserProfile, SchoolUserRecord } from './auth.service'

// ── Constants ─────────────────────────────────────────────────────────────

const INVITE_EXPIRY_HOURS = 72  // token valid for 72 hours

// ── Types ─────────────────────────────────────────────────────────────────

export type ApprovedTeacherStatus = 'unused' | 'invited' | 'activated'

export interface ApprovedTeacher {
    schoolId: string
    email: string
    status: ApprovedTeacherStatus
    inviteToken: string | null
    inviteExpiresAt: Date | null
    uploadedAt: Date
}

/** Stored in inviteTokens/{token} — token IS the doc ID */
export interface InviteTokenRecord {
    approvedTeacherId: string   // docId in approvedTeachers
    schoolId: string
    email: string
    expiresAt: Date
}

// ── PART 1 — Admin: Upload Approved Teachers ──────────────────────────────

/**
 * Batch-creates approvedTeacher documents for a school.
 * Idempotent: skips emails that already exist for this school.
 * Called after admin uploads a CSV file.
 */
export async function uploadApprovedTeachers(
    schoolId: string,
    emails: string[],
): Promise<{ added: number; skipped: number }> {
    let added = 0
    let skipped = 0

    for (const rawEmail of emails) {
        const email = rawEmail.toLowerCase().trim()
        if (!email) continue

        try {
            // Check if already exists for this school
            const existing = await getDocs(
                query(
                    collection(db, 'approvedTeachers'),
                    where('schoolId', '==', schoolId),
                    where('email', '==', email),
                ),
            )

            if (!existing.empty) {
                console.log('[uploadApprovedTeachers] Skipping duplicate:', email)
                skipped++
                continue
            }

            const record: ApprovedTeacher = {
                schoolId,
                email,
                status: 'unused',
                inviteToken: null,
                inviteExpiresAt: null,
                uploadedAt: new Date(),
            }

            await addDoc(collection(db, 'approvedTeachers'), record)
            console.log('[uploadApprovedTeachers] Added:', email)
            added++
        } catch (err) {
            console.error('[uploadApprovedTeachers] Error adding:', email, err)
        }
    }

    console.log(`[uploadApprovedTeachers] Done. Added: ${added}, Skipped: ${skipped}`)
    return { added, skipped }
}

// ── PART 2 — Teacher Attempts Signup ─────────────────────────────────────

/**
 * Validates a teacher's email against the approvedTeachers list for a school.
 *
 * If NOT approved:
 *   - Queues rejection email
 *   - Throws — NO Firebase Auth user is created
 *
 * If approved and unused:
 *   - Generates a cryptographically secure random token
 *   - Writes inviteTokens/{token}
 *   - Updates approvedTeachers status → "invited"
 *   - Queues activation email with link
 *   - Returns the token (for testing purposes)
 */
export async function validateAndInviteTeacher(
    email: string,
    schoolId: string,
    schoolName: string,
): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim()
    console.log('[validateAndInviteTeacher] Checking email:', normalizedEmail, 'for school:', schoolId)

    // Query approvedTeachers for this email + school
    const approvedSnap = await getDocs(
        query(
            collection(db, 'approvedTeachers'),
            where('schoolId', '==', schoolId),
            where('email', '==', normalizedEmail),
        ),
    )

    // ── NOT FOUND — reject ────────────────────────────────────────────────
    if (approvedSnap.empty) {
        console.warn('[validateAndInviteTeacher] Email NOT on approved list:', normalizedEmail)

        // Queue rejection email (do not throw before queuing)
        try {
            await sendTeacherRejectionEmail({ to: normalizedEmail, schoolName })
        } catch (emailErr) {
            console.error('[validateAndInviteTeacher] Failed to queue rejection email:', emailErr)
        }

        throw new Error('TEACHER_NOT_APPROVED')
    }

    // ── FOUND — check status ──────────────────────────────────────────────
    const approvedDoc = approvedSnap.docs[0]
    const approvedData = approvedDoc.data() as ApprovedTeacher

    if (approvedData.status === 'activated') {
        throw new Error('TEACHER_ALREADY_ACTIVATED')
    }

    if (approvedData.status === 'invited') {
        // Could re-send invite — for now throw to avoid duplicate tokens
        throw new Error('TEACHER_ALREADY_INVITED')
    }

    // ── GENERATE TOKEN ────────────────────────────────────────────────────
    // Uses crypto.randomUUID() — cryptographically secure, not guessable
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000)

    console.log('[validateAndInviteTeacher] Generated token for:', normalizedEmail)

    // Write inviteTokens/{token} — token IS the document ID
    const tokenRecord: InviteTokenRecord = {
        approvedTeacherId: approvedDoc.id,
        schoolId,
        email: normalizedEmail,
        expiresAt,
    }
    await setDoc(doc(db, 'inviteTokens', token), tokenRecord)
    console.log('[validateAndInviteTeacher] inviteTokens/{token} written ✓')

    // Update approvedTeachers status → "invited"
    await updateDoc(doc(db, 'approvedTeachers', approvedDoc.id), {
        status: 'invited',
        inviteToken: token,
        inviteExpiresAt: expiresAt,
    })
    console.log('[validateAndInviteTeacher] approvedTeachers status → invited ✓')

    // Queue activation email
    await sendTeacherInviteEmail({
        to: normalizedEmail,
        schoolName,
        token,
        expiresInHours: INVITE_EXPIRY_HOURS,
    })
    console.log('[validateAndInviteTeacher] Activation email queued ✓')

    return token
}

// ── PART 3 — Teacher Opens Activation Link ────────────────────────────────

/**
 * Verifies that a token exists and has not expired.
 * Returns the token data if valid, null if invalid/expired.
 * Called when teacher lands on /teacher-activate?token=XYZ
 */
export async function verifyInviteToken(token: string): Promise<InviteTokenRecord | null> {
    try {
        console.log('[verifyInviteToken] Verifying token...')
        const tokenSnap = await getDoc(doc(db, 'inviteTokens', token))

        if (!tokenSnap.exists()) {
            console.warn('[verifyInviteToken] Token not found')
            return null
        }

        const data = tokenSnap.data() as InviteTokenRecord

        // Handle both Date and Firestore Timestamp
        const expiresAt = data.expiresAt instanceof Date
            ? data.expiresAt
            : (data.expiresAt as unknown as Timestamp).toDate()

        if (expiresAt < new Date()) {
            console.warn('[verifyInviteToken] Token expired at:', expiresAt)
            return null
        }

        console.log('[verifyInviteToken] Token valid for:', data.email)
        return { ...data, expiresAt }
    } catch (err) {
        console.error('[verifyInviteToken] Error:', err)
        return null
    }
}

/**
 * Activates a teacher account after they set their password:
 *
 * 1. Re-verify token (guards against reuse)
 * 2. Create Firebase Auth user
 * 3. Create users/{uid} top-level profile
 * 4. Create schools/{schoolId}/users/{uid} subcollection doc
 * 5. Update approvedTeachers.status → "activated"
 * 6. Delete inviteTokens/{token} (single-use)
 * 7. Queue welcome email
 */
export async function activateTeacherAccount(params: {
    token: string
    password: string
    schoolName: string
}): Promise<{ uid: string; schoolId: string }> {
    const { token, password, schoolName } = params

    try {
        console.log('[activateTeacherAccount] Starting activation...')

        // 1. Re-verify token
        const tokenSnap = await getDoc(doc(db, 'inviteTokens', token))
        if (!tokenSnap.exists()) throw new Error('INVALID_TOKEN')

        const tokenData = tokenSnap.data() as InviteTokenRecord
        const expiresAt = tokenData.expiresAt instanceof Date
            ? tokenData.expiresAt
            : (tokenData.expiresAt as unknown as Timestamp).toDate()

        if (expiresAt < new Date()) throw new Error('TOKEN_EXPIRED')

        const { email, schoolId, approvedTeacherId } = tokenData
        console.log('[activateTeacherAccount] Activating:', email, 'school:', schoolId)

        // 2. Create Firebase Auth user
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        const { uid } = credential.user
        console.log('[activateTeacherAccount] Auth user created:', uid)

        // 3. Create users/{uid} top-level profile
        const userProfile: UserProfile = {
            schoolId,
            role: 'teacher',
            createdAt: new Date(),
        }
        await setDoc(doc(db, 'users', uid), userProfile)
        console.log('[activateTeacherAccount] users/{uid} written ✓')

        // 4. Create schools/{schoolId}/users/{uid}
        const schoolUserRecord: SchoolUserRecord = {
            uid,
            email,
            role: 'teacher',
            createdAt: new Date(),
            isActive: true,
        }
        await setDoc(doc(db, 'schools', schoolId, 'users', uid), schoolUserRecord)
        console.log('[activateTeacherAccount] schools/{schoolId}/users/{uid} written ✓')

        // 5. Update approvedTeachers → activated
        await updateDoc(doc(db, 'approvedTeachers', approvedTeacherId), {
            status: 'activated',
        })
        console.log('[activateTeacherAccount] approvedTeachers status → activated ✓')

        // 6. Delete inviteTokens/{token} — single-use, prevent reuse
        const { deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(db, 'inviteTokens', token))
        console.log('[activateTeacherAccount] inviteTokens/{token} deleted ✓')

        // 7. Queue welcome email
        await sendTeacherActivatedEmail({ to: email, schoolName })
        console.log('[activateTeacherAccount] Welcome email queued ✓')

        return { uid, schoolId }
    } catch (err) {
        console.error('[activateTeacherAccount] FAILED:', err)
        throw err
    }
}
