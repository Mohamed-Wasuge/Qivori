import { lazy } from 'react'

// Lazy-load domain modules
export const lazyN = (importFn, name) => lazy(() => importFn().then(m => ({ default: m[name] })))

// Drivers
export const DriverProfiles = lazyN(() => import('../../../pages/carrier/DriverScorecard'), 'DriverProfiles')
export const DriverOnboarding = lazyN(() => import('../../../pages/carrier/DriverScorecard'), 'DriverOnboarding')
export const DriverScorecard = lazyN(() => import('../../../pages/carrier/DriverScorecard'), 'DriverScorecard')

// Compliance
export const CarrierIFTA = lazyN(() => import('../../../pages/carrier/Compliance'), 'CarrierIFTA')
export const CarrierDVIR = lazyN(() => import('../../../pages/carrier/Compliance'), 'CarrierDVIR')
export const CarrierClearinghouse = lazyN(() => import('../../../pages/carrier/Compliance'), 'CarrierClearinghouse')
export const AuditToday = lazyN(() => import('../../../pages/carrier/Compliance'), 'AuditToday')

// Fleet
export const FleetMap = lazyN(() => import('../../../pages/carrier/FleetMapGoogle'), 'FleetMapGoogle')
export const FleetManager = lazyN(() => import('../../../pages/carrier/Fleet'), 'FleetManager')
export const FuelOptimizer = lazyN(() => import('../../../pages/carrier/Fleet'), 'FuelOptimizer')
export const EquipmentManager = lazyN(() => import('../../../pages/carrier/Fleet'), 'EquipmentManager')

// Finance
export const BrokerRiskIntel = lazyN(() => import('../../../pages/carrier/Finance'), 'BrokerRiskIntel')
export const ExpenseTracker = lazyN(() => import('../../../pages/carrier/Finance'), 'ExpenseTracker')
export const FactoringCashflow = lazyN(() => import('../../../pages/carrier/Finance'), 'FactoringCashflow')
export const CashFlowForecaster = lazyN(() => import('../../../pages/carrier/Finance'), 'CashFlowForecaster')
export const PLDashboard = lazyN(() => import('../../../pages/carrier/Finance'), 'PLDashboard')
export const ReceivablesAging = lazyN(() => import('../../../pages/carrier/Finance'), 'ReceivablesAging')
export const AccountsPayable = lazyN(() => import('../../../pages/carrier/Finance'), 'AccountsPayable')
export const QuickBooksExport = lazyN(() => import('../../../pages/carrier/Finance'), 'QuickBooksExport')
export const InvoicesHub = lazyN(() => import('../../../pages/carrier/Finance'), 'InvoicesHub')

// HR
export const DQFileManager = lazyN(() => import('../../../pages/carrier/HR'), 'DQFileManager')
export const ExpiryAlerts = lazyN(() => import('../../../pages/carrier/HR'), 'ExpiryAlerts')
export const DrugAlcoholCompliance = lazyN(() => import('../../../pages/carrier/HR'), 'DrugAlcoholCompliance')
export const IncidentTracker = lazyN(() => import('../../../pages/carrier/HR'), 'IncidentTracker')
export const PayrollTracker = lazyN(() => import('../../../pages/carrier/HR'), 'PayrollTracker')
export const HiringPipeline = lazyN(() => import('../../../pages/carrier/HR'), 'HiringPipeline')
export const DriverContracts = lazyN(() => import('../../../pages/carrier/HR'), 'DriverContracts')

// EDI
export const EDIDashboard = lazyN(() => import('../../../pages/carrier/EDIDashboard'), 'EDIDashboard')
