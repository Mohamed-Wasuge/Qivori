import { jsPDF } from 'jspdf'

// Global company info — set by CarrierContext for PDF generation
let _cachedCompany = null
export function setInvoiceCompany(company) { _cachedCompany = company }

// ── Invoice PDF ────────────────────────────────────────────────────────────────
export function generateInvoicePDF(invoice) {
  // Fix Unicode arrow for PDF (helvetica can't render →)
  if (invoice.route) invoice = { ...invoice, route: invoice.route.replace(/→/g, 'to') }

  // Auto-inject company info if not provided
  if (_cachedCompany && !invoice.companyName) {
    invoice = {
      ...invoice,
      companyName: _cachedCompany.name || _cachedCompany.company_name || '',
      companyMC: _cachedCompany.mc ? `MC# ${_cachedCompany.mc}` : '',
      companyDOT: _cachedCompany.dot ? `DOT# ${_cachedCompany.dot}` : '',
      companyEmail: _cachedCompany.email || '',
      companyPhone: _cachedCompany.phone || '',
      companyAddress: _cachedCompany.address || '',
    }
  }
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const gold  = [240, 165, 0]
  const dark  = [7, 9, 14]
  const gray  = [120, 130, 150]
  const light = [240, 242, 248]
  const W = 612, PAD = 50

  // Background
  doc.setFillColor(...dark)
  doc.rect(0, 0, W, 792, 'F')

  // Header bar
  doc.setFillColor(...gold)
  doc.rect(0, 0, W, 5, 'F')

  // Company name or Qivori logo
  const companyName = invoice.companyName || ''
  doc.setFont('helvetica', 'bold')
  if (companyName) {
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text(companyName, PAD, 58)
    let subY = 72
    if (invoice.companyMC || invoice.companyDOT) {
      doc.setFontSize(9)
      doc.setTextColor(...gray)
      doc.text([invoice.companyMC, invoice.companyDOT].filter(Boolean).join(' · '), PAD, subY)
      subY += 12
    }
    if (invoice.companyEmail || invoice.companyPhone) {
      doc.setFontSize(8)
      doc.setTextColor(...gray)
      doc.text([invoice.companyEmail, invoice.companyPhone].filter(Boolean).join(' · '), PAD, subY)
    }
  } else {
    doc.setFontSize(26)
    doc.setTextColor(...gold)
    doc.text('QI', PAD, 60)
    const logoW = doc.getTextWidth('QI')
    doc.setTextColor(255, 255, 255)
    doc.text('VORI', PAD + logoW, 60)
    doc.setFontSize(9)
    doc.setTextColor(...gray)
    doc.text('AI-POWERED TMS', PAD, 74)
  }

  // INVOICE label
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(32)
  doc.setTextColor(...gold)
  doc.text('INVOICE', W - PAD, 60, { align: 'right' })
  doc.setFontSize(10)
  doc.setTextColor(...gray)
  doc.text(invoice.id || 'INV-000', W - PAD, 76, { align: 'right' })

  // Divider
  doc.setDrawColor(...gold)
  doc.setLineWidth(0.5)
  doc.line(PAD, 90, W - PAD, 90)

  // Bill to / Invoice info
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...gray)
  doc.text('BILL TO', PAD, 112)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.text(invoice.broker || '—', PAD, 128)
  doc.setFontSize(9)
  doc.setTextColor(...gray)
  doc.text('Freight Broker', PAD, 142)

  // Invoice meta (right side)
  const meta = [
    ['Invoice Date', invoice.date || '—'],
    ['Due Date',     invoice.dueDate || '—'],
    ['Load ID',      invoice.loadId || '—'],
    ['Route',        invoice.route || '—'],
    ['Driver',       invoice.driver || '—'],
  ]
  let mY = 112
  meta.forEach(([label, val]) => {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...gray)
    doc.text(label.toUpperCase(), W - PAD - 120, mY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.text(String(val), W - PAD, mY, { align: 'right' })
    mY += 16
  })

  // Line item table header
  const tY = 190
  doc.setFillColor(20, 24, 34)
  doc.rect(PAD, tY, W - PAD*2, 26, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...gray)
  doc.text('DESCRIPTION', PAD + 10, tY + 17)
  doc.text('AMOUNT', W - PAD - 10, tY + 17, { align: 'right' })

  // Line item row
  doc.setFillColor(15, 18, 26)
  doc.rect(PAD, tY + 26, W - PAD*2, 36, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(`Freight services — ${invoice.route || ''}`, PAD + 10, tY + 47)
  doc.setFontSize(9)
  doc.setTextColor(...gray)
  doc.text(`Load ${invoice.loadId || ''} · ${invoice.broker || ''}`, PAD + 10, tY + 60)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...gold)
  doc.text(`$${(invoice.amount || 0).toLocaleString()}`, W - PAD - 10, tY + 52, { align: 'right' })

  // Total box
  const totY = tY + 80
  doc.setFillColor(...gold)
  doc.rect(W - PAD - 180, totY, 180, 50, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...dark)
  doc.text('TOTAL DUE', W - PAD - 10, totY + 18, { align: 'right' })
  doc.setFontSize(22)
  doc.text(`$${(invoice.amount || 0).toLocaleString()}`, W - PAD - 10, totY + 40, { align: 'right' })

  // Status badge
  if (invoice.status) {
    const statusColors = { Unpaid: [239, 68, 68], Factored: [77, 142, 240], Paid: [34, 197, 94] }
    const sc = statusColors[invoice.status] || gray
    doc.setFillColor(...sc)
    doc.roundedRect(PAD, totY + 8, 80, 26, 4, 4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(invoice.status.toUpperCase(), PAD + 40, totY + 25, { align: 'center' })
  }

  // Same Day Pay / QuickPay notice
  const isSameDay = invoice.paymentTerms === 'Same Day Pay' || invoice.dueDate === 'Same Day'
  if (isSameDay) {
    const sdY = totY + 70
    doc.setFillColor(240, 165, 0)
    doc.rect(PAD, sdY, W - PAD*2, 28, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...dark)
    doc.text('SAME DAY PAY — QUICKPAY (2.5% FEE APPLIED)', W/2, sdY + 18, { align: 'center' })
  }

  // Payment instructions
  const piY = totY + (isSameDay ? 115 : 150)
  doc.setFillColor(15, 18, 26)
  doc.rect(PAD, piY, W - PAD*2, 90, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...gold)
  doc.text('PAYMENT INSTRUCTIONS', PAD + 14, piY + 18)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('ACH / Wire Transfer  ·  Routing: 021000021  ·  Account: 4892810043', PAD + 14, piY + 34)
  doc.text(isSameDay ? 'Same Day Pay requested — 2.5% QuickPay fee applied' : 'QuickPay available via Qivori portal — 2.5% factoring fee', PAD + 14, piY + 49)
  doc.setTextColor(...gray)
  doc.setFontSize(8)
  doc.text(isSameDay ? 'Payment due immediately upon receipt.' : `Payment due by ${invoice.dueDate || '—'}. Late payments subject to 1.5%/month finance charge.`, PAD + 14, piY + 65)

  // Footer
  doc.setDrawColor(...gold)
  doc.setLineWidth(0.5)
  doc.line(PAD, 740, W - PAD, 740)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...gray)
  doc.text(companyName ? `${companyName} · Powered by Qivori AI` : 'Qivori AI · qivori.com · support@qivori.com', W/2, 756, { align: 'center' })
  doc.text('Generated by Qivori AI', W/2, 768, { align: 'center' })

  doc.save(`${invoice.id || 'invoice'}-Qivori.pdf`)
}

