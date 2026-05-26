export type SellerDisposition =
  | 'Untouched'
  | 'Not Interested'
  | 'Cold Follow Up'
  | 'Ghosting'
  | 'Hit List'
  | 'Appointment Set'
  | 'Offer Delivered'
  | 'Needs Underwriting'
  | 'Bad Number'
  | 'Already Sold'
  | 'Hot Follow Up'
  | 'Interested'
  | 'Listed with Agent'
  | 'Offer Rejected'
  | 'Offer Needed'
  | 'Under Contract'
  | 'Signed Elsewhere'
  | 'Closed Deal';

export type DispositionTier = 'hot' | 'warm' | 'cold';

export const DISPOSITION_TIERS: Record<string, DispositionTier> = {
  'Hit List': 'hot',
  'Interested': 'hot',
  'Hot Follow Up': 'hot',
  'Offer Needed': 'hot',
  'Appointment Set': 'hot',
  'Ghosting': 'warm',
  'Needs Underwriting': 'warm',
  'Offer Delivered': 'warm',
  'Cold Follow Up': 'warm',
  'Untouched': 'cold',
  'Not Interested': 'cold',
  'Already Sold': 'cold',
  'Listed with Agent': 'cold',
  'Offer Rejected': 'cold',
  'Signed Elsewhere': 'cold',
  'Under Contract': 'cold',
  'Closed Deal': 'cold',
  'Bad Number': 'cold',
};

// Back-compat aliases
export const DISPOSITIONS = Object.keys(DISPOSITION_TIERS) as SellerDisposition[];
export type Disposition = SellerDisposition;
export const DISPOSITION_TIER = DISPOSITION_TIERS;

export function dispositionTier(value?: string | null): DispositionTier | null {
  if (!value) return null;
  return DISPOSITION_TIERS[value] ?? 'cold';
}