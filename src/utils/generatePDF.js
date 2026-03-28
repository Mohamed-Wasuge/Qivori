import { jsPDF } from 'jspdf'

// Global company info — set by CarrierContext for PDF generation
let _cachedCompany = null
let _cachedLogoData = null // preloaded logo as data URL
export function setInvoiceCompany(company) {
  _cachedCompany = company
  // Preload logo image for PDF use
  if (company?.logo && company.logo !== _cachedLogoData?.src) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        _cachedLogoData = { src: company.logo, dataUrl: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
      } catch { _cachedLogoData = null }
    }
    img.onerror = () => { _cachedLogoData = null }
    img.src = company.logo
  } else if (!company?.logo) {
    _cachedLogoData = null
  }
}

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
  const accent = [26, 54, 93]      // deep navy
  const black  = [17, 24, 39]
  const gray   = [107, 114, 128]
  const lgray  = [156, 163, 175]
  const border = [229, 231, 235]
  const white  = [255, 255, 255]
  const W = 612, PAD = 50

  // Background — clean white
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, W, 792, 'F')

  // Top accent bar
  doc.setFillColor(...accent)
  doc.rect(0, 0, W, 4, 'F')

  // Company logo + name
  const companyName = invoice.companyName || ''
  let logoOffset = 0
  if (_cachedLogoData?.dataUrl) {
    try {
      const maxH = 40, maxW = 100
      const ratio = _cachedLogoData.w / _cachedLogoData.h
      let imgW = maxH * ratio, imgH = maxH
      if (imgW > maxW) { imgW = maxW; imgH = maxW / ratio }
      doc.addImage(_cachedLogoData.dataUrl, 'PNG', PAD, 22, imgW, imgH)
      logoOffset = imgW + 12
    } catch { logoOffset = 0 }
  }

  doc.setFont('helvetica', 'bold')
  if (companyName) {
    doc.setFontSize(20)
    doc.setTextColor(...black)
    doc.text(companyName, PAD + logoOffset, 52)
    let subY = 66
    if (invoice.companyMC || invoice.companyDOT) {
      doc.setFontSize(9)
      doc.setTextColor(...gray)
      doc.text([invoice.companyMC, invoice.companyDOT].filter(Boolean).join('  |  '), PAD + logoOffset, subY)
      subY += 13
    }
    if (invoice.companyAddress) {
      doc.setFontSize(8)
      doc.setTextColor(...gray)
      doc.text(invoice.companyAddress, PAD + logoOffset, subY)
      subY += 12
    }
    if (invoice.companyEmail || invoice.companyPhone) {
      doc.setFontSize(8)
      doc.setTextColor(...gray)
      doc.text([invoice.companyEmail, invoice.companyPhone].filter(Boolean).join('  |  '), PAD + logoOffset, subY)
    }
  } else {
    doc.setFontSize(24)
    doc.setTextColor(...accent)
    doc.text('QIVORI', PAD + logoOffset, 54)
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text('AI-POWERED TMS', PAD + logoOffset, 66)
  }

  // INVOICE label (right)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(...accent)
  doc.text('INVOICE', W - PAD, 52, { align: 'right' })
  doc.setFontSize(10)
  doc.setTextColor(...gray)
  doc.text(invoice.id || 'INV-000', W - PAD, 68, { align: 'right' })

  // Divider line
  doc.setDrawColor(...border)
  doc.setLineWidth(1)
  doc.line(PAD, 95, W - PAD, 95)

  // Bill To section
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...lgray)
  doc.text('BILL TO', PAD, 118)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...black)
  doc.setFontSize(14)
  doc.text(invoice.broker || '—', PAD, 136)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...gray)
  doc.text('Freight Broker', PAD, 150)

  // Factoring company (if set)
  const factorName = _cachedCompany?.factoring_company || invoice.factoringCompany || ''
  if (factorName && factorName !== "I don't use factoring") {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...lgray)
    doc.text('REMIT PAYMENT TO', PAD, 170)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...black)
    doc.setFontSize(11)
    doc.text(factorName, PAD, 184)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...gray)
    doc.text(_cachedCompany?.factoring_email || '', PAD, 196)
  }

  // Invoice meta (right side)
  const meta = [
    ['Invoice Date', invoice.date || '—'],
    ['Due Date',     invoice.dueDate || '—'],
    ['Load ID',      invoice.loadId || '—'],
    ['Route',        invoice.route || '—'],
    ['Driver',       invoice.driver || '—'],
  ]
  let mY = 118
  meta.forEach(([label, val]) => {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...lgray)
    doc.text(label.toUpperCase(), W - PAD - 130, mY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...black)
    doc.setFontSize(9)
    doc.text(String(val), W - PAD, mY, { align: 'right' })
    mY += 16
  })

  // Line item table header
  const tY = 200
  doc.setFillColor(248, 250, 252)
  doc.rect(PAD, tY, W - PAD*2, 28, 'F')
  doc.setDrawColor(...border)
  doc.setLineWidth(0.5)
  doc.line(PAD, tY + 28, W - PAD, tY + 28)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...lgray)
  doc.text('DESCRIPTION', PAD + 12, tY + 18)
  doc.text('AMOUNT', W - PAD - 12, tY + 18, { align: 'right' })

  // Line item row
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...black)
  doc.text(`Freight services — ${invoice.route || ''}`, PAD + 12, tY + 50)
  doc.setFontSize(9)
  doc.setTextColor(...gray)
  doc.text(`Load ${invoice.loadId || ''} · ${invoice.broker || ''}`, PAD + 12, tY + 64)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...accent)
  doc.text(`$${(invoice.amount || 0).toLocaleString()}`, W - PAD - 12, tY + 55, { align: 'right' })

  // Bottom divider for line items
  doc.setDrawColor(...border)
  doc.line(PAD, tY + 76, W - PAD, tY + 76)

  // Total box
  const totY = tY + 96
  doc.setFillColor(...accent)
  doc.roundedRect(W - PAD - 190, totY, 190, 52, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(200, 210, 230)
  doc.text('TOTAL DUE', W - PAD - 14, totY + 18, { align: 'right' })
  doc.setFontSize(22)
  doc.setTextColor(...white)
  doc.text(`$${(invoice.amount || 0).toLocaleString()}`, W - PAD - 14, totY + 42, { align: 'right' })

  // Status badge
  if (invoice.status) {
    const statusColors = { Unpaid: [220, 38, 38], Factored: [37, 99, 235], Paid: [22, 163, 74] }
    const sc = statusColors[invoice.status] || gray
    doc.setFillColor(...sc)
    doc.roundedRect(PAD, totY + 10, 82, 28, 4, 4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...white)
    doc.text(invoice.status.toUpperCase(), PAD + 41, totY + 28, { align: 'center' })
  }

  // Same Day Pay / QuickPay notice
  const isSameDay = invoice.paymentTerms === 'Same Day Pay' || invoice.dueDate === 'Same Day'
  if (isSameDay) {
    const sdY = totY + 68
    doc.setFillColor(254, 243, 199)
    doc.roundedRect(PAD, sdY, W - PAD*2, 28, 4, 4, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(146, 64, 14)
    doc.text('SAME DAY PAY — QUICKPAY (2.5% FEE APPLIED)', W/2, sdY + 18, { align: 'center' })
  }

  // Payment instructions
  const piY = totY + (isSameDay ? 112 : 80)
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(PAD, piY, W - PAD*2, 90, 4, 4, 'F')
  doc.setDrawColor(...border)
  doc.roundedRect(PAD, piY, W - PAD*2, 90, 4, 4, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...accent)
  doc.text('PAYMENT INSTRUCTIONS', PAD + 14, piY + 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...black)
  doc.text('ACH / Wire Transfer  ·  Routing: 021000021  ·  Account: 4892810043', PAD + 14, piY + 38)
  doc.text(isSameDay ? 'Same Day Pay requested — 2.5% QuickPay fee applied' : 'QuickPay available via Qivori portal — 2.5% factoring fee', PAD + 14, piY + 54)
  doc.setTextColor(...gray)
  doc.setFontSize(8)
  doc.text(isSameDay ? 'Payment due immediately upon receipt.' : `Payment due by ${invoice.dueDate || '—'}. Late payments subject to 1.5%/month finance charge.`, PAD + 14, piY + 72)

  // Footer
  doc.setDrawColor(...border)
  doc.setLineWidth(0.5)
  doc.line(PAD, 740, W - PAD, 740)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...lgray)
  doc.text(companyName ? `${companyName}  |  Powered by Qivori AI` : 'Qivori AI  |  qivori.com  |  support@qivori.com', W/2, 755, { align: 'center' })

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

  // Header — company logo + name
  const companyName = _cachedCompany?.name || _cachedCompany?.company_name || ''
  let sLogoOffset = 0
  if (_cachedLogoData?.dataUrl) {
    try {
      const maxH = 36, maxW = 90
      const ratio = _cachedLogoData.w / _cachedLogoData.h
      let imgW = maxH * ratio, imgH = maxH
      if (imgW > maxW) { imgW = maxW; imgH = maxW / ratio }
      doc.addImage(_cachedLogoData.dataUrl, 'PNG', PAD, 20, imgW, imgH)
      sLogoOffset = imgW + 12
    } catch { sLogoOffset = 0 }
  }

  doc.setFont('helvetica', 'bold')
  if (companyName) {
    doc.setFontSize(20)
    doc.setTextColor(255, 255, 255)
    doc.text(companyName, PAD + sLogoOffset, 55)
    if (_cachedCompany?.mc || _cachedCompany?.dot) {
      doc.setFontSize(8)
      doc.setTextColor(...gray)
      doc.text([_cachedCompany.mc ? `MC# ${_cachedCompany.mc}` : '', _cachedCompany.dot ? `DOT# ${_cachedCompany.dot}` : ''].filter(Boolean).join(' · '), PAD + sLogoOffset, 68)
    }
  } else {
    doc.setFontSize(20)
    doc.setTextColor(...gold)
    doc.text('QI', PAD + sLogoOffset, 55)
    const lw = doc.getTextWidth('QI')
    doc.setTextColor(255, 255, 255)
    doc.text('VORI', PAD + sLogoOffset + lw, 55)
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

  let iftaLogoOffset = 0
  if (_cachedLogoData?.dataUrl) {
    try {
      const maxH = 36, maxW = 90
      const ratio = _cachedLogoData.w / _cachedLogoData.h
      let imgW = maxH * ratio, imgH = maxH
      if (imgW > maxW) { imgW = maxW; imgH = maxW / ratio }
      doc.addImage(_cachedLogoData.dataUrl, 'PNG', PAD, 20, imgW, imgH)
      iftaLogoOffset = imgW + 12
    } catch { iftaLogoOffset = 0 }
  }

  const iftaCompany = _cachedCompany?.name || _cachedCompany?.company_name || ''
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  if (iftaCompany) { doc.setTextColor(255, 255, 255) } else { doc.setTextColor(...gold) }
  doc.text(iftaCompany || 'QIVORI', PAD + iftaLogoOffset, 55)
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

// ── 1099-NEC PDF ──────────────────────────────────────────────────────────────
export function generate1099NECPDF(driverInfo, taxYear, compensation) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = 612, H = 792, PAD = 40
  const black = [0, 0, 0]
  const darkGray = [60, 60, 60]
  const lightGray = [200, 200, 200]
  const blue = [0, 0, 180]
  const red = [200, 0, 0]

  // White background
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, W, H, 'F')

  // Top red bar
  doc.setFillColor(...red)
  doc.rect(0, 0, W, 4, 'F')

  // Title section
  let y = 35
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...red)
  doc.text('CORRECTED (if checked)', PAD + 140, y)
  doc.setDrawColor(...black)
  doc.rect(PAD + 120, y - 9, 10, 10)

  doc.setFontSize(8)
  doc.setTextColor(...darkGray)
  doc.text(`Tax Year ${taxYear}`, W - PAD, y, { align: 'right' })

  y += 18
  doc.setFontSize(18)
  doc.setTextColor(...red)
  doc.text('1099-NEC', W / 2, y, { align: 'center' })

  y += 16
  doc.setFontSize(10)
  doc.setTextColor(...black)
  doc.text('Nonemployee Compensation', W / 2, y, { align: 'center' })

  y += 8
  doc.setDrawColor(...black)
  doc.setLineWidth(1.5)
  doc.line(PAD, y, W - PAD, y)

  // Two-column layout
  const colW = (W - PAD * 2 - 20) / 2
  const leftX = PAD
  const rightX = PAD + colW + 20

  // ── PAYER section (left top) ──
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...blue)
  doc.text("PAYER'S name, street address, city or town, state or province,", leftX, y)
  y += 9
  doc.text('country, ZIP or foreign postal code, and telephone no.', leftX, y)

  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...black)
  const payerName = _cachedCompany?.name || _cachedCompany?.company_name || 'Your Company Name'
  doc.text(payerName, leftX, y)
  y += 12
  doc.setFontSize(8)
  const payerAddr = _cachedCompany?.address || ''
  if (payerAddr) { doc.text(payerAddr, leftX, y); y += 10 }
  const payerCity = [_cachedCompany?.city, _cachedCompany?.state, _cachedCompany?.zip].filter(Boolean).join(', ')
  if (payerCity) { doc.text(payerCity, leftX, y); y += 10 }
  const payerPhone = _cachedCompany?.phone || ''
  if (payerPhone) { doc.text('Tel: ' + payerPhone, leftX, y); y += 10 }

  // ── PAYER'S TIN (right top) ──
  let rY = 80
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...blue)
  doc.text("PAYER'S TIN", rightX, rY)
  rY += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...black)
  const payerEin = _cachedCompany?.ein || _cachedCompany?.tax_id || '___-_______'
  doc.text(payerEin, rightX, rY)

  // ── RECIPIENT'S TIN ──
  rY += 22
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...blue)
  doc.text("RECIPIENT'S TIN", rightX, rY)
  rY += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...black)
  doc.text(driverInfo.ssn || '***-**-' + (driverInfo.tax_id_last4 || '****'), rightX, rY)

  // Divider
  y = Math.max(y, rY) + 16
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.5)
  doc.line(PAD, y, W - PAD, y)

  // ── RECIPIENT section ──
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...blue)
  doc.text("RECIPIENT'S name", leftX, y)

  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...black)
  doc.text(driverInfo.name || 'Driver Name', leftX, y)
  y += 14
  doc.setFontSize(8)
  if (driverInfo.address) { doc.text(driverInfo.address, leftX, y); y += 10 }
  if (driverInfo.city || driverInfo.state || driverInfo.zip) {
    doc.text([driverInfo.city, driverInfo.state, driverInfo.zip].filter(Boolean).join(', '), leftX, y)
    y += 10
  }

  // ── Account number ──
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...blue)
  doc.text('Account number (see instructions)', leftX, y)
  y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...black)
  doc.text(driverInfo.account || '', leftX, y)

  // Divider
  y += 16
  doc.setDrawColor(...lightGray)
  doc.line(PAD, y, W - PAD, y)

  // ── BOXES ──
  y += 6
  const boxW = (W - PAD * 2 - 30) / 3
  const boxes = [
    { num: '1', label: 'Nonemployee compensation', value: '$' + Number(compensation).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
    { num: '2', label: 'Payer made direct sales totaling\n$5,000 or more (checkbox)', value: '' },
    { num: '4', label: 'Federal income tax withheld', value: '$0.00' },
  ]

  boxes.forEach((box, i) => {
    const bx = PAD + i * (boxW + 15)
    doc.setDrawColor(...lightGray)
    doc.setLineWidth(1)
    doc.roundedRect(bx, y, boxW, 65, 4, 4)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...blue)
    doc.text(`Box ${box.num}`, bx + 8, y + 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...darkGray)
    const lines = box.label.split('\n')
    lines.forEach((l, li) => doc.text(l, bx + 8, y + 22 + li * 8))

    if (box.value) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(...black)
      doc.text(box.value, bx + boxW / 2, y + 50, { align: 'center' })
    }
  })

  y += 80

  // Box 5-7 row
  const boxes2 = [
    { num: '5', label: 'State tax withheld', value: '$0.00' },
    { num: '6', label: "State/Payer's state no.", value: _cachedCompany?.state || '' },
    { num: '7', label: 'State income', value: '$' + Number(compensation).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
  ]

  boxes2.forEach((box, i) => {
    const bx = PAD + i * (boxW + 15)
    doc.setDrawColor(...lightGray)
    doc.setLineWidth(1)
    doc.roundedRect(bx, y, boxW, 55, 4, 4)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...blue)
    doc.text(`Box ${box.num}`, bx + 8, y + 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...darkGray)
    doc.text(box.label, bx + 8, y + 22)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...black)
    doc.text(box.value, bx + boxW / 2, y + 42, { align: 'center' })
  })

  y += 70

  // Summary section
  doc.setDrawColor(...lightGray)
  doc.setLineWidth(0.5)
  doc.line(PAD, y, W - PAD, y)
  y += 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...black)
  doc.text('Form 1099-NEC', PAD, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`(Rev. January ${taxYear})`, PAD + 80, y)
  doc.text('Department of the Treasury — Internal Revenue Service', W - PAD, y, { align: 'right' })

  y += 18
  doc.setFontSize(8)
  doc.setTextColor(...darkGray)
  doc.text(`This is Copy B — For Recipient's Records.`, PAD, y)
  y += 12
  doc.text('This information is being furnished to the Internal Revenue Service.', PAD, y)
  y += 12
  doc.text('If you are required to file a return, a negligence penalty or other sanction may be imposed on you', PAD, y)
  y += 10
  doc.text('if this income is taxable and the IRS determines that it has not been reported.', PAD, y)

  // Footer
  doc.setDrawColor(...red)
  doc.setLineWidth(2)
  doc.line(0, H - 4, W, H - 4)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text('Generated by Qivori AI TMS — For informational purposes. Verify with your tax professional before filing.', W / 2, H - 14, { align: 'center' })

  doc.save(`1099-NEC-${(driverInfo.name || 'Driver').replace(/\s+/g, '-')}-${taxYear}.pdf`)
}
