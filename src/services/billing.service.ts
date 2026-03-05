/**
 * Billing Service — Placeholder
 *
 * This service will integrate with a payment gateway (Paystack, Flutterwave, etc.)
 * when billing is activated. For now it provides the data types and stub functions
 * so the rest of the app can reference them without breaking.
 *
 * To wire up Paystack later:
 * 1. Add VITE_PAYSTACK_PUBLIC_KEY to .env.local
 * 2. Replace initializePayment() stub with real Paystack inline popup
 * 3. Create a Cloud Function to verify webhook and update school plan
 */

export type PlanId = 'free' | 'starter' | 'pro' | 'enterprise'

export interface Plan {
    id: PlanId
    name: string
    price: number            // monthly price in XOF (FCFA) or NGN
    currency: string
    maxTeachers: number
    maxTemplates: number
    maxDocumentsPerMonth: number
    features: string[]
}

export const PLANS: Plan[] = [
    {
        id: 'free',
        name: 'Gratuit',
        price: 0,
        currency: 'XOF',
        maxTeachers: 3,
        maxTemplates: 5,
        maxDocumentsPerMonth: 50,
        features: [
            '3 enseignants',
            '5 modèles',
            '50 documents/mois',
            'Support email',
        ],
    },
    {
        id: 'starter',
        name: 'Débutant',
        price: 15000,
        currency: 'XOF',
        maxTeachers: 15,
        maxTemplates: 20,
        maxDocumentsPerMonth: 500,
        features: [
            '15 enseignants',
            '20 modèles',
            '500 documents/mois',
            'Export PDF',
            'Support prioritaire',
        ],
    },
    {
        id: 'pro',
        name: 'Professionnel',
        price: 35000,
        currency: 'XOF',
        maxTeachers: 100,
        maxTemplates: 100,
        maxDocumentsPerMonth: 5000,
        features: [
            'Enseignants illimités',
            'Modèles illimités',
            '5 000 documents/mois',
            'Export PDF + DOCX',
            'Support dédié',
            'Tableau de bord analytique',
        ],
    },
    {
        id: 'enterprise',
        name: 'Entreprise',
        price: 0, // custom pricing
        currency: 'XOF',
        maxTeachers: Infinity,
        maxTemplates: Infinity,
        maxDocumentsPerMonth: Infinity,
        features: [
            'Multi-établissements',
            'Intégration personnalisée',
            'SLA garanti',
            'Gestionnaire de compte dédié',
        ],
    },
]

export function getPlan(planId: PlanId): Plan {
    return PLANS.find((p) => p.id === planId) ?? PLANS[0]
}

/**
 * Placeholder: initiates a payment flow.
 * Replace with real Paystack/Flutterwave integration.
 */
export async function initializePayment(_params: {
    schoolId: string
    planId: PlanId
    email: string
    amount: number
}): Promise<void> {
    console.warn('[BillingService] Payment gateway not yet integrated.')
    throw new Error('BILLING_NOT_CONFIGURED')
}
