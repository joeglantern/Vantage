/**
 * Sample data, matching ScreensBoard.dc.html.
 *
 * There is no API yet. The Daraja adapter and the HTTP layer are a later
 * milestone, so every screen renders from here. This module is the seam: when
 * the API lands, these become queries and nothing else has to move.
 *
 * Amounts are strings of minor units, exactly as the backend will send them,
 * because a JSON number loses integer precision above 2^53 and money must never
 * cross a boundary as one.
 */
import type { BatchStatus } from '@domain/payout-batch';

export const ORGANISATION = 'Tumaini Youth Trust';

export const CURRENT_USER = { name: 'Wanjiku Ndegwa', role: 'Preparer' } as const;
export const ADMIN_USER = { name: 'Esther Mburu', role: 'Admin' } as const;

export interface BatchRow {
  readonly reference: string;
  readonly programme: string;
  readonly status: BatchStatus;
  readonly items: number;
  readonly totalMinor: string;
  readonly preparedBy: string;
  readonly approvedBy: string;
  readonly updatedAt: string;
}

export const BATCHES: readonly BatchRow[] = [
  { reference: 'CHP-2026-03', programme: 'Community health promoters, March 2026', status: 'pending_approval', items: 212, totalMinor: '42400000', preparedBy: 'Wanjiku Ndegwa', approvedBy: 'Awaiting approver', updatedAt: '06 Mar 09:14' },
  { reference: 'YCIC-2026-03', programme: 'YCIC March 2026 stipend', status: 'disbursing', items: 16, totalMinor: '3050000', preparedBy: 'Wanjiku Ndegwa', approvedBy: 'David Ochieng', updatedAt: '05 Mar 14:44' },
  { reference: 'TR-2026-Q1', programme: 'Trainer honoraria, Q1 2026', status: 'needs_fixes', items: 24, totalMinor: '9600000', preparedBy: 'Wanjiku Ndegwa', approvedBy: '', updatedAt: '04 Mar 16:02' },
  { reference: 'CHP-2026-02', programme: 'Community health promoters, February 2026', status: 'closed', items: 210, totalMinor: '42000000', preparedBy: 'Wanjiku Ndegwa', approvedBy: 'Grace Muthoni', updatedAt: '26 Feb 16:40' },
  { reference: 'YCIC-2026-02', programme: 'YCIC February 2026 stipend', status: 'closed', items: 18, totalMinor: '2700000', preparedBy: 'Wanjiku Ndegwa', approvedBy: 'David Ochieng', updatedAt: '05 Feb 11:20' },
  { reference: 'CHP-2026-01', programme: 'Community health promoters, January 2026', status: 'completed_with_failures', items: 208, totalMinor: '41600000', preparedBy: 'Wanjiku Ndegwa', approvedBy: 'David Ochieng', updatedAt: '28 Jan 10:05' },
  { reference: 'YCIC-2026-01', programme: 'YCIC January 2026 stipend', status: 'closed', items: 18, totalMinor: '2700000', preparedBy: 'Wanjiku Ndegwa', approvedBy: 'Grace Muthoni', updatedAt: '12 Jan 15:30' },
  { reference: 'YCIC-2025-12', programme: 'YCIC December 2025 stipend', status: 'cancelled', items: 18, totalMinor: '2700000', preparedBy: 'Wanjiku Ndegwa', approvedBy: '', updatedAt: '10 Dec 09:00' },
];

/** The first five rows of cohort-messy.csv, exactly as typed. */
export const RAW_ROWS = [
  { n: 1, ref: 'YCIC-001', name: 'Amina Wanjiru', phone: '0712345678', amount: '1500', note: 'March stipend' },
  { n: 2, ref: 'YCIC-002', name: 'Peter Kimani Mwangi', phone: '+254722345678', amount: '"1,500"', note: 'comma in the amount' },
  { n: 3, ref: 'YCIC-003', name: 'Grace Achieng Otieno', phone: '254733456789', amount: '1500.00', note: 'trailing zeros' },
  { n: 4, ref: 'YCIC-004', name: 'Brian Odhiambo', phone: '0110123456', amount: '1500', note: 'the 01xx range' },
  { n: 5, ref: 'YCIC-005', name: 'Faith Njeri', phone: '745678901', amount: '1500', note: 'bare national number' },
] as const;

/** The exact figures the fixture produces. Verified against the domain rules. */
export const IMPORT_SUMMARY = { rows: 20, totalMinor: '8000050', fileName: 'cohort-messy.csv', fileSize: '1.3 KB' } as const;

