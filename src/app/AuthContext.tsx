import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../services/firebase'
import {
    fetchUserSchoolAndRole,
    type UserRole,
    type BillingStatus,
    type PlanType,
} from '../services/auth.service'

// ============ TYPES ============

interface AuthContextValue {
    user:          User | null
    schoolId:      string | null
    role:          UserRole | null
    schoolName:    string | null
    plan:          PlanType | null
    billingStatus: BillingStatus | null
    loading:       boolean
}

// ============ CONTEXT ============

const AuthContext = createContext<AuthContextValue>({
    user:          null,
    schoolId:      null,
    role:          null,
    schoolName:    null,
    plan:          null,
    billingStatus: null,
    loading:       true,
})

// ============ PROVIDER ============

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user,          setUser]          = useState<User | null>(null)
    const [schoolId,      setSchoolId]      = useState<string | null>(null)
    const [role,          setRole]          = useState<UserRole | null>(null)
    const [schoolName,    setSchoolName]    = useState<string | null>(null)
    const [plan,          setPlan]          = useState<PlanType | null>(null)
    const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
    const [loading,       setLoading]       = useState(true)

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                console.log('[AuthContext] User signed in:', firebaseUser.uid)
                try {
                    // Fetch users/{uid} → schoolId → schools/{schoolId}
                    // All before setUser so Header always renders with full data
                    const info = await fetchUserSchoolAndRole(firebaseUser.uid)
                    console.log('[AuthContext] School info fetched:', info)

                    if (info) {
                        setSchoolId(info.schoolId)
                        setRole(info.role)
                        setSchoolName(info.schoolName)
                        setPlan(info.plan)
                        setBillingStatus(info.billingStatus)
                    } else {
                        console.warn('[AuthContext] No school found for uid:', firebaseUser.uid)
                        setSchoolId(null)
                        setRole(null)
                        setSchoolName(null)
                        setPlan(null)
                        setBillingStatus(null)
                    }
                } catch (err) {
                    console.error('[AuthContext] Failed to fetch school info:', err)
                    setSchoolId(null)
                    setRole(null)
                    setSchoolName(null)
                    setPlan(null)
                    setBillingStatus(null)
                } finally {
                    // Set user only after all school data is ready
                    setUser(firebaseUser)
                    setLoading(false)
                }
            } else {
                console.log('[AuthContext] User signed out — clearing state')
                setUser(null)
                setSchoolId(null)
                setRole(null)
                setSchoolName(null)
                setPlan(null)
                setBillingStatus(null)
                setLoading(false)
            }
        })

        return unsubscribe
    }, [])

    return (
        <AuthContext.Provider value={{
            user, schoolId, role, schoolName, plan, billingStatus, loading,
        }}>
            {children}
        </AuthContext.Provider>
    )
}

// ============ HOOK ============

export function useAuth(): AuthContextValue {
    return useContext(AuthContext)
}
