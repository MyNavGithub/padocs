import { supabase } from './supabase'

// ── Constants ─────────────────────────────────────────────────────────────

const INVITE_EXPIRY_HOURS = 72  // token valid for 72 hours

// ── Types ─────────────────────────────────────────────────────────────────

export type ApprovedTeacherStatus = 'unused' | 'invited' | 'activated'

export interface ApprovedTeacher {
    id?: string
    schoolId: string
    email: string
    status: ApprovedTeacherStatus
    inviteToken: string | null
    inviteExpiresAt: Date | null
    uploadedAt: Date
}

export interface InviteTokenRecord {
    token?: string
    approvedTeacherId: string
    schoolId: string
    email: string
    expiresAt: Date
}

// ── PART 1 — Admin: Upload Approved Teachers ──────────────────────────────

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
            const { data: existing, error: queryError } = await supabase
                .from('approved_teachers')
                .select('id')
                .eq('school_id', schoolId)
                .eq('email', email)

            if (queryError) throw queryError

            if (existing && existing.length > 0) {
                console.log('[uploadApprovedTeachers] Skipping duplicate:', email)
                skipped++
                continue
            }

            const { error: insertError } = await supabase
                .from('approved_teachers')
                .insert({
                    school_id: schoolId,
                    email,
                    status: 'unused',
                    invite_token: null,
                    invite_expires_at: null,
                })

            if (insertError) throw insertError

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

export async function validateAndInviteTeacher(
    email: string,
    schoolId: string,
    _schoolName: string,
): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim()
    console.log('[validateAndInviteTeacher] Checking email:', normalizedEmail, 'for school:', schoolId)

    const { data: approvedRecords, error: queryError } = await supabase
        .from('approved_teachers')
        .select('*')
        .eq('school_id', schoolId)
        .eq('email', normalizedEmail)

    if (queryError) throw queryError

    if (!approvedRecords || approvedRecords.length === 0) {
        console.warn('[validateAndInviteTeacher] Email NOT on approved list:', normalizedEmail)
        throw new Error('TEACHER_NOT_APPROVED')
    }

    const approvedData = approvedRecords[0]

    if (approvedData.status === 'activated') {
        throw new Error('TEACHER_ALREADY_ACTIVATED')
    }

    if (approvedData.status === 'invited') {
        throw new Error('TEACHER_ALREADY_INVITED')
    }

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000)

    console.log('[validateAndInviteTeacher] Generated token for:', normalizedEmail)

    const { error: tokenError } = await supabase
        .from('invite_tokens')
        .insert({
            token,
            approved_teacher_id: approvedData.id,
            school_id: schoolId,
            email: normalizedEmail,
            expires_at: expiresAt.toISOString(),
        })

    if (tokenError) throw tokenError
    console.log('[validateAndInviteTeacher] invite_tokens written ✓')

    const { error: updateError } = await supabase
        .from('approved_teachers')
        .update({
            status: 'invited',
            invite_token: token,
            invite_expires_at: expiresAt.toISOString(),
        })
        .eq('id', approvedData.id)

    if (updateError) throw updateError
    console.log('[validateAndInviteTeacher] approved_teachers status → invited ✓')

    return token
}

// ── PART 3 — Teacher Opens Activation Link ────────────────────────────────

export async function verifyInviteToken(token: string): Promise<InviteTokenRecord | null> {
    try {
        console.log('[verifyInviteToken] Verifying token...')

        const { data, error } = await supabase
            .from('invite_tokens')
            .select('*')
            .eq('token', token)
            .single()

        if (error || !data) {
            console.warn('[verifyInviteToken] Token not found')
            return null
        }

        const expiresAt = new Date(data.expires_at)

        if (expiresAt < new Date()) {
            console.warn('[verifyInviteToken] Token expired at:', expiresAt)
            return null
        }

        console.log('[verifyInviteToken] Token valid for:', data.email)
        return {
            token: data.token,
            approvedTeacherId: data.approved_teacher_id,
            schoolId: data.school_id,
            email: data.email,
            expiresAt
        }
    } catch (err) {
        console.error('[verifyInviteToken] Error:', err)
        return null
    }
}