export const IMPORT_ERRORS = {
  unreadable: {
    title: 'The file could not be read',
    body: 'stipends.xlsx is an Excel workbook, not a CSV. Vantage reads CSV only, because a CSV has no hidden formulas or sheets. In Excel, choose Save as, CSV UTF-8, then upload that file, or copy the rows and paste them.',
  },
  columns: {
    title: 'The file has the wrong columns',
    body: 'Found: Name, Mobile, KES. Expected: full_name, phone, amount, and optionally participant_ref and note. Rename the header row to match and upload again; the order does not matter.',
  },
  emptyfile: {
    title: 'The file has a header row and nothing else',
    body: 'cohort-april.csv is 58 bytes and contains only the column names. Check you exported the right sheet, then upload again.',
  },
  large: {
    title: 'The file is too large',
    body: 'all-programmes-2025.csv is 11.2 MB; the limit is 5 MB, about 60,000 rows. A batch is one cycle for one programme; split the file by programme and upload each one as its own batch.',
  },
} as const;

export type ImportErrorKey = keyof typeof IMPORT_ERRORS;

export interface Person {
  readonly name: string;
  /** Full MSISDN. Masked at render, never stored masked. */
  readonly msisdn: string;
  readonly ref: string;
  readonly programme: string;
  readonly added: string;
  readonly payments: number;
  readonly totalMinor: string;
}

export const PEOPLE: readonly Person[] = [
  { name: 'Amina Wanjiru', msisdn: '254712345678', ref: 'YCIC-001', programme: 'YCIC', added: '2026-01-12', payments: 3, totalMinor: '450000' },
  { name: 'Amina Wanjiru', msisdn: '254789556677', ref: 'YCIC-018', programme: 'YCIC', added: '2026-01-12', payments: 3, totalMinor: '750000' },
  { name: 'Brian Odhiambo', msisdn: '254110123456', ref: 'YCIC-004', programme: 'YCIC', added: '2026-01-12', payments: 3, totalMinor: '450000' },
  { name: 'Faith Njeri', msisdn: '254745678901', ref: 'YCIC-005', programme: 'YCIC', added: '2026-01-12', payments: 3, totalMinor: '450000' },
  { name: 'Grace Achieng Otieno', msisdn: '254733456789', ref: 'YCIC-003', programme: 'YCIC', added: '2026-01-12', payments: 3, totalMinor: '450000' },
  { name: 'Joyce Wanjala', msisdn: '254722334318', ref: 'CHP-044', programme: 'CHP', added: '2025-11-03', payments: 5, totalMinor: '1000000' },
  { name: 'Kevin Otieno', msisdn: '254723456680', ref: 'YCIC-010', programme: 'YCIC', added: '2026-01-12', payments: 3, totalMinor: '450000' },
  { name: 'Nancy Wairimu', msisdn: '254778445566', ref: 'YCIC-016', programme: 'YCIC', added: '2026-03-05', payments: 1, totalMinor: '150000' },
];

export const PERSON_DETAIL = {
  person: PEOPLE[6] as Person,
  registeredNameSeen: 'JANE AKINYI OTIENO',
  registeredNameSeenAt: '5 Mar 2026',
  addedFrom: 'batch YCIC-2026-01',
  addedOn: '12 Jan 2026',
  payments: [
    { batch: 'YCIC-2026-03', programme: 'YCIC March 2026', amountMinor: '150000', status: 'confirmed' as const, receipt: 'TC5K7HY1YH' },
    { batch: 'YCIC-2026-02', programme: 'YCIC February 2026', amountMinor: '150000', status: 'confirmed' as const, receipt: 'TB9J2FX7LM' },
    { batch: 'YCIC-2026-01', programme: 'YCIC January 2026', amountMinor: '150000', status: 'confirmed' as const, receipt: 'TA4H8DW1KN' },
  ],
  packsNaming: ['YCIC-2026-01', 'YCIC-2026-02', 'YCIC-2026-03'],
  pseudonym: 'erased-7f3a',
} as const;

export const CHANNEL = {
  shortcode: '4•••61',
  initiatorName: 'tumaini_b2c',
  credentialSetOn: '12 Feb 2026',
  credentialSetBy: 'Esther Mburu',
  verifiedReceipt: 'SB2C1QX0AA',
  verifiedOn: '12 Feb 2026',
  callbackUrl: '…/callbacks/mpesa/ch_01/•••••••',
} as const;

/** Matches the schema defaults in prisma/schema.prisma. */
export const LIMITS = {
  perItemMinor: '2000000',
  perBatchMinor: '50000000',
  deviationBps: 5000,
  largestCycleMinor: '42400000',
} as const;

export const MEMBERS = [
  { name: 'Wanjiku Ndegwa', role: 'Preparer', mfa: '2FA on' },
  { name: 'David Ochieng', role: 'Approver', mfa: '2FA required' },
  { name: 'Grace Muthoni', role: 'Approver', mfa: '2FA required' },
  { name: 'Esther Mburu', role: 'Admin', mfa: '2FA on' },
  { name: 'Hanover Foundation audit', role: 'Viewer', mfa: '2FA off' },
] as const;
