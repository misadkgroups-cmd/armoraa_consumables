// Single source of truth for Non-Billable consumable values.
//
// RULE: whenever consumable_type = 'Non-Billable', the record must ALWAYS be:
//   units  = 1      (one "USED" application, regardless of any entered value)
//   price  = 0.00   (never derived from stock price or average price)
//   amount = 0.00   (units * price = 0)
//
// Every save path (UI payload, bill_service_consumables sync, report exports)
// and the DB triggers in
// supabase/migrations/20260909_enforce_non_billable_units_price.sql
// must use these values. Do NOT hardcode 1/0/0 inline elsewhere.

export const NON_BILLABLE_UNITS = 1;
export const NON_BILLABLE_PRICE = 0;
export const NON_BILLABLE_AMOUNT = 0;

/**
 * Force Non-Billable invariants onto a record object.
 * Returns a shallow copy with units/price/amount overridden — user-entered
 * values are always discarded for Non-Billable items.
 *
 * @param {Object} record Any object carrying units / price / amount fields.
 * @returns {Object} New object with the Non-Billable defaults applied.
 */
export function applyNonBillableDefaults(record = {}) {
  return {
    ...record,
    units: NON_BILLABLE_UNITS,
    price: NON_BILLABLE_PRICE,
    amount: NON_BILLABLE_AMOUNT,
  };
}