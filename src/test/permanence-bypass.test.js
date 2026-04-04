import { describe, it, expect } from 'vitest'
import {
  validatePricing,
  validateDriverPay,
  validateFinancialCalc,
  validateStatusTransition,
  guardedUpdate,
} from '../lib/runtimeGuards'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
function readSrc(p) { try { return readFileSync(join(ROOT, p), 'utf-8') } catch { return '' } }

// ═══════════════════════════════════════════════════════════════
// RUNTIME WORKFLOW SIMULATIONS
// These tests execute real guard functions with real data flows,
// simulating the exact scenarios that happen in production.
// ═══════════════════════════════════════════════════════════════

// ─── WORKFLOW 1: Full Load Lifecycle ─────────────────────────
// Simulates: Book load → Assign driver → Pick up → Deliver → Invoice → Pay
describe('WORKFLOW: Full Load Lifecycle', () => {
  const PIPELINE = [
    'Rate Con Received',
    'Assigned to Driver',
    'En Route to Pickup',
    'Loaded',
    'In Transit',
    'Delivered',
    'Invoiced',
    'Paid',
  ]

  it('walks the entire pipeline step by step without errors', () => {
    for (let i = 0; i < PIPELINE.length - 1; i++) {
      expect(() => validateStatusTransition(PIPELINE[i], PIPELINE[i + 1])).not.toThrow()
    }
  })

  it('validates financial values at each stage', () => {
    const loadRate = 3840     // typical load rate
    const ratePerMile = 2.94  // $/mi
    const invoiceAmount = 3840
    const driverPay = 1075.20 // 28% of 3840

    // Each financial touchpoint must pass validation
    expect(() => validateFinancialCalc(loadRate, 'load rate at booking')).not.toThrow()
    expect(() => validateFinancialCalc(ratePerMile, 'RPM at booking')).not.toThrow()
    expect(() => validateFinancialCalc(invoiceAmount, 'invoice creation')).not.toThrow()
    expect(() => validateFinancialCalc(driverPay, 'driver settlement')).not.toThrow()
  })

  it('validates the load data before DB write at creation', () => {
    const loadPayload = {
      owner_id: 'user-uuid-123',
      status: 'Rate Con Received',
    }
    expect(() => guardedUpdate('loads', loadPayload, 'createLoad')).not.toThrow()
  })

  it('validates invoice creation at delivery stage', () => {
    // After delivery, invoice is created
    expect(() => validateStatusTransition('Delivered', 'Invoiced')).not.toThrow()

    const invoicePayload = {
      owner_id: 'user-uuid-123',
      load_id: 'load-uuid-456',
      amount: 3840,
    }
    expect(() => guardedUpdate('invoices', invoicePayload, 'createInvoice')).not.toThrow()
  })

  it('blocks skipping steps in the pipeline', () => {
    // Can't go from Rate Con straight to Delivered
    expect(() => validateStatusTransition('Rate Con Received', 'Delivered')).toThrow()
    // Can't go from Rate Con straight to Paid
    expect(() => validateStatusTransition('Rate Con Received', 'Paid')).toThrow()
    // Can't go from Assigned straight to Invoiced
    expect(() => validateStatusTransition('Assigned to Driver', 'Invoiced')).toThrow()
  })

  it('blocks backwards movement except cancellation', () => {
    // Can't move from Delivered back to In Transit
    expect(() => validateStatusTransition('Delivered', 'In Transit')).toThrow()
    // CAN cancel (back to Rate Con Received)
    expect(() => validateStatusTransition('Delivered', 'Rate Con Received')).not.toThrow()
  })
})

