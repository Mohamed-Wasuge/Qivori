/**
 * Runtime enforcement guards for Qivori AI TMS
 *
 * Validates pricing, driver pay, financial calculations, load status
 * transitions, and database writes at runtime to prevent data corruption.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reportViolation(message, error) {
  console.error(`[PERMANENCE GUARD] ${message}`);
  if (import.meta.env.PROD && typeof window !== 'undefined' && window.__SENTRY__) {
    try {
      window.__SENTRY__.captureException(error || new Error(message));
    } catch (_) {
      // Sentry itself failed — swallow silently
    }
  }
}

function guardError(message) {
  const err = new Error(message);
  reportViolation(message, err);
  return err;
}

// ---------------------------------------------------------------------------
// Pricing guards
// ---------------------------------------------------------------------------

const VALID_PLANS = {
  // plan key -> [firstTruck, additionalTruck]
  tms_pro:          [79, 39],
  autonomous_fleet: [199, 79],   // founder pricing (first 100 carriers)
  regular:          [299, 149],
};

/**
 * Validate that a subscription price matches one of the known plan tiers.
 *
 * @param {number} price       — monthly price for the first truck
 * @param {number} extraTruck  — monthly price per additional truck
 * @throws if values don't match any known plan
 */
export function validatePricing(price, extraTruck) {
  if (typeof price !== 'number' || typeof extraTruck !== 'number') {
    throw guardError(
      `Pricing values must be numbers. Got price=${price}, extraTruck=${extraTruck}`
    );
  }

  const match = Object.entries(VALID_PLANS).find(
    ([, [first, additional]]) => first === price && additional === extraTruck
  );

  if (!match) {
    throw guardError(
      `Pricing ($${price}/$${extraTruck}) does not match any known plan. ` +
      `Valid plans: ${Object.entries(VALID_PLANS)
        .map(([k, [f, a]]) => `${k}: $${f}/$${a}`)
        .join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// Driver pay guards
// ---------------------------------------------------------------------------

const VALID_PAY_MODELS = ['percent', 'permile', 'flat'];

const PAY_RATE_RANGES = {
  percent: { min: 0,    max: 50,   unit: '%'  },
  permile: { min: 0.10, max: 2.00, unit: '$/mi' },
  flat:    { min: 50,   max: 5000, unit: '$'  },
};

/**
 * Validate driver pay calculation inputs.
 *
 * @param {string} payModel — 'percent' | 'permile' | 'flat'
 * @param {number} payRate  — the rate value matching the model
 * @param {number} gross    — gross revenue for the load (used with percent)
 * @param {number} miles    — total miles (used with permile)
 * @throws if any input is invalid or out of range
 */
export function validateDriverPay(payModel, payRate, gross, miles) {
  if (!VALID_PAY_MODELS.includes(payModel)) {
    throw guardError(
      `Invalid pay model "${payModel}". Must be one of: ${VALID_PAY_MODELS.join(', ')}`
    );
  }

  if (typeof payRate !== 'number' || Number.isNaN(payRate)) {
    throw guardError(`Pay rate must be a valid number. Got: ${payRate}`);
  }

  const range = PAY_RATE_RANGES[payModel];
  if (payRate < range.min || payRate > range.max) {
    throw guardError(
      `Pay rate ${payRate} out of range for model "${payModel}". ` +
      `Expected ${range.min}${range.unit} – ${range.max}${range.unit}`
    );
  }

  if (payModel === 'percent') {
    if (typeof gross !== 'number' || Number.isNaN(gross) || gross < 0) {
      throw guardError(
        `Gross revenue must be a non-negative number for percent pay. Got: ${gross}`
      );
    }
  }

  if (payModel === 'permile') {
    if (typeof miles !== 'number' || Number.isNaN(miles) || miles <= 0) {
      throw guardError(
        `Miles must be a positive number for per-mile pay. Got: ${miles}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Financial calculation guards
// ---------------------------------------------------------------------------

const MAX_LINE_ITEM = 10_000_000; // $10M

/**
 * Validate a financial calculation result.
 *
 * @param {number} value — the computed dollar amount
 * @param {string} label — human-readable description (e.g. "invoice total")
 * @throws if value is NaN, Infinity, negative, or unreasonably large
 */
export function validateFinancialCalc(value, label = 'financial value') {
  if (typeof value !== 'number') {
    throw guardError(`${label}: expected number, got ${typeof value} (${value})`);
  }
  if (Number.isNaN(value)) {
    throw guardError(`${label}: result is NaN`);
  }
  if (!Number.isFinite(value)) {
    throw guardError(`${label}: result is Infinity`);
  }
  if (value < 0) {
    throw guardError(`${label}: negative value ($${value}) is not allowed`);
  }
  if (value > MAX_LINE_ITEM) {
    throw guardError(
      `${label}: value $${value.toLocaleString()} exceeds $${MAX_LINE_ITEM.toLocaleString()} limit`
    );
  }
}

// ---------------------------------------------------------------------------
// Load status transition guards
// ---------------------------------------------------------------------------

const STATUS_PIPELINE = [
  'Rate Con Received',
  'Assigned to Driver',
  'En Route to Pickup',
  'Loaded',
  'In Transit',
  'Delivered',
  'Invoiced',
  'Paid',
];

const STATUS_INDEX = Object.fromEntries(
  STATUS_PIPELINE.map((s, i) => [s, i])
);

/**
 * Validate a load status transition.
 *
 * Allowed moves:
 *  - Same status (no-op)
 *  - Forward by 1 or 2 steps (skip max 1 step)
 *  - Backward only to "Rate Con Received" (cancellation / rebooking)
 *
 * @param {string} currentStatus
 * @param {string} newStatus
 * @throws if the transition is invalid
 */
export function validateStatusTransition(currentStatus, newStatus) {
  const curIdx = STATUS_INDEX[currentStatus];
  const newIdx = STATUS_INDEX[newStatus];

  if (curIdx === undefined) {
    throw guardError(`Unknown current status: "${currentStatus}"`);
  }
  if (newIdx === undefined) {
    throw guardError(`Unknown target status: "${newStatus}"`);
  }

  // Same status — no-op, always allowed
  if (curIdx === newIdx) return;

  // Forward: allow advancing by 1 or 2 steps
  if (newIdx > curIdx) {
    const jump = newIdx - curIdx;
    if (jump > 2) {
      throw guardError(
        `Cannot jump from "${currentStatus}" to "${newStatus}" (skipping ${jump - 1} steps). ` +
        `Maximum skip is 1 step.`
      );
    }
    return;
  }

  // Backward: only allowed back to "Rate Con Received"
  if (newIdx === 0) return;

  throw guardError(
    `Cannot move backward from "${currentStatus}" to "${newStatus}". ` +
    `Backward transitions are only allowed to "Rate Con Received".`
  );
}

// ---------------------------------------------------------------------------
// Guarded DB write wrapper
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = {
  loads: ['owner_id', 'status'],
  invoices: ['owner_id', 'load_id', 'amount'],
  expenses: ['owner_id', 'amount', 'category'],
  drivers: ['owner_id', 'name', 'pay_model', 'pay_rate'],
  vehicles: ['owner_id', 'unit_number'],
};

/**
 * Validate data before allowing a database write.
 *
 * @param {string} table — Supabase table name
 * @param {object} data  — the row data to be written
 * @param {string} label — context description for error messages
 * @throws if required fields are missing or data is invalid
 */
export function guardedUpdate(table, data, label = 'DB write') {
  if (!table || typeof table !== 'string') {
    throw guardError(`${label}: table name is required`);
  }
  if (!data || typeof data !== 'object') {
    throw guardError(`${label}: data must be a non-null object`);
  }

  const required = REQUIRED_FIELDS[table];
  if (required) {
    const missing = required.filter(
      (field) => data[field] === undefined || data[field] === null || data[field] === ''
    );
    if (missing.length > 0) {
      throw guardError(
        `${label}: missing required fields for "${table}": ${missing.join(', ')}`
      );
    }
  }

  // Table-specific validations
  if (table === 'loads' && data.status) {
    if (!STATUS_PIPELINE.includes(data.status)) {
      throw guardError(`${label}: invalid load status "${data.status}"`);
    }
  }

  if (table === 'invoices' && data.amount !== undefined) {
    validateFinancialCalc(data.amount, `${label} invoice amount`);
  }

  if (table === 'expenses' && data.amount !== undefined) {
    validateFinancialCalc(data.amount, `${label} expense amount`);
  }

  if (table === 'drivers') {
    if (data.pay_model && !VALID_PAY_MODELS.includes(data.pay_model)) {
      throw guardError(
        `${label}: invalid pay_model "${data.pay_model}" for drivers table`
      );
    }
    if (data.pay_rate !== undefined && data.pay_model) {
      const range = PAY_RATE_RANGES[data.pay_model];
      if (range && (data.pay_rate < range.min || data.pay_rate > range.max)) {
        throw guardError(
          `${label}: pay_rate ${data.pay_rate} out of range for "${data.pay_model}"`
        );
      }
    }
  }

  if (!data.owner_id && required && required.includes('owner_id')) {
    throw guardError(`${label}: owner_id is required for RLS-protected table "${table}"`);
  }
}
