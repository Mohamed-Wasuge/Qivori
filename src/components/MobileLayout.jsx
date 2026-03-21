import { CarrierProvider } from '../context/CarrierContext'
import MobileShell from './mobile/MobileShell'

export default function MobileLayout() {
  return (
    <CarrierProvider>
      <MobileShell />
    </CarrierProvider>
  )
}