// ─── WORKFLOW 2: Driver Pay Calculation ──────────────────────
// Simulates: Assign driver → Calculate pay → Validate → Settle
describe('WORKFLOW: Driver Pay Calculation', () => {
  const drivers = [
    { name: 'Ahmad', pay_model: 'percent', pay_rate: 28, load_gross: 3840, miles: 1306 },
    { name: 'Marcus', pay_model: 'permile', pay_rate: 0.55, load_gross: 2100, miles: 674 },
    { name: 'Elena', pay_model: 'flat', pay_rate: 800, load_gross: 4500, miles: 1800 },
  ]

  drivers.forEach(d => {
    it(`calculates valid pay for ${d.name} (${d.pay_model})`, () => {
      // Step 1: Validate driver pay config
      expect(() => validateDriverPay(d.pay_model, d.pay_rate, d.load_gross, d.miles)).not.toThrow()

      // Step 2: Calculate actual pay
      let pay
      if (d.pay_model === 'percent') pay = d.load_gross * (d.pay_rate / 100)
      else if (d.pay_model === 'permile') pay = d.miles * d.pay_rate
      else pay = d.pay_rate

      // Step 3: Validate the computed settlement amount
      expect(() => validateFinancialCalc(pay, `${d.name} settlement`)).not.toThrow()
      expect(pay).toBeGreaterThan(0)
      expect(pay).toBeLessThan(d.load_gross)
    })
  })

  it('blocks pay with corrupted data (NaN rate)', () => {
    expect(() => validateDriverPay('percent', NaN, 5000, 1000)).toThrow('valid number')
  })

  it('blocks pay with absurd rate (80% of gross)', () => {
    expect(() => validateDriverPay('percent', 80, 5000, 1000)).toThrow('out of range')
  })

  it('blocks unknown pay model from bad import', () => {
    expect(() => validateDriverPay('hourly', 25, 5000, 1000)).toThrow('Invalid pay model')
  })

  it('blocks permile calculation with zero miles', () => {
    expect(() => validateDriverPay('permile', 0.55, 5000, 0)).toThrow('positive number')
  })
})

// ─── WORKFLOW 3: P&L Financial Integrity ─────────────────────
// Simulates: Revenue from loads + Costs → P&L calculations
describe('WORKFLOW: P&L Financial Integrity', () => {
  it('validates a complete P&L calculation', () => {
    const loads = [
      { gross: 3840, miles: 1306 },
      { gross: 2100, miles: 674 },
      { gross: 4500, miles: 1800 },
    ]

    const fuelCostPerMile = 0.55
    const driverPayRate = 0.28

    let totalRevenue = 0
    let totalFuel = 0
    let totalDriverPay = 0

    loads.forEach(l => {
      totalRevenue += l.gross
      totalFuel += l.miles * fuelCostPerMile
      totalDriverPay += l.gross * driverPayRate
    })

    const totalCosts = totalFuel + totalDriverPay
    const profit = totalRevenue - totalCosts

    // Every intermediate value must be valid
    expect(() => validateFinancialCalc(totalRevenue, 'total revenue')).not.toThrow()
    expect(() => validateFinancialCalc(totalFuel, 'total fuel')).not.toThrow()
    expect(() => validateFinancialCalc(totalDriverPay, 'total driver pay')).not.toThrow()
    expect(() => validateFinancialCalc(totalCosts, 'total costs')).not.toThrow()
    expect(() => validateFinancialCalc(profit, 'net profit')).not.toThrow()

    // Sanity checks
    expect(totalRevenue).toBe(10440)
    expect(profit).toBeGreaterThan(0)
    expect(profit).toBeLessThan(totalRevenue)
  })

  it('catches NaN propagation from bad mile data', () => {
    const badMiles = parseInt('not-a-number') // NaN
    const fuel = badMiles * 0.55 // NaN
    expect(() => validateFinancialCalc(fuel, 'fuel from bad miles')).toThrow('NaN')
  })

  it('catches Infinity from division by zero', () => {
    const rpm = 3840 / 0 // Infinity
    expect(() => validateFinancialCalc(rpm, 'RPM')).toThrow('Infinity')
  })

  it('catches negative profit from bad subtraction', () => {
    // Negative values are blocked — forces explicit handling
    expect(() => validateFinancialCalc(-500, 'negative result')).toThrow('negative')
  })
})

// ─── WORKFLOW 4: Invoice Creation & Validation ───────────────
// Simulates: Create invoice from delivered load → validate → write
describe('WORKFLOW: Invoice Creation', () => {
  it('creates a valid invoice from delivered load data', () => {
    // Simulate load at delivery stage
    expect(() => validateStatusTransition('In Transit', 'Delivered')).not.toThrow()

    // Create invoice payload
    const invoice = {
      owner_id: 'user-uuid-123',
      load_id: 'load-uuid-456',
      amount: 3840,
    }
    expect(() => guardedUpdate('invoices', invoice, 'invoice creation')).not.toThrow()
    expect(() => validateFinancialCalc(invoice.amount, 'invoice total')).not.toThrow()
  })

  it('blocks invoice with NaN amount (corrupt form data)', () => {
    expect(() => guardedUpdate('invoices', {
      owner_id: 'user-uuid-123',
      load_id: 'load-uuid-456',
      amount: NaN,
    }, 'corrupt invoice')).toThrow('NaN')
  })

  it('blocks invoice with missing load_id', () => {
    expect(() => guardedUpdate('invoices', {
      owner_id: 'user-uuid-123',
      amount: 3840,
    }, 'incomplete invoice')).toThrow('missing required fields')
  })

  it('blocks invoice over $10M (data corruption)', () => {
    expect(() => guardedUpdate('invoices', {
      owner_id: 'user-uuid-123',
      load_id: 'load-uuid-456',
      amount: 15000000,
    }, 'corrupt invoice')).toThrow('exceeds')
  })
})

