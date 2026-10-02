// Stock restoration when a bill, or a single service on a bill, is deleted.
//
// Why this is needed: consumables are DEDUCTED from `billable_stock` at the
// moment they are entered on the Billable Consumables page. When the record is
// removed (MIS Admin deletes a bill, or drops a duplicated / mismatched
// service from the edit form), those units must go back to stock — otherwise
// Branch 2 physically loses the consumables for a service that no longer exists.
//
// CRITICAL: the branch the units are returned to is the branch that OWNS the
// bill (`billing_log.branch_id`), NOT the branch the acting user currently has
// selected. A MIS Admin sitting on Branch 1 who removes Branch 2's bad entry
// must still credit Branch 2's stock.
//
// Non-billable consumables are deliberately NOT restored here: their stock is
// deducted once when a batch is REGISTERED (DB trigger
// trg_deduct_non_billable_stock), not when the batch is consumed on a bill, so
// returning it here would double-count the batch.
import { supabase } from '../config/supabase';
import { round2 } from './numUtils';

// Aggregate billable usage rows for a set of bill_services into
// `{ branchId, consumableId, qty }` buckets.
async function collectBillableUsage(billServiceIds) {
  const { data: services, error: svcError } = await supabase
    .from('bill_services')
    .select('id, bill_id, service_id, service_name')
    .in('id', billServiceIds);

  if (svcError) {
    console.error('stockRestore: failed to load bill_services:', svcError);
    return [];
  }
  if (!services || services.length === 0) return [];

  // Resolve the owning branch for every bill these services belong to.
  const billIds = [...new Set(services.map((s) => s.bill_id).filter(Boolean))];
  let billMap = {};
  if (billIds.length > 0) {
    const { data: bills, error: billError } = await supabase
      .from('billing_log')
      .select('id, bill_no, branch_id')
      .in('id', billIds);
    if (billError) {
      console.error('stockRestore: failed to load billing_log:', billError);
      return [];
    }
    (bills || []).forEach((b) => { billMap[b.id] = b; });
  }

  const serviceMap = {};
  services.forEach((s) => { serviceMap[s.id] = s; });

  const { data: usage, error: usageError } = await supabase
    .from('bill_service_consumables')
    .select('bill_service_id, product_type, consumable_id, used_quantity')
    .in('bill_service_id', billServiceIds);

  if (usageError) {
    console.error('stockRestore: failed to load bill_service_consumables:', usageError);
    return [];
  }

  // Bucket by branch + consumable so several services (or several rows for the
  // same product) produce a single stock credit per branch/product pair.
  const buckets = new Map();
  (usage || []).forEach((row) => {
    if (row.product_type !== 'Billable' || !row.consumable_id) return;
    const qty = Number(row.used_quantity) || 0;
    if (qty <= 0) return;

    const svc = serviceMap[row.bill_service_id];
    if (!svc) return;
    const bill = billMap[svc.bill_id];
    const branchId = bill?.branch_id;
    if (!branchId) {
      console.warn('stockRestore: no branch for bill_service', row.bill_service_id, '- skipping restore');
      return;
    }

    const key = `${branchId}:${row.consumable_id}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        branchId,
        consumableId: Number(row.consumable_id),
        qty: 0,
        contexts: [],
      });
    }
    const bucket = buckets.get(key);
    bucket.qty = round2(bucket.qty + qty);
    bucket.contexts.push({
      billNo: bill?.bill_no ?? null,
      serviceName: svc.service_name ?? null,
    });
  });

  return Array.from(buckets.values());
}

// Add the consumed units back to `billable_stock` and record the movement.
//
// @param {number[]} billServiceIds  bill_services.id values being removed
// @param {Object}   [options]
// @param {string}   [options.reason] human-readable cause, stored in remarks
// @param {string}   [options.actor]  username stamped on the movement
// @returns {Promise<{restored: boolean, items: Array}>}
export async function restoreBillableStockForBillServices(billServiceIds, options = {}) {
  const ids = (billServiceIds || []).map(Number).filter(Boolean);
  if (ids.length === 0) return { restored: false, items: [] };

  const { reason = 'Bill/Service removed', actor } = options;
  const username = actor || localStorage.getItem('username') || 'System';

  const buckets = await collectBillableUsage(ids);
  if (buckets.length === 0) {
    console.log('stockRestore: no billable usage to restore for bill services', ids);
    return { restored: false, items: [] };
  }

  const restored = [];

  for (const bucket of buckets) {
    const { branchId, consumableId } = bucket;
    const qty = round2(bucket.qty);
    if (qty <= 0) continue;

    // Read the CURRENT stock of that branch (not the acting user's branch).
    const { data: currentRow, error: readError } = await supabase
      .from('billable_stock')
      .select('available_stock')
      .eq('consumable_id', consumableId)
      .eq('branch_id', branchId)
      .maybeSingle();

    if (readError) {
      console.error('stockRestore: failed to read billable_stock:', readError);
      continue;
    }

    const currentStock = Number(currentRow?.available_stock) || 0;
    const newStock = round2(currentStock + qty);

    const { error: upsertError } = await supabase
      .from('billable_stock')
      .upsert(
        {
          consumable_id: consumableId,
          branch_id: branchId,
          available_stock: newStock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'consumable_id,branch_id' }
      );

    if (upsertError) {
      console.error('stockRestore: failed to credit billable_stock:', upsertError);
      continue;
    }

    const where = bucket.contexts.length
      ? ` (${bucket.contexts
          .map((c) => [c.billNo ? `Bill #${c.billNo}` : null, c.serviceName].filter(Boolean).join(' / '))
          .join('; ')})`
      : '';

    // Movement log: 'Adjustment' is an allowed transaction_type and accurately
    // describes a stock correction (no purchase, no new consumption).
    const { error: txnError } = await supabase
      .from('stock_transactions')
      .insert({
        transaction_type: 'Adjustment',
        product_type: 'Billable',
        consumable_id: consumableId,
        branch_id: branchId,
        quantity: qty,
        remarks: `Returned to stock — ${reason}${where}`,
        created_by: username,
      });

    if (txnError) {
      console.error('stockRestore: failed to log stock_transactions:', txnError);
    }

    restored.push({ branchId, consumableId, qty, from: currentStock, to: newStock });
  }

  console.log('stockRestore: restored', restored);
  return { restored: restored.length > 0, items: restored };
}