export async function activateTeacherAccount(params: {
    token: string
    password: string
    schoolName: string
}): Promise<{ uid: string; schoolId: string }> {
    const { token, password, schoolName: _schoolName } = params

    try {
        console.log('[activateTeacherAccount] Starting activation...')

        const { data: tokenData, error: tokenError } = await supabase
            .from('invite_tokens')
            .select('*')
            .eq('token', token)
            .single()

        if (tokenError || !tokenData) throw new Error('INVALID_TOKEN')

        const expiresAt = new Date(tokenData.expires_at)
        if (expiresAt < new Date()) throw new Error('TOKEN_EXPIRED')

        const { email, school_id: schoolId, approved_teacher_id: approvedTeacherId } = tokenData
        console.log('[activateTeacherAccount] Activating:', email, 'school:', schoolId)

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        })
        if (authError) throw authError
        if (!authData.user) throw new Error('User creation failed')

        const uid = authData.user.id
        console.log('[activateTeacherAccount] Auth user created:', uid)

        const { error: profileError } = await supabase
            .from('users')
            .insert({
                id: uid,
                school_id: schoolId,
                email: email,
                role: 'teacher',
                is_active: true
            })

        if (profileError) throw profileError
        console.log('[activateTeacherAccount] users profile written ✓')

        const { error: updateError } = await supabase
            .from('approved_teachers')
            .update({ status: 'activated' })
            .eq('id', approvedTeacherId)

        if (updateError) throw updateError
        console.log('[activateTeacherAccount] approved_teachers status → activated ✓')

        const { error: deleteError } = await supabase
            .from('invite_tokens')
            .delete()
            .eq('token', token)

        if (deleteError) throw deleteError
        console.log('[activateTeacherAccount] invite_tokens deleted ✓')

        return { uid, schoolId }
    } catch (err) {
        console.error('[activateTeacherAccount] FAILED:', err)
        throw err
    }
}

// ── PART 4 — Generic Link Activation (Option 3 Workplace) ────────────────────────

export async function activateTeacherWithGenericLink(params: {
    schoolId: string
    email: string
    password: string
}): Promise<{ uid: string; schoolId: string }> {
    const { schoolId, email, password } = params
    const normalizedEmail = email.toLowerCase().trim()

    try {
        console.log('[activateTeacherWithGenericLink] Started for:', normalizedEmail)

        const { data: approvedRecords, error: queryError } = await supabase
            .from('approved_teachers')
            .select('*')
            .eq('school_id', schoolId)
            .eq('email', normalizedEmail)

        if (queryError) throw queryError

        if (!approvedRecords || approvedRecords.length === 0) {
            console.warn('[activateTeacher] Rejection: Not on approved list.')
            throw new Error('NOT_APPROVED')
        }

        const approvedData = approvedRecords[0]

        if (approvedData.status === 'activated') {
            console.warn('[activateTeacher] Rejection: Already activated.')
            throw new Error('ALREADY_ACTIVATED')
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
        })
        if (authError) throw authError
        if (!authData.user) throw new Error('Auth creation failed')

        const uid = authData.user.id
        console.log('[activateTeacher] Auth User Created:', uid)

        const { error: profileError } = await supabase
            .from('users')
            .insert({
                id: uid,
                school_id: schoolId,
                email: normalizedEmail,
                role: 'teacher',
                is_active: true
            })

        if (profileError) throw profileError

        const { error: updateError } = await supabase
            .from('approved_teachers')
            .update({ status: 'activated' })
            .eq('id', approvedData.id)

        if (updateError) throw updateError

        if (approvedData.invite_token) {
            try {
                await supabase.from('invite_tokens').delete().eq('token', approvedData.invite_token)
            } catch (cleanupErr) {
                console.warn("Failed to cleanup token, ignoring", cleanupErr)
            }
        }

        console.log('[activateTeacher] Account successfully bound to school:', schoolId)
        return { uid, schoolId }

    } catch (err) {
        console.error('[activateTeacherWithGenericLink] Failed:', err)
        throw err
    }
}
