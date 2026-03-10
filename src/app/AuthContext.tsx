import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react'
import { type User } from '@supabase/supabase-js'
import { supabase } from '../services/supabase'
import {
    fetchUserSchoolAndRole,
    type UserRole,
    type BillingStatus,
    type PlanType,
} from '../services/auth.service'

// ============ TYPES ============

interface AuthContextValue {
    user: User | null
    schoolId: string | null
    role: UserRole | null
    schoolName: string | null
    plan: PlanType | null
    billingStatus: BillingStatus | null
    loading: boolean
}

// ============ CONTEXT ============

const AuthContext = createContext<AuthContextValue>({
    user: null,
    schoolId: null,
    role: null,
    schoolName: null,
    plan: null,
    billingStatus: null,
    loading: true,
})

// ============ PROVIDER ============

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [schoolId, setSchoolId] = useState<string | null>(null)
    const [role, setRole] = useState<UserRole | null>(null)
    const [schoolName, setSchoolName] = useState<string | null>(null)
    const [plan, setPlan] = useState<PlanType | null>(null)
    const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const handleUserChange = async (supabaseUser: User | null) => {
            if (supabaseUser) {
                console.log('[AuthContext] User signed in:', supabaseUser.id)
                try {
                    const info = await fetchUserSchoolAndRole(supabaseUser.id)
                    console.log('[AuthContext] School info fetched:', info)

                    if (info) {
                        setSchoolId(info.schoolId)
                        setRole(info.role)
                        setSchoolName(info.schoolName)
                        setPlan(info.plan)
                        setBillingStatus(info.billingStatus)
                    } else {
                        console.warn('[AuthContext] No school found for id:', supabaseUser.id)
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
                    setUser(supabaseUser)
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
        }

        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            handleUserChange(session?.user || null)
        })

        // 2. Listen to state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                handleUserChange(session?.user || null)
            }
        )

        return () => {
            subscription.unsubscribe()
        }
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
