import { type User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ============ TYPES ============

export type UserRole = 'admin' | 'teacher'
export type BillingStatus = 'inactive' | 'active' | 'past_due' | 'cancelled'
export type PlanType = 'free' | 'starter' | 'pro' | 'enterprise'

export interface UserProfile {
    id: string
    school_id: string
    email: string
    role: UserRole
    is_active: boolean
    created_at: string
}

export interface SchoolRecord {
    id: string
    name: string
    created_at: string
    plan: PlanType
    billing_status: BillingStatus
    subscription_end_date: string | null
}

export interface PaymentRecord {
    id: string
    school_id: string
    amount: number
    currency: string
    status: 'pending' | 'success' | 'failed'
    provider: string
    transaction_ref: string
    created_at: string
}

export interface UserSchoolInfo {
    schoolId: string
    role: UserRole
    schoolName: string
    plan: PlanType
    billingStatus: BillingStatus
}

// ============ REGISTRATION ============

export async function registerSchoolAdmin(
    schoolName: string,
    email: string,
    password: string,
): Promise<{ user: User; schoolId: string }> {
    try {
        console.log('[registerSchoolAdmin] Creating auth user...')
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        })
        if (authError) throw authError
        if (!authData.user) throw new Error('No user returned from signup')

        const user = authData.user
        console.log('[registerSchoolAdmin] Auth user created:', user.id)

        // Create school document
        const { data: school, error: schoolError } = await supabase
            .from('schools')
            .insert({ name: schoolName.trim() })
            .select()
            .single()

        if (schoolError) throw schoolError
        console.log('[registerSchoolAdmin] School created:', school.id)

        // Create user profile document matching auth user ID
        const { error: profileError } = await supabase
            .from('users')
            .insert({
                id: user.id,
                school_id: school.id,
                email: email.toLowerCase().trim(),
                role: 'admin',
                is_active: true
            })

        if (profileError) throw profileError
        console.log('[registerSchoolAdmin] User profile created ✓')

        return { user, schoolId: school.id }
    } catch (err) {
        console.error('[registerSchoolAdmin] FAILED:', err)
        throw err
    }
}

// ============ LOGIN ============

export async function loginUser(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.user) throw new Error('Login failed')
    return data.user
}

// ============ LOGOUT ============

export async function logoutUser(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
}

// ============ FETCH USER SCHOOL INFO ============

export async function fetchUserSchoolAndRole(uid: string): Promise<UserSchoolInfo | null> {
    try {
        console.log('[fetchUserSchoolAndRole] Fetching users/', uid)

        let userProfile = null
        let profileError = null

        // Race condition mitigation: when signUp is called, onAuthStateChange fires 
        // before the custom profile record is actually saved. Let's retry up to 5 times (2.5 seconds max).
        for (let attempt = 1; attempt <= 5; attempt++) {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', uid)
                .single()

            if (data) {
                userProfile = data
                profileError = null
                break
            } else {
                profileError = error
                // wait 500ms before retrying
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        }

        if (profileError || !userProfile) {
            console.warn('[fetchUserSchoolAndRole] No users row found for:', uid)
            return null
        }

        const { data: schoolData, error: schoolError } = await supabase
            .from('schools')
            .select('*')
            .eq('id', userProfile.school_id)
            .single()

        if (schoolError || !schoolData) {
            console.warn('[fetchUserSchoolAndRole] No school row found for:', userProfile.school_id)
            return null
        }

        return {
            schoolId: schoolData.id,
            role: userProfile.role,
            schoolName: schoolData.name,
            plan: schoolData.plan as PlanType,
            billingStatus: schoolData.billing_status as BillingStatus,
        }
    } catch (err) {
        console.error('[fetchUserSchoolAndRole] Error:', err)
        throw err
    }
}