// ── Settlement PDF ─────────────────────────────────────────────────────────────
export function generateSettlementPDF(driver, loads, period = 'Mar 1–15, 2026', options = {}) {
  const { payModel, payRate, deductions = [], totalDeductions = 0, netPay, driverPay } = options
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const gold = [240, 165, 0]
  const dark = [7, 9, 14]
  const gray = [120, 130, 150]
  const green = [34, 197, 94]
  const red = [239, 68, 68]
  const W = 612, PAD = 50

  doc.setFillColor(...dark)
  doc.rect(0, 0, W, 792, 'F')
  doc.setFillColor(...gold)
  doc.rect(0, 0, W, 5, 'F')

  // Header — company name or Qivori
  const companyName = _cachedCompany?.name || _cachedCompany?.company_name || ''
  doc.setFont('helvetica', 'bold')
  if (companyName) {
    doc.setFontSize(20)
    doc.setTextColor(255, 255, 255)
    doc.text(companyName, PAD, 55)
    if (_cachedCompany?.mc || _cachedCompany?.dot) {
      doc.setFontSize(8)
      doc.setTextColor(...gray)
      doc.text([_cachedCompany.mc ? `MC# ${_cachedCompany.mc}` : '', _cachedCompany.dot ? `DOT# ${_cachedCompany.dot}` : ''].filter(Boolean).join(' · '), PAD, 68)
    }
  } else {
    doc.setFontSize(20)
    doc.setTextColor(...gold)
    doc.text('QI', PAD, 55)
    const lw = doc.getTextWidth('QI')
    doc.setTextColor(255, 255, 255)
    doc.text('VORI', PAD + lw, 55)
  }
  doc.setFontSize(22)
  doc.setTextColor(...gold)
  doc.text('SETTLEMENT', W - PAD, 55, { align: 'right' })

  doc.setDrawColor(...gold)
  doc.setLineWidth(0.5)
  doc.line(PAD, 75, W - PAD, 75)

  // Driver info + pay model
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...gray)
  doc.text('DRIVER', PAD, 95)
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(driver, PAD, 112)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...gray)
  doc.text(`Period: ${period}`, PAD, 126)
  if (payModel) {
    const payLabel = payModel === 'percent' ? `${payRate || 28}% of gross` : payModel === 'permile' ? `$${Number(payRate||0).toFixed(2)}/mile` : `$${payRate} per load`
    doc.text(`Pay Model: ${payLabel}`, PAD, 140)
  }

  // Summary KPIs (right side)
  const totalMiles = loads.reduce((s, l) => s + (Number(l.miles) || 0), 0)
  const totalGross = loads.reduce((s, l) => s + (Number(l.gross) || 0), 0)
  const meta = [
    ['Loads', String(loads.length)],
    ['Total Miles', totalMiles.toLocaleString()],
    ['Gross Revenue', `$${totalGross.toLocaleString()}`],
  ]
  let mY = 95
  meta.forEach(([label, val]) => {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...gray)
    doc.text(label.toUpperCase(), W - PAD - 100, mY)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.text(val, W - PAD, mY, { align: 'right' })
    mY += 16
  })

  // Loads table
  let tY = 155
  doc.setFillColor(20, 24, 34)
  doc.rect(PAD, tY, W - PAD*2, 26, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...gray)
  doc.text('LOAD ID', PAD + 10, tY + 17)
  doc.text('ROUTE', PAD + 90, tY + 17)
  doc.text('MILES', PAD + 280, tY + 17)
  doc.text('GROSS', PAD + 340, tY + 17)
  doc.text('DRIVER PAY', W - PAD - 10, tY + 17, { align: 'right' })

  tY += 26
  let totalPay = 0
  loads.forEach((load, idx) => {
    if (tY > 620) return // prevent overflow
    doc.setFillColor(idx % 2 === 0 ? 15 : 18, idx % 2 === 0 ? 18 : 22, idx % 2 === 0 ? 26 : 32)
    doc.rect(PAD, tY, W - PAD*2, 28, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...gold)
    const loadId = String(load.id || '').replace(/→/g, 'to')
    doc.text(loadId.slice(0, 12), PAD + 10, tY + 18)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    const route = String(load.route || '').replace(/→/g, 'to')
    doc.text(route.slice(0, 28), PAD + 90, tY + 18)
    doc.setTextColor(...gray)
    doc.text(String(load.miles || 0), PAD + 280, tY + 18)
    doc.text(`$${(load.gross || 0).toLocaleString()}`, PAD + 340, tY + 18)
    const pay = load.pay || Math.round((load.gross || 0) * 0.28)
    totalPay += pay
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(`$${pay.toLocaleString()}`, W - PAD - 10, tY + 18, { align: 'right' })
    tY += 28
  })

  // Deductions section
  if (deductions.length > 0) {
    tY += 10
    doc.setFillColor(20, 24, 34)
    doc.rect(PAD, tY, W - PAD*2, 22, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text('DEDUCTIONS', PAD + 10, tY + 15)
    doc.text('AMOUNT', W - PAD - 10, tY + 15, { align: 'right' })
    tY += 22
    deductions.forEach((d, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 15 : 18, idx % 2 === 0 ? 18 : 22, idx % 2 === 0 ? 26 : 32)
      doc.rect(PAD, tY, W - PAD*2, 24, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(255, 255, 255)
      doc.text(d.label || 'Deduction', PAD + 10, tY + 16)
      doc.setTextColor(...red)
      doc.setFont('helvetica', 'bold')
      doc.text(`-$${Number(d.amount || 0).toFixed(2)}`, W - PAD - 10, tY + 16, { align: 'right' })
      tY += 24
    })
  }

  // Totals section
  tY += 12
  const calcDriverPay = driverPay || totalPay
  const calcNet = netPay != null ? netPay : calcDriverPay - totalDeductions

  // Gross pay line
  doc.setFillColor(20, 24, 34)
  doc.rect(PAD, tY, W - PAD*2, 28, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('Gross Driver Pay', PAD + 10, tY + 18)
  doc.setTextColor(...gold)
  doc.text(`$${calcDriverPay.toLocaleString(undefined, {minimumFractionDigits:2})}`, W - PAD - 10, tY + 18, { align: 'right' })
  tY += 28

  if (totalDeductions > 0) {
    doc.setFillColor(20, 24, 34)
    doc.rect(PAD, tY, W - PAD*2, 28, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('Total Deductions', PAD + 10, tY + 18)
    doc.setTextColor(...red)
    doc.text(`-$${totalDeductions.toLocaleString(undefined, {minimumFractionDigits:2})}`, W - PAD - 10, tY + 18, { align: 'right' })
    tY += 28
  }

  // Net pay box
  tY += 4
  doc.setFillColor(...gold)
  doc.rect(W - PAD - 200, tY, 200, 48, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...dark)
  doc.text('NET PAY', W - PAD - 10, tY + 16, { align: 'right' })
  doc.setFontSize(22)
  doc.text(`$${calcNet.toLocaleString(undefined, {minimumFractionDigits:2})}`, W - PAD - 10, tY + 40, { align: 'right' })

  // Payment method label (left of net box)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...gray)
  doc.text('Payment via Direct Deposit / ACH', PAD, tY + 30)

  // Footer
  doc.setDrawColor(...gold)
  doc.setLineWidth(0.5)
  doc.line(PAD, 740, W - PAD, 740)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...gray)
  doc.text(companyName ? `${companyName} · Powered by Qivori AI` : 'Qivori AI · qivori.com', W/2, 752, { align: 'center' })
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', {month:'long',day:'numeric',year:'numeric'})}`, W/2, 764, { align: 'center' })

  doc.save(`Settlement-${driver.replace(/\s+/g, '-')}-${period.replace(/[·\s,]/g, '-')}.pdf`)
}

// ── IFTA PDF ───────────────────────────────────────────────────────────────────
export function generateIFTAPDF(quarter, stateData, totalMiles, totalFuel, netOwed) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const gold = [240, 165, 0]
  const dark = [7, 9, 14]
  const gray = [120, 130, 150]
  const W = 612, PAD = 50

  doc.setFillColor(...dark)
  doc.rect(0, 0, W, 792, 'F')
  doc.setFillColor(...gold)
  doc.rect(0, 0, W, 5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...gold)
  doc.text('QIVORI', PAD, 55)
  doc.setFontSize(20)
  doc.setTextColor(255, 255, 255)
  doc.text(`IFTA ${quarter} RETURN`, W - PAD, 55, { align: 'right' })

  doc.setDrawColor(...gold)
  doc.setLineWidth(0.5)
  doc.line(PAD, 70, W - PAD, 70)

  // Summary KPIs
  const kpis = [
    ['Total Miles', totalMiles.toLocaleString()],
    ['Total Gallons', totalFuel.toFixed(1)],
    ['Net Tax Owed', netOwed < 0 ? `($${Math.abs(netOwed).toFixed(2)} REFUND)` : `$${netOwed.toFixed(2)}`],
  ]
  let kX = PAD
  kpis.forEach(([label, val]) => {
    doc.setFillColor(15, 18, 26)
    doc.rect(kX, 90, 160, 60, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text(label.toUpperCase(), kX + 10, 107)
    doc.setFontSize(16)
    doc.setTextColor(netOwed < 0 && label.includes('Tax') ? [34,197,94] : gold)
    doc.text(String(val), kX + 10, 135)
    kX += 170
  })

  // State table
  let tY = 175
  doc.setFillColor(20, 24, 34)
  doc.rect(PAD, tY, W - PAD*2, 26, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...gray)
  doc.text('STATE', PAD + 10, tY + 17)
  doc.text('MILES', PAD + 100, tY + 17)
  doc.text('GALLONS USED', PAD + 180, tY + 17)
  doc.text('TAX RATE', PAD + 300, tY + 17)
  doc.text('TAX DUE', PAD + 380, tY + 17)
  doc.text('NET', W - PAD - 10, tY + 17, { align: 'right' })

  tY += 26
  stateData.forEach((row, idx) => {
    doc.setFillColor(idx % 2 === 0 ? 15 : 18, idx % 2 === 0 ? 18 : 22, idx % 2 === 0 ? 26 : 32)
    doc.rect(PAD, tY, W - PAD*2, 28, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...gold)
    doc.text(row.state || '', PAD + 10, tY + 18)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 255, 255)
    doc.text(String(row.miles || 0), PAD + 100, tY + 18)
    doc.text((row.gallons || 0).toFixed(1), PAD + 180, tY + 18)
    doc.text(`$${(row.rate || 0).toFixed(3)}`, PAD + 300, tY + 18)
    doc.text(`$${(row.taxDue || 0).toFixed(2)}`, PAD + 380, tY + 18)
    const net = row.net || 0
    doc.setTextColor(net < 0 ? [34,197,94] : [239,68,68])
    doc.setFont('helvetica', 'bold')
    doc.text(`${net < 0 ? '-' : '+'}$${Math.abs(net).toFixed(2)}`, W - PAD - 10, tY + 18, { align: 'right' })
    tY += 28
  })

  doc.setDrawColor(...gold)
  doc.setLineWidth(0.5)
  doc.line(PAD, 740, W - PAD, 740)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...gray)
  doc.text('Qivori AI TMS · IFTA Return · Not a substitute for official filing', W/2, 756, { align: 'center' })

  doc.save(`IFTA-${quarter.replace(/\s/g,'-')}-Qivori.pdf`)
}
