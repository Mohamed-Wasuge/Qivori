import { useMeta, ArticleLayout, ShareButtons, h2Style, pStyle, ulStyle, liStyle, tipBox, tipLabel } from './helpers'

export function TruckingExpensesPage() {
  useMeta(
    'Tax Deductible Trucking Expenses: Complete List for Owner-Operators',
    'Complete list of tax-deductible expenses for truck drivers and owner-operators. Per diem, fuel, maintenance, insurance, tolls, ELD, and more.'
  )

  const toc = [
    { id: 'per-diem', label: 'Per Diem Deduction' },
    { id: 'fuel', label: 'Fuel Expenses' },
    { id: 'truck-costs', label: 'Truck & Equipment' },
    { id: 'maintenance', label: 'Maintenance & Repairs' },
    { id: 'insurance-expenses', label: 'Insurance' },
    { id: 'road-costs', label: 'Tolls, Scales & Parking' },
    { id: 'technology', label: 'Technology & Subscriptions' },
    { id: 'other-deductions', label: 'Other Deductions' },
    { id: 'tracking-expenses', label: 'How to Track Expenses' },
  ]

  return (
    <ArticleLayout
      title="Tax Deductible Trucking Expenses: Complete List for Owner-Operators"
      subtitle="Stop overpaying the IRS. This comprehensive list covers every legitimate deduction available to owner-operators and truck drivers."
      readTime={10}
      tocItems={toc}
    >
      <h2 id="per-diem" style={h2Style}>Per Diem Deduction</h2>
      <p style={pStyle}>
        The per diem deduction is one of the most valuable tax benefits for truck drivers. When you're away from home overnight for work, you can deduct a fixed amount for meals and incidental expenses — no receipts required for the standard rate.
      </p>
      <p style={pStyle}>
        For 2026, the per diem rate for transportation workers is <strong>$69 per day</strong> within the continental U.S. and $74 per day for travel outside CONUS. As a transportation worker, you can deduct <strong>80%</strong> of this amount (versus 50% for other industries), making your effective deduction $55.20 per day.
      </p>
      <p style={pStyle}>
        If you're on the road 250 days per year, that's a deduction of $13,800 — reducing your taxable income significantly. You can claim per diem for any day you're away from your tax home overnight, including the day you leave and the day you return (as partial days at 75%).
      </p>
      <div style={tipBox}>
        <div style={tipLabel}>Important</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          You can choose the standard per diem rate OR actual meal expenses — not both. Most drivers find the standard rate simpler and often more generous. Keep a log of your travel days as documentation.
        </p>
      </div>

      <h2 id="fuel" style={h2Style}>Fuel Expenses</h2>
      <p style={pStyle}>
        Fuel is typically the largest single expense for an owner-operator, often 30-40% of total costs. Every gallon is deductible as a business expense.
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Diesel fuel:</strong> Every gallon for your truck, whether purchased at a truck stop or cardlock station. Keep all receipts.</li>
        <li style={liStyle}><strong>DEF (Diesel Exhaust Fluid):</strong> Required for modern trucks with SCR systems. Fully deductible.</li>
        <li style={liStyle}><strong>Reefer fuel:</strong> If you run a refrigerated trailer, the fuel for the reefer unit is a separate deductible expense.</li>
        <li style={liStyle}><strong>Fuel additives:</strong> Anti-gel treatments, injector cleaners, and other fuel additives used for your truck.</li>
        <li style={liStyle}><strong>Fuel surcharges received:</strong> Note that fuel surcharges you receive from brokers are taxable income. They offset your fuel costs but must be reported as revenue.</li>
      </ul>
      <p style={pStyle}>
        Use a fuel card like Comdata, EFS, or TCS to automatically categorize and track fuel purchases. This simplifies both your bookkeeping and your IFTA reporting.
      </p>

      <h2 id="truck-costs" style={h2Style}>Truck and Equipment Costs</h2>
      <p style={pStyle}>
        The cost of your truck and trailer is deductible, but how you deduct it depends on whether you own or lease:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Truck payments (if leasing):</strong> Monthly lease payments are fully deductible as a business expense. Straightforward and immediate.</li>
        <li style={liStyle}><strong>Depreciation (if you own):</strong> Spread the cost of the truck over its useful life (typically 3-7 years). You may be able to use Section 179 to deduct the full purchase price in the year you buy it (up to the annual limit).</li>
        <li style={liStyle}><strong>Loan interest:</strong> If you financed your truck, the interest portion of your payments is deductible.</li>
        <li style={liStyle}><strong>Trailer costs:</strong> Same rules apply — lease payments are deductible, or depreciate if you own.</li>
        <li style={liStyle}><strong>Auxiliary equipment:</strong> Chains, tarps, straps, load bars, pallet jacks, dollies, and other freight-handling equipment.</li>
        <li style={liStyle}><strong>APU (Auxiliary Power Unit):</strong> If you installed an APU for idle-free climate control, the cost is deductible through depreciation or Section 179.</li>
      </ul>
      <div style={tipBox}>
        <div style={tipLabel}>Section 179 Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Section 179 allows you to deduct the full purchase price of qualifying equipment in the year you buy it, rather than depreciating it over years. For 2026, the deduction limit is $1,220,000. This can dramatically reduce your tax bill in the year you buy a truck.
        </p>
      </div>

      <h2 id="maintenance" style={h2Style}>Maintenance and Repairs</h2>
      <p style={pStyle}>
        Every dollar you spend keeping your truck running is deductible. This includes:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Oil changes and filters:</strong> Engine oil, oil filters, fuel filters, air filters, cabin filters.</li>
        <li style={liStyle}><strong>Tires:</strong> New tires, retreads, tire repairs, tire balancing, and alignments.</li>
        <li style={liStyle}><strong>Brake work:</strong> Pads, drums, shoes, adjustments, and air brake system repairs.</li>
        <li style={liStyle}><strong>Engine and drivetrain repairs:</strong> Any mechanical repair to the engine, transmission, differential, or drivetrain.</li>
        <li style={liStyle}><strong>Electrical repairs:</strong> Lighting, wiring, alternator, starter, and battery replacements.</li>
        <li style={liStyle}><strong>Preventive maintenance:</strong> Scheduled services, DOT inspections, grease jobs, and fluid flushes.</li>
        <li style={liStyle}><strong>Truck wash:</strong> Exterior wash, interior cleaning, and detailing for your truck and trailer.</li>
        <li style={liStyle}><strong>Roadside repairs:</strong> Emergency service calls, mobile mechanic fees, and towing.</li>
      </ul>

      <h2 id="insurance-expenses" style={h2Style}>Insurance Premiums</h2>
      <p style={pStyle}>
        All business-related insurance premiums are fully deductible:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Primary liability insurance</strong></li>
        <li style={liStyle}><strong>Cargo insurance</strong></li>
        <li style={liStyle}><strong>Physical damage (comprehensive and collision)</strong></li>
        <li style={liStyle}><strong>Bobtail / non-trucking liability</strong></li>
        <li style={liStyle}><strong>Occupational accident insurance</strong></li>
        <li style={liStyle}><strong>Health insurance:</strong> Self-employed individuals can deduct 100% of their health insurance premiums (for themselves, spouse, and dependents) as an adjustment to income — not even itemized. This is huge.</li>
        <li style={liStyle}><strong>Workers' compensation</strong> (if required by your state or contracts)</li>
      </ul>

      <h2 id="road-costs" style={h2Style}>Tolls, Scales, and Parking</h2>
      <p style={pStyle}>
        Road-related expenses add up fast and are all deductible:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Toll fees:</strong> All tolls on toll roads, bridges, and tunnels. Use a PrePass or E-ZPass transponder and the statements serve as your records.</li>
        <li style={liStyle}><strong>Scale fees:</strong> CAT scale tickets, state weigh station fees, and pre-trip weight verifications.</li>
        <li style={liStyle}><strong>Parking fees:</strong> Truck stop parking, reserved parking services, and overnight parking fees. With safe parking becoming scarcer, these costs are rising.</li>
        <li style={liStyle}><strong>Lumper fees:</strong> Fees paid for loading/unloading at warehouses (when not reimbursed by the broker).</li>
        <li style={liStyle}><strong>Permits:</strong> Oversize/overweight permits, trip permits, fuel permits, and state-specific operating permits.</li>
        <li style={liStyle}><strong>Highway Use Tax (HVUT):</strong> The annual Form 2290 tax for trucks over 55,000 lbs GVW. Currently $550/year for most trucks.</li>
      </ul>

      <h2 id="technology" style={h2Style}>Technology and Subscriptions</h2>
      <p style={pStyle}>
        Modern trucking runs on technology, and all of it is deductible:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>ELD device and subscription:</strong> Your electronic logging device hardware and monthly service fee.</li>
        <li style={liStyle}><strong>Cell phone:</strong> The business-use percentage of your phone and plan. If you use your phone 80% for business, deduct 80% of the cost.</li>
        <li style={liStyle}><strong>GPS and navigation:</strong> Truck-specific GPS devices or navigation app subscriptions.</li>
        <li style={liStyle}><strong>Dashcam:</strong> Camera hardware and cloud storage subscriptions.</li>
        <li style={liStyle}><strong>Load board subscriptions:</strong> DAT, Truckstop, or any load board you pay for.</li>
        <li style={liStyle}><strong>TMS software:</strong> Transportation management system subscriptions like Qivori AI.</li>
        <li style={liStyle}><strong>Satellite radio:</strong> If used primarily for traffic and weather updates during driving.</li>
        <li style={liStyle}><strong>Internet/hotspot:</strong> Mobile hotspot device and data plan for business use on the road.</li>
      </ul>

      <h2 id="other-deductions" style={h2Style}>Other Deductions You Might Miss</h2>
      <p style={pStyle}>
        These commonly overlooked deductions can save you hundreds or thousands per year:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Uniforms and work clothing:</strong> Safety vests, steel-toe boots, gloves, and branded work shirts. Laundry costs for work clothes too.</li>
        <li style={liStyle}><strong>DOT physical:</strong> The cost of your required medical examination and any drug/alcohol testing fees.</li>
        <li style={liStyle}><strong>CDL renewal and endorsements:</strong> Renewal fees, TWIC card, HazMat endorsement, and any required background checks.</li>
        <li style={liStyle}><strong>Association dues:</strong> OOIDA membership, state trucking association fees, and other professional memberships.</li>
        <li style={liStyle}><strong>Tax preparation fees:</strong> The cost of having a professional prepare your tax return (including this if you're paying an accountant).</li>
        <li style={liStyle}><strong>Home office:</strong> If you use a dedicated space in your home exclusively for business administration, you can deduct a portion of rent/mortgage, utilities, and internet.</li>
        <li style={liStyle}><strong>Continuing education:</strong> Training courses, safety certifications, and industry conferences.</li>
        <li style={liStyle}><strong>Bank fees and interest:</strong> Business bank account fees, credit card interest on business expenses, and merchant processing fees.</li>
        <li style={liStyle}><strong>Factoring fees:</strong> If you use a factoring company, their fees are a deductible business expense.</li>
        <li style={liStyle}><strong>Shower credits:</strong> Truck stop loyalty programs often provide shower credits — if you pay for showers, those are deductible.</li>
      </ul>

      <h2 id="tracking-expenses" style={h2Style}>How to Track Your Expenses</h2>
      <p style={pStyle}>
        The IRS requires "adequate records" to support your deductions. Here's how to stay audit-proof:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Keep every receipt:</strong> The IRS can disallow deductions you can't prove. Digital copies are acceptable — snap a photo as soon as you get the receipt.</li>
        <li style={liStyle}><strong>Use a dedicated business account:</strong> Never mix personal and business expenses. A separate business checking account and credit card make tracking simple.</li>
        <li style={liStyle}><strong>Record expenses immediately:</strong> Don't rely on memory or a pile of receipts at year-end. Log each expense the day it happens.</li>
        <li style={liStyle}><strong>Categorize consistently:</strong> Use the same categories your tax preparer uses. This saves time and money when tax season arrives.</li>
        <li style={liStyle}><strong>Retain records for 3-7 years:</strong> The IRS can audit returns up to 3 years back (6 years if they suspect underreporting). Keep records for at least 4 years to be safe.</li>
      </ul>
      <p style={pStyle}>
        Qivori AI makes expense tracking effortless. Snap a photo of any receipt and the AI extracts the date, amount, vendor, and category automatically. It syncs with your fuel card, categorizes recurring expenses, and generates tax-ready reports. No more shoeboxes of receipts or spreadsheet nightmares.
      </p>

      <ShareButtons title="Tax Deductible Trucking Expenses: Complete List for Owner-Operators" />
    </ArticleLayout>
  )
}
