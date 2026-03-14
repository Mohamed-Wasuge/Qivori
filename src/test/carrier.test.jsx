import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mock Sentry
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
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
        }),
      }),
    }),
  },
}))

// Mock database module
vi.mock('../lib/database', () => ({
  fetchLoads: vi.fn().mockResolvedValue([]),
  fetchInvoices: vi.fn().mockResolvedValue([]),
  fetchExpenses: vi.fn().mockResolvedValue([]),
  fetchCompany: vi.fn().mockResolvedValue(null),
  fetchDrivers: vi.fn().mockResolvedValue([]),
  fetchVehicles: vi.fn().mockResolvedValue([]),
  createLoad: vi.fn().mockResolvedValue({ id: '1', load_id: 'QV-1001' }),
  createInvoice: vi.fn().mockResolvedValue({ id: '1' }),
  createExpense: vi.fn().mockResolvedValue({ id: '1' }),
  createDriver: vi.fn().mockResolvedValue({ id: '1', full_name: 'Test Driver' }),
  createVehicle: vi.fn().mockResolvedValue({ id: '1' }),
  updateLoad: vi.fn().mockResolvedValue({}),
  deleteLoad: vi.fn().mockResolvedValue({}),
}))

// Mock PDF generator
vi.mock('../utils/generatePDF', () => ({
  generateInvoicePDF: vi.fn(),
}))

import { AppProvider } from '../context/AppContext'
import { CarrierProvider } from '../context/CarrierContext'
import {
  CarrierDashboard, SmartDispatch, CarrierFleet,
  FuelOptimizer, BrokerRiskIntel, DriverProfiles,
  DriverSettlement, FleetMap, LaneIntel,
  ExpenseTracker, BrokerDirectory, FleetManager,
} from '../pages/CarrierPages'

const Wrapper = ({ children }) => (
  <AppProvider>
    <CarrierProvider>
      {children}
    </CarrierProvider>
  </AppProvider>
)

// ─── CARRIER DASHBOARD ──────────────────────────────────────

describe('CarrierDashboard', () => {
  it('renders without crashing', async () => {
    const { container } = render(<CarrierDashboard />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(50)
    })
  })
})

// ─── DRIVER PROFILES (was crashing with .avatar error) ──────

describe('DriverProfiles', () => {
  it('renders without crashing when no drivers exist', async () => {
    const { container } = render(<DriverProfiles />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
      expect(container.innerHTML.length).toBeGreaterThan(10)
    })
  })

  it('shows empty state or driver list', async () => {
    render(<DriverProfiles />, { wrapper: Wrapper })
    await waitFor(() => {
      // Should show either "No drivers" or "DRIVERS" header
      const text = document.body.textContent
      expect(text.includes('driver') || text.includes('Driver') || text.includes('DRIVER')).toBe(true)
    })
  })
})

// ─── DRIVER SETTLEMENT ──────────────────────────────────────

describe('DriverSettlement', () => {
  it('renders without crashing when no drivers exist', async () => {
    const { container } = render(<DriverSettlement />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})

// ─── SMART DISPATCH ─────────────────────────────────────────

describe('SmartDispatch', () => {
  it('renders without crashing', async () => {
    const { container } = render(<SmartDispatch />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(50)
    })
  })
})

// ─── FLEET ──────────────────────────────────────────────────

describe('CarrierFleet', () => {
  it('renders without crashing', async () => {
    const { container } = render(<CarrierFleet />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})

describe('FleetManager', () => {
  it('renders without crashing', async () => {
    const { container } = render(<FleetManager />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})

// ─── FUEL OPTIMIZER ─────────────────────────────────────────

describe('FuelOptimizer', () => {
  it('renders without crashing', async () => {
    const { container } = render(<FuelOptimizer />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})

// ─── BROKER RISK INTEL ──────────────────────────────────────

describe('BrokerRiskIntel', () => {
  it('renders without crashing', async () => {
    const { container } = render(<BrokerRiskIntel />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})

// ─── LANE INTEL ─────────────────────────────────────────────

describe('LaneIntel', () => {
  it('renders without crashing', async () => {
    const { container } = render(<LaneIntel />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})

// ─── EXPENSE TRACKER ────────────────────────────────────────

describe('ExpenseTracker', () => {
  it('renders without crashing', async () => {
    const { container } = render(<ExpenseTracker />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})

// ─── BROKER DIRECTORY ───────────────────────────────────────

describe('BrokerDirectory', () => {
  it('renders without crashing', async () => {
    const { container } = render(<BrokerDirectory />, { wrapper: Wrapper })
    await waitFor(() => {
      expect(container).toBeTruthy()
    })
  })
})
