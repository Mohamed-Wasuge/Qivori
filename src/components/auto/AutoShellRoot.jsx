/**
 * AutoShellRoot — lazy entry point that wraps AutoShell in CarrierProvider
 *
 * Why this exists: importing CarrierProvider directly into App.jsx pulls
 * the entire CarrierContext (~490KB) into the main bundle, even for users
 * who never see AutoShell. By lazy-loading this wrapper, the heavy
 * CarrierContext + AutoShell tree only loads when the user actually
 * needs the autonomous experience.
 */
import { CarrierProvider } from '../../context/CarrierContext'
import AutoShell from './AutoShell'

export default function AutoShellRoot() {
  return (
    <CarrierProvider>
      <AutoShell />
    </CarrierProvider>
  )
}
