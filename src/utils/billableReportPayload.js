// Utility for mapping raw UI rows to the billable_report wide-format schema.
//
// The billable_report table stores up to MAX_SLOTS consumable slots, each with:
//   consumable_X_id             INT8 FK -> master_consumables (billable items only)
//   consumable_X_units          NUMERIC
//   consumable_X_batch_id       TEXT
//   is_non_billable_X           BOOLEAN
//   non_billable_registry_id_X  BIGINT FK -> non_billable_consumable_registry (non-billable items only)
//
// For billable items: consumable_X_id holds the master_consumables FK,
//   is_non_billable_X = false, non_billable_registry_id_X = NULL.
// For non-billable items: consumable_X_id = NULL (bypasses master FK),
//   is_non_billable_X = true, non_billable_registry_id_X = registry row id,
//   units stored as 1 (= USED) and the registry batch id is recorded.
//
// NEW: Also returns a normalized consumables array for the billable_report_consumables child table.

export const MAX_SLOTS = 14;

/**
 * Build the insert payload for the billable_report table from UI row state.
 *
 * @param {Object}   args
 * @param {Array}    args.rows             UI rows: { id, consumableId, type, units, batchId, registryId }
 * @param {Array}    args.allConsumables   Combined dropdown options: { id, rawId, name, type, registryId }
 * @param {Function} args.getRegistryId    (rawProductId, batchId) => registryId | null  (fallback when row.registryId is absent)
 * @param {Object}   args.base             Static report header fields
 * @param {*}        args.base.branchId
 * @param {string}   args.base.billId
 * @param {string}   args.base.uid
 * @param {*}        args.base.serviceId
 * @param {*}        args.base.machineryId
 * @param {string}   args.base.reportDate
 * @returns {Object} Payload ready for supabase.from('billable_report').insert(payload)
 *   Returns { reportPayload, consumableItems } where consumableItems is an array for billable_report_consumables
 */
export function prepareSavePayload({ rows = [], allConsumables = [], getRegistryId, base = {} }) {
  const payload = {
    branch_id: base.branchId,
    bill_id: base.billNo, // Stores the bill_no from billing_log as TEXT
    bill_no: base.billNo, // Same as bill_id for backwards compatibility
    uid: base.uid,
    service_id: base.serviceId || null,
    machinery_id: base.machineryId || null,
    report_date: base.reportDate,
  };

  const consumableItems = [];

  // Loop through the max 14 form slots dynamically.
  for (let i = 0; i < MAX_SLOTS; i++) {
    const slot = i + 1;
    const row = rows[i];

    if (!row || !row.consumableId) {
      // Empty slot handling.
      payload[`consumable_${slot}_id`] = null;
      payload[`consumable_${slot}_units`] = null;
      payload[`is_non_billable_${slot}`] = false;
      payload[`non_billable_registry_id_${slot}`] = null;
      payload[`consumable_${slot}_batch_id`] = null;
      continue;
    }

    const opt = allConsumables.find((c) => c.id === row.consumableId);
    if (!opt) {
      // Unknown option: treat as empty.
      payload[`consumable_${slot}_id`] = null;
      payload[`consumable_${slot}_units`] = null;
      payload[`is_non_billable_${slot}`] = false;
      payload[`non_billable_registry_id_${slot}`] = null;
      payload[`consumable_${slot}_batch_id`] = null;
      continue;
    }

    if (opt.type === 'nonbillable') {
      // Path B: Non-billable registry items logic.
      const resolvedRegistryId =
        row.registryId != null
          ? Number(row.registryId)
          : (typeof getRegistryId === 'function' ? getRegistryId(opt.rawId, row.batchId) : null);

      payload[`consumable_${slot}_id`] = null;
      payload[`is_non_billable_${slot}`] = true;
      payload[`non_billable_registry_id_${slot}`] = resolvedRegistryId;
      payload[`consumable_${slot}_units`] = 1; // USED (numeric column, so 1 represents one USED unit)
      payload[`consumable_${slot}_batch_id`] = row.batchId || null;

      // Normalized child table entry
      consumableItems.push({
        product_type: 'Non-Billable',
        consumable_id: opt.rawId,
        units: 1,
        is_non_billable: true,
        registry_id: resolvedRegistryId,
        batch_id: row.batchId || null,
        slot_number: slot,
      });
    } else {
      // Path A: Master (billable) item logic.
      const rawId = opt.rawId ? Number(opt.rawId) : null;
      const units = row.units ? Number(row.units) : null;

      payload[`consumable_${slot}_id`] = rawId;
      payload[`is_non_billable_${slot}`] = false;
      payload[`non_billable_registry_id_${slot}`] = null;
      payload[`consumable_${slot}_units`] = units;
      payload[`consumable_${slot}_batch_id`] = null;

      // Normalized child table entry
      if (rawId && units && units > 0) {
        consumableItems.push({
          product_type: 'Billable',
          consumable_id: rawId,
          units: units,
          is_non_billable: false,
          registry_id: null,
          batch_id: null,
          slot_number: slot,
        });
      }
    }
  }

  return { reportPayload: payload, consumableItems };
}