import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import en from './translations/en'
import es from './translations/es'

const translations = { en, es }

const STORAGE_KEY = 'qivori_lang'

/**
 * Detect the user's preferred language.
 * Priority: localStorage > browser navigator.language > 'en'
 */
export function detectLanguage() {
  // Check localStorage first
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && translations[stored]) return stored
  } catch {}

  // Check browser language
  try {
    const browserLang = (navigator.language || navigator.userLanguage || '').split('-')[0].toLowerCase()
    if (translations[browserLang]) return browserLang
  } catch {}

  return 'en'
}

const LanguageContext = createContext(null)

/**
 * LanguageProvider — wraps the app and provides language state + t() function.
 */
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(detectLanguage)

  const setLanguage = useCallback((lang) => {
    const validLang = translations[lang] ? lang : 'en'
    setLanguageState(validLang)
    try { localStorage.setItem(STORAGE_KEY, validLang) } catch {}
  }, [])

  // Persist on mount if detected lang differs from stored
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, language) } catch {}
  }, [language])

  /**
   * Translation function.
   * - Looks up key in current language translations
   * - Falls back to English if key not found in current language
   * - Returns the key itself if not found anywhere (safe fallback)
   * - Supports simple interpolation: t('key', { count: 5 }) replaces {count}
   */
  const t = useCallback((key, params) => {
    let text = translations[language]?.[key] || translations.en?.[key] || key
    if (params) {
      Object.keys(params).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k])
      })
    }
    return text
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

/**
 * useTranslation() — returns { t, language, setLanguage }
 */
export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    // Fallback if used outside provider — return English passthrough
    return {
      t: (key, params) => {
        let text = translations.en?.[key] || key
        if (params) {
          Object.keys(params).forEach(k => {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k])
          })
        }
        return text
      },
      language: 'en',
      setLanguage: () => {},
    }
  }
  return ctx
}

/**
 * LanguageToggle — compact EN/ES toggle component.
 * Props:
 *   style — optional style overrides for the container
 *   variant — 'pill' (default) or 'text'
 */
export function LanguageToggle({ style = {}, variant = 'pill' }) {
  const { language, setLanguage } = useTranslation()

  if (variant === 'text') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, ...style }}>
        <span
          onClick={() => setLanguage('en')}
          style={{
            cursor: 'pointer',
            color: language === 'en' ? 'var(--accent)' : 'var(--muted)',
            transition: 'color 0.2s',
          }}
        >EN</span>
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>|</span>
        <span
          onClick={() => setLanguage('es')}
          style={{
            cursor: 'pointer',
            color: language === 'es' ? 'var(--accent)' : 'var(--muted)',
            transition: 'color 0.2s',
          }}
        >ES</span>
      </div>
    )
  }

  // Default: pill toggle with globe icon
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 2, fontSize: 11, fontWeight: 600,
      ...style,
    }}>
      <button
        onClick={() => setLanguage('en')}
        style={{
          padding: '4px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
          background: language === 'en' ? 'var(--accent)' : 'transparent',
          color: language === 'en' ? '#000' : 'var(--muted)',
          transition: 'all 0.15s',
        }}
      >EN</button>
      <button
        onClick={() => setLanguage('es')}
        style={{
          padding: '4px 10px', border: 'none', borderRadius: 6, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
          background: language === 'es' ? 'var(--accent)' : 'transparent',
          color: language === 'es' ? '#000' : 'var(--muted)',
          transition: 'all 0.15s',
        }}
      >ES</button>
    </div>
  )
}
