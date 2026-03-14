import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock Sentry before any imports
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(),
  replayIntegration: vi.fn(),
}))

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({ data: [], error: null }),
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        count: vi.fn().mockReturnValue({ count: 0 }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
        }),
      }),
    }),
  },
}))

import App from '../App'
import { AppProvider } from '../context/AppContext'
import LoginPage from '../pages/LoginPage'

// ─── APP RENDERING ──────────────────────────────────────────

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />)
    expect(container).toBeTruthy()
  })

  it('shows landing page content by default', async () => {
    render(<App />)
    await waitFor(() => {
      // Landing page should have substantial content
      expect(document.body.textContent.length).toBeGreaterThan(100)
    })
  })

  it('does not show blank screen', () => {
    const { container } = render(<App />)
    expect(container.innerHTML).not.toBe('')
    expect(container.innerHTML.length).toBeGreaterThan(100)
  })
})

// ─── LOGIN PAGE ─────────────────────────────────────────────

describe('LoginPage', () => {
  it('renders login form with email and password fields', async () => {
    render(
      <AppProvider>
        <LoginPage />
      </AppProvider>
    )
    await waitFor(() => {
      const inputs = document.querySelectorAll('input')
      const hasEmail = Array.from(inputs).some(i => i.type === 'email')
      const hasPassword = Array.from(inputs).some(i => i.type === 'password')
      expect(hasEmail).toBe(true)
      expect(hasPassword).toBe(true)
    })
  })

  it('renders sign in button', async () => {
    render(
      <AppProvider>
        <LoginPage />
      </AppProvider>
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Sign In')
    })
  })

  it('accepts email input', async () => {
    render(
      <AppProvider>
        <LoginPage />
      </AppProvider>
    )
    await waitFor(() => {
      const emailInput = document.querySelector('input[type="email"]')
      expect(emailInput).toBeTruthy()
      fireEvent.change(emailInput, { target: { value: 'test@test.com' } })
      expect(emailInput.value).toBe('test@test.com')
    })
  })

  it('accepts password input', async () => {
    render(
      <AppProvider>
        <LoginPage />
      </AppProvider>
    )
    await waitFor(() => {
      const passwordInput = document.querySelector('input[type="password"]')
      expect(passwordInput).toBeTruthy()
      fireEvent.change(passwordInput, { target: { value: 'password123' } })
      expect(passwordInput.value).toBe('password123')
    })
  })
})

// ─── NAVIGATION ─────────────────────────────────────────────

describe('Navigation', () => {
  it('AppProvider renders children', () => {
    render(
      <AppProvider>
        <div data-testid="child">Hello</div>
      </AppProvider>
    )
    expect(screen.getByTestId('child')).toBeTruthy()
  })
})
