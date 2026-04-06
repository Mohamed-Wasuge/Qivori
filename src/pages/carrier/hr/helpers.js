// HR shared constants and helpers

export const DQ_DOC_TYPES = [
  { id: 'cdl',                label: 'CDL / License',           required: true,  hasExpiry: true },
  { id: 'medical_card',       label: 'Medical Card (DOT)',      required: true,  hasExpiry: true },
  { id: 'mvr',                label: 'Motor Vehicle Record',    required: true,  hasExpiry: true },
  { id: 'employment_history', label: 'Employment History (10yr)', required: true, hasExpiry: false },
  { id: 'road_test',          label: 'Road Test Certificate',   required: true,  hasExpiry: false },
  { id: 'annual_review',      label: 'Annual Review of Record', required: true,  hasExpiry: true },
  { id: 'drug_pre_employment',label: 'Pre-Employment Drug Test',required: true,  hasExpiry: false },
  { id: 'background_check',   label: 'Background Check',        required: true,  hasExpiry: false },
  { id: 'application',        label: 'Driver Application',      required: true,  hasExpiry: false },
  { id: 'ssp_certification',  label: 'SSP / Entry-Level Training', required: false, hasExpiry: false },
  { id: 'hazmat_endorsement', label: 'Hazmat Endorsement',      required: false, hasExpiry: true },
  { id: 'twic_card',          label: 'TWIC Card',               required: false, hasExpiry: true },
  { id: 'insurance',          label: 'Insurance Certificate',   required: false, hasExpiry: true },
  { id: 'w9',                 label: 'W-9 Form',                required: false, hasExpiry: false },
  { id: 'direct_deposit',     label: 'Direct Deposit Form',     required: false, hasExpiry: false },
  { id: 'offer_letter',       label: 'Offer Letter',            required: false, hasExpiry: false },
  { id: 'other',              label: 'Other Document',          required: false, hasExpiry: false },
]

export const DOC_STATUS_COLORS = {
  valid:         { bg: 'rgba(34,197,94,0.1)',  color: 'var(--success)', label: 'Valid' },
  expiring_soon: { bg: 'rgba(240,165,0,0.1)',  color: 'var(--accent)',  label: 'Expiring Soon' },
  expired:       { bg: 'rgba(239,68,68,0.1)',  color: 'var(--danger)',  label: 'Expired' },
  pending:       { bg: 'rgba(77,142,240,0.1)', color: 'var(--accent3)', label: 'Pending' },
  rejected:      { bg: 'rgba(239,68,68,0.1)',  color: 'var(--danger)',  label: 'Rejected' },
}

export function getExpiryStatus(expiryDate) {
  if (!expiryDate) return 'valid'
  const days = Math.floor((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring_soon'
  return 'valid'
}

export const inp = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', outline:'none' }
