import { useMeta, ArticleLayout, ShareButtons, colors, fonts, h2Style, h3Style, pStyle, ulStyle, liStyle, tipBox, tipLabel } from './helpers'

export function IFTAGuidePage() {
  useMeta(
    'Complete IFTA Filing Guide for Owner-Operators (2026)',
    'Learn how to file IFTA taxes, calculate state mileage, meet quarterly deadlines, and avoid common mistakes. Free guide for truckers and owner-operators.'
  )

  const toc = [
    { id: 'what-is-ifta', label: 'What Is IFTA?' },
    { id: 'who-needs-ifta', label: 'Who Needs to File' },
    { id: 'quarterly-deadlines', label: 'Quarterly Deadlines' },
    { id: 'calculate-mileage', label: 'Calculate State Mileage' },
    { id: 'filing-step-by-step', label: 'Filing Step by Step' },
    { id: 'common-mistakes', label: 'Common Mistakes' },
    { id: 'qivori-ifta', label: 'Automate with Qivori' },
  ]

  return (
    <ArticleLayout
      title="Complete IFTA Filing Guide for Owner-Operators (2026)"
      subtitle="Everything you need to know about the International Fuel Tax Agreement — deadlines, calculations, and how to avoid costly mistakes."
      readTime={8}
      tocItems={toc}
    >
      <h2 id="what-is-ifta" style={h2Style}>What Is IFTA?</h2>
      <p style={pStyle}>
        The International Fuel Tax Agreement (IFTA) is an agreement between the 48 contiguous U.S. states and 10 Canadian provinces that simplifies fuel tax reporting for motor carriers operating in multiple jurisdictions. Instead of filing separate fuel tax returns in every state you drive through, IFTA lets you file a single quarterly return with your base jurisdiction, which then distributes the taxes to the appropriate states.
      </p>
      <p style={pStyle}>
        Think of it this way: every state charges fuel tax at different rates. When you buy fuel in one state but drive through five others, IFTA ensures each state gets its fair share of fuel tax based on the miles you drove there — regardless of where you actually purchased the fuel.
      </p>
      <p style={pStyle}>
        As an owner-operator, you receive an IFTA license and decals for your truck. These decals show other jurisdictions that you're a registered IFTA carrier. Without them, you could face fines at weigh stations and during roadside inspections.
      </p>

      <h2 id="who-needs-ifta" style={h2Style}>Who Needs to File IFTA?</h2>
      <p style={pStyle}>
        You need an IFTA license if your vehicle meets <strong>both</strong> of these conditions:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Qualifies as a "qualified motor vehicle"</strong> — This means it has two axles and a gross vehicle weight or registered gross vehicle weight exceeding 26,000 pounds, OR has three or more axles regardless of weight, OR is used in combination when the combined weight exceeds 26,000 pounds.</li>
        <li style={liStyle}><strong>Travels in two or more IFTA jurisdictions</strong> — If you only operate within a single state, you don't need IFTA. But the moment you cross a state line with a qualifying vehicle, IFTA applies.</li>
      </ul>
      <div style={tipBox}>
        <div style={tipLabel}>Pro Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Recreational vehicles are exempt from IFTA. Also, if you only operate in one state, check that state's intrastate fuel tax requirements — they're separate from IFTA.
        </p>
      </div>

      <h2 id="quarterly-deadlines" style={h2Style}>2026 Quarterly Deadlines</h2>
      <p style={pStyle}>
        IFTA returns are due on the last day of the month following the end of each quarter. Here are the 2026 deadlines:
      </p>
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: colors.accent, fontWeight: 700 }}>Quarter</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: colors.accent, fontWeight: 700 }}>Period</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: colors.accent, fontWeight: 700 }}>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Q1', 'Jan 1 – Mar 31', 'April 30, 2026'],
              ['Q2', 'Apr 1 – Jun 30', 'July 31, 2026'],
              ['Q3', 'Jul 1 – Sep 30', 'October 31, 2026'],
              ['Q4', 'Oct 1 – Dec 31', 'January 31, 2027'],
            ].map(([q, period, due], i) => (
              <tr key={q} style={{ borderBottom: `1px solid ${colors.border}`, background: i % 2 === 0 ? colors.surface : 'transparent' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: colors.white }}>{q}</td>
                <td style={{ padding: '10px 14px', color: colors.text }}>{period}</td>
                <td style={{ padding: '10px 14px', color: colors.accent2, fontWeight: 600 }}>{due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={tipBox}>
        <div style={tipLabel}>Warning</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Late filing penalties can be significant — typically $50 or 10% of the net tax liability (whichever is greater), plus interest. Some states add their own penalties on top. File on time, every time.
        </p>
      </div>

      <h2 id="calculate-mileage" style={h2Style}>How to Calculate State Mileage</h2>
      <p style={pStyle}>
        Accurate mileage tracking is the foundation of IFTA compliance. You need to track exactly how many miles you drove in each state during the quarter. Here's how the calculation works:
      </p>
      <h3 style={h3Style}>Step 1: Record Total Miles Driven</h3>
      <p style={pStyle}>
        Your odometer readings at the start and end of each trip form the basis. Record the reading when you cross each state line. Many drivers use a trip sheet or a GPS-based tracking system to automate this.
      </p>
      <h3 style={h3Style}>Step 2: Break Down Miles by State</h3>
      <p style={pStyle}>
        For each trip, note the miles driven in each jurisdiction. If you drove 1,200 miles from Dallas, TX to Atlanta, GA, you might have 400 miles in Texas, 300 in Louisiana, 200 in Mississippi, 100 in Alabama, and 200 in Georgia. Every mile must be accounted for.
      </p>
      <h3 style={h3Style}>Step 3: Calculate Your Fleet MPG</h3>
      <p style={pStyle}>
        Divide your total miles by total gallons purchased during the quarter. If you drove 30,000 miles and purchased 5,000 gallons, your average MPG is 6.0. This single number is used across all jurisdictions.
      </p>
      <h3 style={h3Style}>Step 4: Determine Taxable Gallons per State</h3>
      <p style={pStyle}>
        Divide the miles driven in each state by your fleet MPG. If you drove 4,500 miles in Ohio and your MPG is 6.0, Ohio's taxable gallons = 750. Then multiply by Ohio's tax rate to determine your tax obligation.
      </p>
      <h3 style={h3Style}>Step 5: Apply Credits for Fuel Purchased</h3>
      <p style={pStyle}>
        You already paid fuel tax at the pump in states where you bought fuel. Those are credits. Subtract the gallons purchased in each state from the taxable gallons. If you owe for 750 gallons in Ohio but purchased 600 gallons there, you owe the tax on 150 gallons. If you purchased more than you owe, you get a credit.
      </p>

      <h2 id="filing-step-by-step" style={h2Style}>Filing Your IFTA Return Step by Step</h2>
      <p style={pStyle}>
        Once you have your mileage and fuel data compiled, filing is straightforward:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Gather your records:</strong> Trip sheets with state-by-state mileage, fuel receipts showing gallons, price, vendor, and location.</li>
        <li style={liStyle}><strong>Log into your base state's IFTA portal:</strong> Most states offer online filing. You'll need your IFTA account number and login credentials.</li>
        <li style={liStyle}><strong>Enter mileage by jurisdiction:</strong> Input the miles driven in each state/province during the quarter.</li>
        <li style={liStyle}><strong>Enter fuel purchases by jurisdiction:</strong> Input the gallons purchased in each state/province, along with tax-paid and tax-exempt amounts.</li>
        <li style={liStyle}><strong>Review the calculated taxes:</strong> The system will compute what you owe each state and what credits you have. Review for accuracy.</li>
        <li style={liStyle}><strong>Submit and pay:</strong> If you owe a net amount, pay via the portal. If you're due a refund, it will typically be applied as a credit to your next quarter.</li>
      </ul>

      <h2 id="common-mistakes" style={h2Style}>Common IFTA Mistakes to Avoid</h2>
      <p style={pStyle}>
        After working with hundreds of owner-operators, we've seen the same mistakes come up repeatedly. Here's what to watch out for:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Not keeping fuel receipts:</strong> You must retain receipts for at least 4 years. Digital copies are acceptable in most jurisdictions. Missing receipts mean missing credits — you'll overpay.</li>
        <li style={liStyle}><strong>Estimating mileage instead of tracking it:</strong> Auditors compare your reported mileage against GPS data and industry standards. Estimates that don't hold up lead to assessments and penalties.</li>
        <li style={liStyle}><strong>Forgetting to include deadhead miles:</strong> All miles count — loaded, empty, deadhead, bobtail. If wheels are turning, it counts toward IFTA.</li>
        <li style={liStyle}><strong>Using personal card for fuel:</strong> Keep business and personal fuel purchases separate. Mixed-use receipts create headaches during audits.</li>
        <li style={liStyle}><strong>Filing late or not at all:</strong> Even if you didn't operate during a quarter, you still need to file a zero return. Missing filings can result in license revocation.</li>
        <li style={liStyle}><strong>Ignoring toll and ELD data:</strong> Auditors can cross-reference your reported mileage with toll receipts and ELD logs. Make sure all data sources agree.</li>
      </ul>

      <h2 id="qivori-ifta" style={h2Style}>How Qivori Automates Your IFTA</h2>
      <p style={pStyle}>
        Qivori AI's built-in IFTA module eliminates the manual spreadsheet work that eats hours of your time each quarter. Here's what it does:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Automatic mileage tracking by state:</strong> Qivori's GPS integration records every mile and automatically assigns it to the correct jurisdiction. No more trip sheets.</li>
        <li style={liStyle}><strong>Fuel receipt scanning:</strong> Snap a photo of your fuel receipt, and Qivori extracts the gallons, price, location, and tax paid using AI-powered OCR.</li>
        <li style={liStyle}><strong>Real-time tax calculations:</strong> See your estimated IFTA liability throughout the quarter — no more surprises at filing time.</li>
        <li style={liStyle}><strong>One-click quarterly reports:</strong> Generate your complete IFTA return data with a single click. Export it in the format your base state requires.</li>
        <li style={liStyle}><strong>Audit-ready records:</strong> Every data point is timestamped, GPS-verified, and stored securely. If you're audited, your records are already organized.</li>
      </ul>
      <p style={pStyle}>
        Owner-operators using Qivori save an average of 6 hours per quarter on IFTA paperwork and reduce filing errors by over 90%. The system handles the complexity so you can focus on driving and earning.
      </p>

      <ShareButtons title="Complete IFTA Filing Guide for Owner-Operators (2026)" />
    </ArticleLayout>
  )
}
