import { useMeta, ArticleLayout, ShareButtons, colors, fonts, h2Style, h3Style, pStyle, ulStyle, liStyle, tipBox, tipLabel } from './helpers'

export function RateNegotiationPage() {
  useMeta(
    'How to Negotiate Freight Rates: Scripts & Strategies',
    'Proven strategies, email templates, and phone scripts for negotiating better freight rates. Learn when to push back and how to counter-offer effectively.'
  )

  const toc = [
    { id: 'market-research', label: 'Market Rate Research' },
    { id: 'when-to-negotiate', label: 'When to Negotiate' },
    { id: 'phone-scripts', label: 'Phone Scripts' },
    { id: 'email-templates', label: 'Email Templates' },
    { id: 'counter-offers', label: 'Counter-Offer Strategies' },
    { id: 'red-flags', label: 'Red Flags to Watch' },
    { id: 'qivori-rates', label: 'Qivori Rate Intelligence' },
  ]

  const scriptBox = {
    background: colors.surface, border: `1px solid ${colors.border}`,
    borderRadius: 10, padding: '20px 24px', marginBottom: 20, marginTop: 12,
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, lineHeight: 1.7,
    color: colors.text, whiteSpace: 'pre-wrap',
  }

  return (
    <ArticleLayout
      title="How to Negotiate Freight Rates: Scripts & Strategies"
      subtitle="Stop leaving money on the table. Learn the exact words, timing, and tactics that top owner-operators use to get better rates on every load."
      readTime={9}
      tocItems={toc}
    >
      <h2 id="market-research" style={h2Style}>Know Your Market Rates</h2>
      <p style={pStyle}>
        You can't negotiate effectively if you don't know what a load should pay. Market rate research is the foundation of every negotiation. Before you call or email a broker, you should know the going rate for that lane within a narrow range.
      </p>
      <p style={pStyle}>
        Use multiple data sources to triangulate the current rate. Load boards like DAT and Truckstop publish lane averages. Qivori's Rate Intelligence tool aggregates real-time data across multiple sources to give you a confidence score for any lane. Industry surveys from ATRI provide cost-per-mile benchmarks.
      </p>
      <p style={pStyle}>
        Know your own numbers cold. What is your cost per mile? For most owner-operators, total operating costs fall between $1.50 and $2.20 per mile when you include fuel, insurance, truck payment, maintenance, permits, and your salary. If a load doesn't cover your costs plus a reasonable profit margin, it's not worth taking — no matter how persuasive the broker is.
      </p>
      <div style={tipBox}>
        <div style={tipLabel}>Key Numbers to Know</div>
        <p style={{ ...pStyle, marginBottom: 0, fontSize: 13 }}>
          Average dry van rate per mile (national): $2.30-$2.80 in 2026. Reefer: $2.60-$3.20. Flatbed: $2.80-$3.50. Your specific lane may be higher or lower. Always check the lane-specific rate, not just national averages.
        </p>
      </div>

      <h2 id="when-to-negotiate" style={h2Style}>When to Negotiate (Timing Is Everything)</h2>
      <p style={pStyle}>
        Timing dramatically affects your negotiating power. Understanding market cycles gives you leverage:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>End of month/quarter:</strong> Shippers need to move freight before period-end. Brokers are more flexible on rates to clear their boards.</li>
        <li style={liStyle}><strong>Produce season (April-August):</strong> Reefer demand spikes. If you have a reefer, your leverage increases significantly in warmer months.</li>
        <li style={liStyle}><strong>Holiday seasons:</strong> Retail freight surges before Thanksgiving and Christmas. Rates climb 15-25% above baseline.</li>
        <li style={liStyle}><strong>Severe weather events:</strong> Disruptions tighten capacity in affected regions. Rates in and out of those areas increase.</li>
        <li style={liStyle}><strong>When a load is posted multiple times:</strong> If you see the same load reposted, the broker is struggling to cover it. That's your leverage.</li>
        <li style={liStyle}><strong>Close to pickup time:</strong> A load that picks up in 4 hours pays more than one that picks up in 3 days. Urgency is your friend.</li>
      </ul>

      <h2 id="phone-scripts" style={h2Style}>Phone Negotiation Scripts</h2>
      <p style={pStyle}>
        The phone is where most rate negotiations happen. Here are proven scripts for common scenarios:
      </p>
      <h3 style={h3Style}>Script 1: Initial Rate Inquiry</h3>
      <div style={scriptBox}>
{`"Hi, this is [Name] with [Company], MC number [XXXXXX].
I'm calling about the load from [Origin] to [Destination]
posted on [Board/Reference].

I'm available for pickup on [Date]. What's the rate
on this one?"

[Let them state the rate first. Never go first.]

If rate is low:
"I appreciate that. I'm seeing rates on this lane
running $X.XX to $X.XX per mile this week. My truck
is available and I can guarantee on-time pickup and
delivery. I'd need [$Amount] to make this work.
Can you get closer to that?"`}
      </div>

      <h3 style={h3Style}>Script 2: Counter-Offer After Low Initial Rate</h3>
      <div style={scriptBox}>
{`"I understand you're working with a budget on this one.
Here's my situation — after fuel, insurance, and
operating costs, I need at least $X.XX per mile to
run this lane profitably.

I've got a clean safety record, I'm always on time,
and I communicate proactively. What can you do to
get closer to [$Amount]?"

[If they say they can't move:]
"Okay, is there any flexibility on detention pay?
Or do you have anything else moving out of
[Destination city] that I could pair with this?"`}
      </div>

      <h3 style={h3Style}>Script 3: Leveraging a Competing Offer</h3>
      <div style={scriptBox}>
{`"I've got another offer on a load heading that
direction at [$Higher Amount]. I'd prefer to work
with you since we've had a good relationship, but
I need the numbers to make sense. Can you match
[$Amount] on this one?"

[Only use this if you actually have another offer.
Bluffing damages trust and your reputation.]`}
      </div>

      <h2 id="email-templates" style={h2Style}>Email Negotiation Templates</h2>
      <p style={pStyle}>
        Email works well for lane contracts and ongoing rate negotiations. It creates a paper trail and gives both sides time to think.
      </p>
      <h3 style={h3Style}>Template: Requesting a Rate Increase on an Existing Lane</h3>
      <div style={scriptBox}>
{`Subject: Rate Review Request — [Origin] to [Destination]

Hi [Broker Name],

I've valued our partnership on the [Origin] to
[Destination] lane over the past [X months]. My
on-time rate has been [X%] and I've handled
[X loads] without any claims or issues.

Due to increased operating costs — fuel is up [X%],
insurance renewed [X%] higher, and maintenance costs
have risen — I need to adjust my rate on this lane
from [$Current] to [$Requested] per mile, effective
[Date].

This keeps me competitive on this lane while
maintaining the service level you've come to expect.
I'm happy to discuss if you'd like to talk through
the numbers.

Best regards,
[Your Name]
[Company] | MC# [XXXXXX]
[Phone]`}
      </div>

      <h2 id="counter-offers" style={h2Style}>Counter-Offer Strategies That Work</h2>
      <p style={pStyle}>
        Effective counter-offering is an art. Here are the strategies that consistently produce better results:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Never accept the first offer:</strong> Brokers build negotiation room into their initial rates. Even if the first number sounds good, a polite counter often yields $50-$200 more.</li>
        <li style={liStyle}><strong>Justify with data, not emotion:</strong> "I'm seeing $2.75/mile on this lane from three different sources" is stronger than "That's too low." Data-backed counters are taken more seriously.</li>
        <li style={liStyle}><strong>Offer value-adds:</strong> "I'll guarantee pickup within a 2-hour window and provide live GPS tracking" justifies a premium rate. Make it easy for the broker to sell you to the shipper.</li>
        <li style={liStyle}><strong>Ask about the full package:</strong> If the line-haul rate is firm, negotiate detention pay, layover pay, fuel surcharges, or quick-pay terms. A load paying $2.50/mile with $75/hour detention after 2 hours free might beat a $2.65/mile load with no detention pay.</li>
        <li style={liStyle}><strong>Use the "split the difference" close:</strong> "You're at $3,200 and I need $3,600. Can we meet in the middle at $3,400?" This feels fair and usually works if the gap is reasonable.</li>
        <li style={liStyle}><strong>Be willing to walk away:</strong> The most powerful tool is your willingness to say no. If a load doesn't meet your minimums, declining it keeps your per-mile revenue strong.</li>
      </ul>

      <h2 id="red-flags" style={h2Style}>Red Flags in Rate Negotiations</h2>
      <p style={pStyle}>
        Not every load is worth taking, and not every broker is worth working with. Watch for these warning signs:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Rates far below market:</strong> If a broker consistently offers 20-30% below market, they're either padding their margin excessively or the shipper is a problem account.</li>
        <li style={liStyle}><strong>"The rate is the rate" on every load:</strong> Good brokers negotiate. If they refuse to budge on anything, ever, they likely don't value the carrier relationship.</li>
        <li style={liStyle}><strong>Vague detention policies:</strong> If they can't clearly explain when detention starts and what it pays, expect to sit for free.</li>
        <li style={liStyle}><strong>Pressure to book immediately:</strong> "This load will be gone in 5 minutes" is a classic high-pressure tactic. Good loads do move fast, but legitimate urgency doesn't require bullying.</li>
        <li style={liStyle}><strong>Bad credit or payment history:</strong> Check the broker's credit score on services like Carrier411 or TransCredit. A broker who doesn't pay isn't worth any rate.</li>
        <li style={liStyle}><strong>Changing terms after booking:</strong> If the rate, pickup time, or delivery requirements change after you've confirmed, that's a pattern that will continue. Address it immediately or move on.</li>
      </ul>

      <h2 id="qivori-rates" style={h2Style}>How Qivori Helps You Negotiate Better</h2>
      <p style={pStyle}>
        Qivori AI's Rate Intelligence gives you real-time ammunition for every negotiation:
      </p>
      <ul style={ulStyle}>
        <li style={liStyle}><strong>Lane rate benchmarks:</strong> See the average, high, and low rates for any lane in the last 7, 14, and 30 days. Know exactly where the market stands before you pick up the phone.</li>
        <li style={liStyle}><strong>Broker score cards:</strong> Qivori tracks broker payment reliability, average days-to-pay, and rate fairness. Know who you're dealing with before you book.</li>
        <li style={liStyle}><strong>Cost-per-mile calculator:</strong> Input your specific costs and Qivori tells you the minimum rate per mile you need. No more guessing whether a load is profitable.</li>
        <li style={liStyle}><strong>AI-powered rate predictions:</strong> Our machine learning model predicts rate movements 1-2 weeks out, so you know whether to book now or wait for rates to climb.</li>
      </ul>

      <ShareButtons title="How to Negotiate Freight Rates: Scripts & Strategies" />
    </ArticleLayout>
  )
}
