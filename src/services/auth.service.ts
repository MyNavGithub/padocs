import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    type User,
} from 'firebase/auth'
import {
    doc,
    setDoc,
    getDoc,
    collection,
} from 'firebase/firestore'
import { auth, db } from './firebase'

// ============ TYPES ============

export type UserRole = 'admin' | 'teacher'
export type BillingStatus = 'inactive' | 'active' | 'past_due' | 'cancelled'
export type PlanType = 'free' | 'starter' | 'pro' | 'enterprise'

/** Top-level users/{uid} document */
export interface UserProfile {
    schoolId: string
    role: UserRole
    createdAt: Date
}

/** schools/{schoolId} document */
export interface SchoolRecord {
    name: string
    createdAt: Date
    plan: PlanType
    billingStatus: BillingStatus
    subscriptionEndDate: Date | null
}

/** schools/{schoolId}/users/{userId} subcollection document */
export interface SchoolUserRecord {
    uid: string
    email: string
    role: UserRole
    createdAt: Date
    isActive: boolean
}

/** Payment-agnostic payment record — supports Paystack, Flutterwave, etc. */
export interface PaymentRecord {
    schoolId: string
    amount: number
    currency: string
    status: 'pending' | 'success' | 'failed'
    provider: string       // e.g. 'paystack', 'flutterwave', 'manual'
    transactionRef: string
    createdAt: Date
}

/** Returned from fetchUserSchoolAndRole */
export interface UserSchoolInfo {
    schoolId: string
    role: UserRole
    schoolName: string
    plan: PlanType
    billingStatus: BillingStatus
}

// ============ REGISTRATION ============

/**
 * Registers a new school admin with proper multi-tenant structure:
 *
 * 1. Create Firebase Auth user
 * 2. Generate random schoolId via Firestore auto-ID
 * 3. Create schools/{schoolId}  — with billing fields
 * 4. Create schools/{schoolId}/users/{uid}  — school subcollection
 * 5. Create users/{uid}  — top-level profile (used for fast auth lookups + rules)
 *
 * schoolId is now INDEPENDENT of uid — supports multiple admins per school.
 */
export async function registerSchoolAdmin(
    schoolName: string,
    email: string,
    password: string,
): Promise<{ user: User; schoolId: string }> {
    try {
        // 1. Create Firebase Auth user
        console.log('[registerSchoolAdmin] Creating auth user...')
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        const { uid } = credential.user
        console.log('[registerSchoolAdmin] Auth user created:', uid)

        // 2. Generate random schoolId (NOT tied to uid)
        const schoolRef = doc(collection(db, 'schools'))
        const schoolId = schoolRef.id
        console.log('[registerSchoolAdmin] Generated schoolId:', schoolId)

        // 3. Create school document
        const schoolData: SchoolRecord = {
            name: schoolName.trim(),
            createdAt: new Date(),
            plan: 'free',
            billingStatus: 'inactive',
            subscriptionEndDate: null,
        }
        console.log('[registerSchoolAdmin] Writing schools/{schoolId}:', schoolData)
        await setDoc(schoolRef, schoolData)
        console.log('[registerSchoolAdmin] schools/{schoolId} written ✓')

        // 4. Create schools/{schoolId}/users/{uid} subcollection
        const schoolUserData: SchoolUserRecord = {
            uid,
            email: email.toLowerCase().trim(),
            role: 'admin',
            createdAt: new Date(),
            isActive: true,
        }
        console.log('[registerSchoolAdmin] Writing schools/{schoolId}/users/{uid}:', schoolUserData)
        await setDoc(doc(db, 'schools', schoolId, 'users', uid), schoolUserData)
        console.log('[registerSchoolAdmin] schools/{schoolId}/users/{uid} written ✓')

        // 5. Create top-level users/{uid} — used by AuthContext + security rules
        const userProfileData: UserProfile = {
            schoolId,
            role: 'admin',
            createdAt: new Date(),
        }
        console.log('[registerSchoolAdmin] Writing users/{uid}:', userProfileData)
        await setDoc(doc(db, 'users', uid), userProfileData)
        console.log('[registerSchoolAdmin] users/{uid} written ✓')

        return { user: credential.user, schoolId }
    } catch (err) {
        console.error('[registerSchoolAdmin] FAILED:', err)
        throw err
    }
}

// ============ LOGIN ============

export async function loginUser(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return credential.user
}

// ============ LOGOUT ============

export async function logoutUser(): Promise<void> {
    await signOut(auth)
}

// ============ FETCH USER SCHOOL INFO ============

/**
 * Multi-tenant lookup:
 * 1. Fetch users/{uid}  → get schoolId + role
 * 2. Fetch schools/{schoolId}  → get name + plan + billingStatus
 *
 * This supports multiple admins per school and future teacher accounts
 * because schoolId is stored in the top-level users doc, not derived from uid.
 */
export async function fetchUserSchoolAndRole(uid: string): Promise<UserSchoolInfo | null> {
    try {
        console.log('[fetchUserSchoolAndRole] Fetching users/', uid)

        // Step 1: Get the user's profile to find their schoolId
        const userSnap = await getDoc(doc(db, 'users', uid))

        if (!userSnap.exists()) {
            console.warn('[fetchUserSchoolAndRole] No users/{uid} document found for:', uid)
            return null
        }

        const userProfile = userSnap.data() as UserProfile
        const { schoolId, role } = userProfile
        console.log('[fetchUserSchoolAndRole] Found schoolId:', schoolId, 'role:', role)

        // Step 2: Get the school document for name + billing info
        const schoolSnap = await getDoc(doc(db, 'schools', schoolId))

        if (!schoolSnap.exists()) {
            console.warn('[fetchUserSchoolAndRole] No schools/{schoolId} found for:', schoolId)
            return null
        }

        const schoolData = schoolSnap.data() as SchoolRecord
        console.log('[fetchUserSchoolAndRole] School found:', schoolData.name)

        return {
            schoolId,
            role,
            schoolName: schoolData.name,
            plan: schoolData.plan,
            billingStatus: schoolData.billingStatus,
        }
    } catch (err) {
        console.error('[fetchUserSchoolAndRole] Error:', err)
        throw err
    }
}
