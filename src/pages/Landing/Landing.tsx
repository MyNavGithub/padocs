import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { FileText, Zap, Globe, ArrowRight, CheckCircle } from 'lucide-react'

export default function Landing() {
    const { t, i18n } = useTranslation()
    const otherLang = i18n.language?.startsWith('fr') ? 'en' : 'fr'

    const features = [
        {
            icon: <FileText size={24} />,
            title: t('landing.feature1Title'),
            desc: t('landing.feature1Desc'),
        },
        {
            icon: <Zap size={24} />,
            title: t('landing.feature2Title'),
            desc: t('landing.feature2Desc'),
        },
        {
            icon: <Globe size={24} />,
            title: t('landing.feature3Title'),
            desc: t('landing.feature3Desc'),
        },
    ]

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
            {/* Nav */}
            <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto w-full">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">PA</span>
                    </div>
                    <span className="font-bold text-gray-900 dark:text-white text-lg">PADocs</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => i18n.changeLanguage(otherLang)}
                        className="btn-ghost text-xs uppercase font-bold"
                    >
                        <Globe size={14} />
                        {otherLang}
                    </button>
                    <Link to="/auth" className="btn-secondary text-sm hidden sm:inline-flex">
                        {t('auth.login')}
                    </Link>
                    <Link to="/auth?register=true" className="btn-primary text-sm">
                        {t('landing.getStarted')}
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 max-w-4xl mx-auto w-full">
                <div className="badge badge-primary mb-6">
                    ✦ {t('landing.newbadge')} v1.0
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white leading-tight mb-6">
                    {t('landing.hero').split('\n').map((line, i) => (
                        <span key={i} className={i === 1 ? 'text-indigo-600 block' : 'block'}>
                            {line}
                        </span>
                    ))}
                </h1>
                <p className="text-lg text-gray-500 dark:text-slate-400 max-w-2xl mb-10 leading-relaxed">
                    {t('landing.heroSubtitle')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link to="/dashboard" className="btn-primary px-6 py-3 text-base">
                        {t('landing.getStarted')}
                        <ArrowRight size={18} />
                    </Link>
                    <Link to="/auth" className="btn-secondary px-6 py-3 text-base">
                        {t('auth.login')}
                    </Link>
                </div>

                {/* Trust badges */}
                <div className="flex flex-wrap items-center justify-center gap-4 mt-10 text-sm text-gray-400">
                    {[t('landing.pwa'), t('landing.bilingual'), t('landing.wcag'), t('landing.offline')].map(tx => (
                        <span key={tx} className="flex items-center gap-1">
                            <CheckCircle size={14} className="text-emerald-500" />
                            {tx}
                        </span>
                    ))}
                </div>
            </section>

            {/* Features */}
            <section className="py-16 px-6 bg-gray-50 dark:bg-slate-900">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-10">
                        {t('landing.keyFeatures')}
                    </h2>
                    <div className="grid sm:grid-cols-3 gap-6">
                        {features.map((f) => (
                            <div key={f.title} className="card p-6 hover:shadow-md transition-shadow">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                                    {f.icon}
                                </div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                                <p className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-16 px-6">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                        {t('landing.ctaTitle')}
                    </h2>
                    <p className="text-gray-500 dark:text-slate-400 mb-6">{t('landing.ctaSubtitle')}</p>
                    <Link to="/dashboard" className="btn-primary px-8 py-3 text-base">
                        {t('landing.ctaButton')}
                        <ArrowRight size={18} />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-6 px-6 border-t border-gray-100 dark:border-slate-800 text-center text-xs text-gray-400">
                {t('landing.footer')}
            </footer>
        </div>
    )
}
