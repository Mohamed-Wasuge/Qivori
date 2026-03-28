/**
 * Qivori EDI — Sample X12 Test Data
 * Real-format EDI documents for testing the parser and pipeline.
 */

// ── Sample 204: Simple 2-stop load tender (Chicago → Dallas) ─────────────────

export const SAMPLE_204 = `ISA*00*          *00*          *ZZ*BROKERTEST     *ZZ*QIVORI         *260328*1430*U*00401*000000001*0*P*>~
GS*SM*BROKERTEST*QIVORI*20260328*1430*000000001*X*004010~
ST*204*0001~
B2**QVRI**REF-2026-0328-001**PP~
B2A*00~
L11*BOL-8847231*BM~
L11*PO-55012*PO~
L11*REF-2026-0328-001*SI~
MS3*QVRI*B*CL*TL~
NTE*GEN*Driver must check in at gate. No lumper needed.~
S5*1*CL*24*42000*L~
N1*SH*ABC Manufacturing Co~
N3*1200 Industrial Blvd~
N4*Chicago*IL*60601~
G62*10*20260330*1*0800~
S5*2*UL*24*42000*L~
N1*CN*XYZ Distribution Center~
N3*4500 Commerce Drive~
N4*Dallas*TX*75201~
G62*11*20260401*1*1400~
N1*BT*Apex Freight Solutions~
AT8*G*L*42000*1~
L3*42000****4800.00~
SE*22*0001~
GE*1*000000001~
IEA*1*000000001~`

// ── Sample 204: Multi-stop load (Atlanta → Nashville → Memphis) ──────────────

export const SAMPLE_204_MULTI_STOP = `ISA*00*          *00*          *ZZ*MEGABROKER     *ZZ*QIVORI         *260328*0900*U*00401*000000002*0*P*>~
GS*SM*MEGABROKER*QIVORI*20260328*0900*000000002*X*004010~
ST*204*0002~
B2**QVRI**MULTI-3STOP-001**PP~
B2A*00~
L11*BOL-9901234*BM~
L11*PO-77088*PO~
MS3*QVRI*B*CL*TF~
NTE*GEN*Flatbed required. Tarps provided by shipper. No stack.~
S5*1*CL*12*28000*L~
N1*SH*Southern Steel Works~
N3*800 Peachtree Industrial~
N4*Atlanta*GA*30301~
G62*10*20260329*1*0600~
S5*2*UL*6*14000*L~
N1*CN*Nashville Building Supply~
N3*2200 Broadway Ave~
N4*Nashville*TN*37201~
G62*11*20260329*1*1400~
S5*3*UL*6*14000*L~
N1*CN*Memphis Contractors Inc~
N3*900 Union Ave~
N4*Memphis*TN*38103~
G62*11*20260330*1*1000~
N1*BT*MegaLoad Logistics LLC~
AT8*G*L*28000*2~
L3*28000****3200.00~
SE*26*0002~
GE*1*000000002~
IEA*1*000000002~`

// ── Sample API-format load (for testing JSON/API mode) ───────────────────────

export const SAMPLE_API_LOAD = {
  load_id: 'API-TEST-001',
  broker_name: 'Test Broker LLC',
  broker_email: 'dispatch@testbroker.com',
  broker_phone: '555-123-4567',
  origin: 'Los Angeles, CA',
  origin_address: '1000 S Alameda St',
  origin_zip: '90012',
  destination: 'Phoenix, AZ',
  destination_address: '3200 E Van Buren St',
  destination_zip: '85008',
  equipment: 'Dry Van',
  weight: '35000',
  commodity: 'Consumer Electronics',
  rate: 2800,
  miles: 370,
  pickup_date: '2026-03-30',
  pickup_time: '08:00',
  delivery_date: '2026-03-30',
  delivery_time: '18:00',
  reference_number: 'BOL-TEST-001',
  po_number: 'PO-TEST-001',
  special_instructions: 'Dock appointment required. Call 30 min before arrival.',
  payment_terms: 'prepaid',
}
