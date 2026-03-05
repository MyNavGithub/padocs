/** App-wide TypeScript interfaces */

export type Language = 'en' | 'fr'
export type Theme = 'light' | 'dark' | 'system'

export interface User {
    id: string
    name: string
    email: string
    role: 'admin' | 'user'
    avatarUrl?: string
    initials: string
}

export interface Organization {
    id: string
    name: string
    logoUrl?: string
}

export interface Template {
    id: string
    name: string
    description: string
    status: 'active' | 'draft' | 'archived'
    category: string
    lastModified: string
    usedCount: number
    fileType: 'docx' | 'pdf'
}

export interface Document {
    id: string
    name: string
    templateId: string
    templateName: string
    generatedAt: string
    generatedBy: string
    status: 'ready' | 'processing' | 'error'
    fileUrl?: string
}

export interface ActivityItem {
    id: string
    action: string
    user: string
    target: string
    timestamp: string
    type: 'template' | 'document' | 'user' | 'settings'
}

export interface NavItem {
    label: string
    path: string
    icon: string
    badge?: number
}

export interface DashboardStats {
    totalTemplates: number
    docsGenerated: number
    activeUsers: number
    totalTemplatesChange: number
    docsGeneratedChange: number
}
