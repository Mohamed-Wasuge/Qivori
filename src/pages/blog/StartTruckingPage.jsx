import { useMeta, ArticleLayout, ShareButtons, h2Style, pStyle, ulStyle, liStyle, tipBox, tipLabel } from './helpers'

export function StartTruckingPage() {
  useMeta(
    'How to Start a Trucking Company: Owner-Operator Guide',
    'Step-by-step guide to becoming an owner-operator. CDL, FMCSA registration, MC/DOT numbers, insurance, finding loads, and essential tools.'
  )

  const toc = [
    { id: 'get-cdl', label: 'Get Your CDL' },
    { id: 'business-structure', label: 'Business Structure' },
    { id: 'fmcsa-registration', label: 'FMCSA Registration' },
    { id: 'mc-dot-numbers', label: 'MC & DOT Numbers' },
    { id: 'insurance', label: 'Insurance Requirements' },
    { id: 'equipment', label: 'Get Your Equipment' },
    { id: 'first-load', label: 'Find Your First Load' },
    { id: 'essential-tools', label: 'Essential Tools' },
  ]

  return (
    <ArticleLayout
      title="How to Start a Trucking Company: Owner-Operator Guide"
      subtitle="Your complete roadmap from CDL to first load. Everything you need to know to launch a successful trucking business in 2026."
      readTime={10}
      tocItems={toc}
    >
      <h2 id="get-cdl" style={h2Style}>Step 1: Get Your CDL</h2>
      <p style={pStyle}>
        A Commercial Driver's License (CDL) is your entry ticket to the trucking industry. Since the FMCSA's Entry-Level Driver Training (ELDT) rule took effect, you must complete training at a registered program before taking your CDL skills test.
      </p>
      <p style={pStyle}>
        There are three classes of CDL. For most owner-operators, you'll need a <strong>Class A CDL</strong>, which allows you to operate combination vehicles with a gross combination weight rating (GCWR) of 26,001 pounds or more, provided the towed vehicle is heavier than 10,000 pounds. This covers tractor-trailers, the bread and butter of long-haul trucking.
      </p>
      <p style={pStyle}>
        CDL training programs typically cost between $3,000 and $10,000 and take 3-8 weeks. Some larger carriers offer sponsored training where they cover the cost in exchange for a commitment to drive for them for a period. This can be a smart way to get experience before going independent.
      </p>
      <div style={tipBox}>
        <div style={tipLabel}>Pro Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Get at least 1-2 years of experience driving for a company before going owner-operator. You'll learn the business, build a safety record, and understand what lanes and freight types suit you best.
        </p>
      </div>

      <h2 id="business-structure" style={h2Style}>Step 2: Choose Your Business Structure</h2>
      <p style={pStyle}>
        Before you register with the FMCSA, decide on your business structure. Most owner-operators choose one of these:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Sole Proprietorship:</strong> The simplest option. You and the business are one entity. Easy to set up, but your personal assets are at risk if someone sues the business.</li>
        <li style={liStyle}><strong>LLC (Limited Liability Company):</strong> The most popular choice. It protects your personal assets from business liabilities while offering flexible tax treatment. Formation costs $50-$500 depending on the state.</li>
        <li style={liStyle}><strong>S-Corporation:</strong> Offers potential tax savings if you're earning over $80,000/year. You pay yourself a reasonable salary and take the rest as distributions, potentially saving on self-employment tax. More complex to maintain.</li>
      </ul>
      <p style={pStyle}>
        We recommend starting with an LLC. It provides liability protection without the complexity of a corporation. You can always elect S-Corp tax status later when your revenue justifies it. Get an EIN (Employer Identification Number) from the IRS — it's free and takes minutes online.
      </p>

      <h2 id="fmcsa-registration" style={h2Style}>Step 3: Register with FMCSA</h2>
      <p style={pStyle}>
        The Federal Motor Carrier Safety Administration (FMCSA) regulates all commercial motor carriers in the United States. To operate legally as an owner-operator, you must register through the <strong>Unified Registration System (URS)</strong> at the FMCSA website.
      </p>
      <p style={pStyle}>
        During registration, you'll provide information about your business, the type of freight you plan to haul, your operating radius, and your safety practices. The registration process involves a filing fee of $300 and requires you to designate process agents in every state where you operate.
      </p>
      <p style={pStyle}>
        You'll also need a <strong>BOC-3 filing</strong> — this designates process agents who can accept legal documents on your behalf in each state. Several companies offer BOC-3 filing services for $30-$50.
      </p>

      <h2 id="mc-dot-numbers" style={h2Style}>Step 4: Get Your MC and DOT Numbers</h2>
      <p style={pStyle}>
        When you register with FMCSA, you'll receive two critical numbers:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>USDOT Number:</strong> This is your unique identifier for safety tracking and compliance. Every commercial vehicle must display this number. It's required for all interstate carriers and many intrastate carriers.</li>
        <li style={liStyle}><strong>MC (Motor Carrier) Number:</strong> This is your operating authority — your license to haul freight for hire. Without active MC authority, you cannot legally broker or carry freight across state lines for compensation.</li>
      </ul>
      <p style={pStyle}>
        After your MC number is issued, there's a mandatory 10-day waiting period during which your authority is "pending." During this time, other parties can protest your application (rare). After the waiting period and once you have proof of insurance on file, your authority becomes active. The entire process from application to active authority typically takes 4-6 weeks.
      </p>

      <h2 id="insurance" style={h2Style}>Step 5: Insurance Requirements</h2>
      <p style={pStyle}>
        Insurance is one of the largest ongoing costs for owner-operators. The FMCSA sets minimum requirements, but your contracts and common sense often demand more. Here's what you need:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Primary Liability Insurance:</strong> Minimum $750,000 for general freight, $1,000,000 for hazmat. This covers damage you cause to others. Most brokers require $1,000,000 regardless of freight type. Budget $8,000-$16,000/year for a new authority.</li>
        <li style={liStyle}><strong>Cargo Insurance:</strong> Covers the freight you're hauling if it's damaged or lost. The FMCSA doesn't mandate a minimum, but most brokers require $100,000. Standard policies cost $1,500-$3,000/year.</li>
        <li style={liStyle}><strong>Physical Damage Insurance:</strong> Covers your truck and trailer against collision, theft, and weather damage. Not federally required but essential if you're financing your equipment. Cost depends on the value of your truck.</li>
        <li style={liStyle}><strong>Bobtail/Non-Trucking Liability:</strong> Covers your truck when it's being used without a trailer (bobtailing) or for personal use. Required by most lease agreements. Around $400-$800/year.</li>
        <li style={liStyle}><strong>Occupational Accident Insurance:</strong> Since you're self-employed, you don't have workers' comp. This covers you if you're injured on the job. $150-$300/month.</li>
      </ul>
      <div style={tipBox}>
        <div style={tipLabel}>Budget Tip</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Your insurance rates will be highest in your first 2 years due to having a new authority. Rates typically drop 20-30% after you establish a clean safety record. Shop multiple insurers and consider working with a trucking-specific insurance broker.
        </p>
      </div>

      <h2 id="equipment" style={h2Style}>Step 6: Get Your Equipment</h2>
      <p style={pStyle}>
        You have three main options for getting a truck:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Buy new:</strong> $130,000-$180,000 for a quality sleeper cab. Lowest maintenance costs, full warranty, latest fuel efficiency. Highest upfront cost.</li>
        <li style={liStyle}><strong>Buy used:</strong> $40,000-$90,000 for a 3-5 year old truck with 400,000-600,000 miles. Good balance of cost and reliability. Get a thorough pre-purchase inspection.</li>
        <li style={liStyle}><strong>Lease:</strong> $1,500-$2,500/month with a lease-purchase option. Lower barrier to entry, but you'll pay more over time. Read the contract carefully — some lease agreements are predatory.</li>
      </ul>
      <p style={pStyle}>
        For your trailer, a standard 53-foot dry van runs $25,000-$45,000 used. Reefer trailers (refrigerated) cost $40,000-$70,000 used but open access to higher-paying temperature-controlled freight. Flatbed trailers are $15,000-$30,000 used and can access specialized freight markets.
      </p>

      <h2 id="first-load" style={h2Style}>Step 7: Find Your First Load</h2>
      <p style={pStyle}>
        With your authority active, insurance in place, and truck ready, it's time to find freight. Here are the main channels:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Load boards:</strong> Platforms like DAT, Truckstop.com, and Qivori's free load board connect you with available freight. Start here to learn the market and build relationships.</li>
        <li style={liStyle}><strong>Freight brokers:</strong> Brokers match carriers with shippers. They take a cut (typically 10-25%), but they handle the sales, billing, and sometimes fuel advances. A good broker relationship is gold.</li>
        <li style={liStyle}><strong>Direct shipper contracts:</strong> The holy grail. Eliminate the middleman, get better rates, and have consistent freight. These take time to develop but are worth pursuing from day one.</li>
        <li style={liStyle}><strong>Carrier networks:</strong> Partner with other small carriers to bid on larger contracts that no single truck could handle.</li>
      </ul>
      <p style={pStyle}>
        For your first few loads, prioritize reliability over rate. Deliver on time, communicate proactively, and build your reputation. Word travels fast in trucking — a few solid deliveries open doors to better freight.
      </p>

      <h2 id="essential-tools" style={h2Style}>Essential Tools for Owner-Operators</h2>
      <p style={pStyle}>
        Running a trucking business requires more than just a truck and a CDL. These tools will keep you profitable and compliant:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>ELD (Electronic Logging Device):</strong> Legally required for tracking your hours of service. Budget $20-$40/month for a quality ELD solution.</li>
        <li style={liStyle}><strong>TMS (Transportation Management System):</strong> Tracks loads, invoices, expenses, and profitability. This is where Qivori shines — it combines TMS, accounting, IFTA, and AI-powered dispatch into one platform.</li>
        <li style={liStyle}><strong>Accounting software:</strong> Track revenue, expenses, and tax obligations. QuickBooks Self-Employed works, but Qivori's built-in expense tracking is purpose-built for trucking.</li>
        <li style={liStyle}><strong>Dashcam:</strong> Front and rear facing cameras protect you in accident disputes. $200-$500 for a quality dual-camera setup.</li>
        <li style={liStyle}><strong>Fuel card:</strong> Cards like Comdata or EFS offer per-gallon discounts at truck stops. Savings of $0.05-$0.15/gallon add up fast.</li>
        <li style={liStyle}><strong>Factoring service (optional):</strong> If cash flow is tight, factoring companies advance you 90-95% of your invoice value within 24 hours, then collect from the broker. They charge 1-5% per invoice.</li>
      </ul>

      <ShareButtons title="How to Start a Trucking Company: Owner-Operator Guide" />
    </ArticleLayout>
  )
}