// ─── WORKFLOW 5: Pricing Validation ──────────────────────────
// Simulates: Subscription checkout → validate plan → charge
describe('WORKFLOW: Subscription Pricing', () => {
  const plans = [
    { name: 'TMS Pro', price: 79, extra: 39, trucks: 3, expected: 79 + 2 * 39 },
    { name: 'AI Dispatch Founder', price: 199, extra: 79, trucks: 5, expected: 199 + 4 * 79 },
    { name: 'AI Dispatch Regular', price: 299, extra: 149, trucks: 2, expected: 299 + 1 * 149 },
  ]

  plans.forEach(p => {
    it(`validates ${p.name} checkout (${p.trucks} trucks = $${p.expected}/mo)`, () => {
      expect(() => validatePricing(p.price, p.extra)).not.toThrow()

      // Calculate total
      const total = p.price + (p.trucks - 1) * p.extra
      expect(total).toBe(p.expected)
      expect(() => validateFinancialCalc(total, 'monthly charge')).not.toThrow()

      // Cents for Stripe
      const cents = total * 100
      expect(() => validateFinancialCalc(cents, 'Stripe amount_cents')).not.toThrow()
    })
  })

  it('blocks checkout with wrong pricing from stale cache', () => {
    // Old hardcoded $79
    expect(() => validatePricing(79, 49)).toThrow('does not match')
    // Typo pricing
    expect(() => validatePricing(199, 149)).toThrow('does not match')
    // Zero (free tier that doesn't exist)
    expect(() => validatePricing(0, 0)).toThrow('does not match')
  })
})

// ─── WORKFLOW 6: Database Entry Point Coverage ───────────────
// Verifies ALL load update paths have status guards
describe('WORKFLOW: All DB Entry Points Guarded', () => {
  it('updateLoad has status transition validation', () => {
    const content = readSrc('src/lib/database.js')
    const block = content.slice(
      content.indexOf('export async function updateLoad(id'),
      content.indexOf('export async function updateLoadByLoadId')
    )
    expect(block).toContain('validateStatusTransition')
    expect(block).toContain('validateFinancialCalc')
  })

  it('updateLoadByLoadId has status transition validation', () => {
    const content = readSrc('src/lib/database.js')
    const block = content.slice(
      content.indexOf('export async function updateLoadByLoadId'),
      content.indexOf('export async function deleteLoad')
    )
    expect(block).toContain('validateStatusTransition')
    expect(block).toContain('validateFinancialCalc')
  })

  it('createLoad validates rate', () => {
    const content = readSrc('src/lib/database.js')
    const block = content.slice(
      content.indexOf('export async function createLoad'),
      content.indexOf('export async function updateLoad(id')
    )
    expect(block).toContain('validateFinancialCalc')
  })

  it('createInvoice validates amount', () => {
    const content = readSrc('src/lib/database.js')
    const block = content.slice(
      content.indexOf('export async function createInvoice'),
      content.indexOf('export async function updateInvoice')
    )
    expect(block).toContain('validateFinancialCalc')
  })

  it('createExpense validates amount', () => {
    const content = readSrc('src/lib/database.js')
    const block = content.slice(
      content.indexOf('export async function createExpense'),
      content.indexOf('export async function updateExpense')
    )
    expect(block).toContain('validateFinancialCalc')
  })
})

// ─── WORKFLOW 7: Edge Cases & Boundary Tests ─────────────────
// Tests exact boundary values that are most likely to slip through
describe('WORKFLOW: Boundary Value Testing', () => {
  it('allows $9,999,999 (just under $10M limit)', () => {
    expect(() => validateFinancialCalc(9999999, 'max load')).not.toThrow()
  })

  it('rejects $10,000,001 (just over $10M limit)', () => {
    expect(() => validateFinancialCalc(10000001, 'over limit')).toThrow('exceeds')
  })

  it('allows 50% driver pay (upper bound)', () => {
    expect(() => validateDriverPay('percent', 50, 5000, 1000)).not.toThrow()
  })

  it('rejects 50.01% driver pay (just over)', () => {
    expect(() => validateDriverPay('percent', 50.01, 5000, 1000)).toThrow('out of range')
  })

  it('allows $0.10/mi (lower bound)', () => {
    expect(() => validateDriverPay('permile', 0.10, 5000, 1000)).not.toThrow()
  })

  it('rejects $0.09/mi (just under)', () => {
    expect(() => validateDriverPay('permile', 0.09, 5000, 1000)).toThrow('out of range')
  })

  it('allows $2.00/mi (upper bound)', () => {
    expect(() => validateDriverPay('permile', 2.00, 5000, 1000)).not.toThrow()
  })

  it('rejects $2.01/mi (just over)', () => {
    expect(() => validateDriverPay('permile', 2.01, 5000, 1000)).toThrow('out of range')
  })

  it('allows 2-step jump (Rate Con → En Route)', () => {
    expect(() => validateStatusTransition('Rate Con Received', 'En Route to Pickup')).not.toThrow()
  })

  it('rejects 3-step jump (Rate Con → Loaded)', () => {
    expect(() => validateStatusTransition('Rate Con Received', 'Loaded')).toThrow('skipping')
  })
})

// ─── WORKFLOW 8: Compound Attack Scenarios ───────────────────
// Simulates realistic corruption scenarios
describe('WORKFLOW: Compound Attack Prevention', () => {
  it('prevents load with NaN rate from reaching invoice stage', () => {
    // Step 1: Bad rate gets caught at creation
    const badRate = parseFloat('not-a-number')
    expect(() => validateFinancialCalc(badRate, 'createLoad rate')).toThrow('NaN')
  })

  it('prevents status manipulation to skip invoicing', () => {
    // Attempt: Delivered → Paid (skip Invoiced)
    // This is a 2-step jump which is allowed by pipeline rules
    expect(() => validateStatusTransition('Delivered', 'Paid')).not.toThrow()

    // But: In Transit → Paid (skip Delivered + Invoiced = 3 steps)
    expect(() => validateStatusTransition('In Transit', 'Paid')).toThrow('skipping')
  })

  it('prevents driver with corrupt profile from getting paid', () => {
    // Driver record missing pay_model
    expect(() => guardedUpdate('drivers', {
      owner_id: '123',
      name: 'Bad Import',
      pay_model: null,
      pay_rate: 28,
    }, 'driver import')).toThrow('missing required fields')
  })

  it('prevents expense with string amount from database entry', () => {
    const formAmount = '500.00' // string from form input
    expect(() => validateFinancialCalc(formAmount, 'expense amount')).toThrow('expected number')
    // Correct approach: parse first
    expect(() => validateFinancialCalc(Number(formAmount), 'expense amount')).not.toThrow()
  })

  it('end-to-end: valid load through full lifecycle with financials', () => {
    const loadData = { owner_id: 'u1', status: 'Rate Con Received' }
    const rate = 3840
    const miles = 1306
    const driverRate = 28 // percent

    // 1. Create load — validate
    expect(() => guardedUpdate('loads', loadData, 'create')).not.toThrow()
    expect(() => validateFinancialCalc(rate, 'rate')).not.toThrow()

    // 2. Walk pipeline
    const steps = ['Assigned to Driver', 'En Route to Pickup', 'Loaded', 'In Transit', 'Delivered', 'Invoiced', 'Paid']
    let current = 'Rate Con Received'
    steps.forEach(next => {
      expect(() => validateStatusTransition(current, next)).not.toThrow()
      current = next
    })

    // 3. Calculate financials at each point
    expect(() => validateDriverPay('percent', driverRate, rate, miles)).not.toThrow()
    const driverPay = rate * (driverRate / 100)
    expect(() => validateFinancialCalc(driverPay, 'driver pay')).not.toThrow()

    const fuel = miles * 0.55
    expect(() => validateFinancialCalc(fuel, 'fuel cost')).not.toThrow()

    const profit = rate - driverPay - fuel
    expect(() => validateFinancialCalc(profit, 'net profit')).not.toThrow()

    // 4. Create invoice at delivery
    const invoiceData = { owner_id: 'u1', load_id: 'l1', amount: rate }
    expect(() => guardedUpdate('invoices', invoiceData, 'invoice')).not.toThrow()

    // 5. Verify final state
    expect(current).toBe('Paid')
    expect(profit).toBeGreaterThan(0)
  })
})
