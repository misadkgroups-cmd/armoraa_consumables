import { supabase } from '../config/supabase';
import { fetchAllRows } from '../utils/supabaseRetry';

/**
 * Transaction Report: product transfer history (no bills involved).
 * Each row = one stock transfer of a product (From branch -> To branch).
 * Cost = product cost x transferred quantity.
 */
export async function getTransactionReport(filters = {}) {
  // 1. Load master product costs for both types (fully paginated)
  const [billableMaster, nonBillableMaster] = await Promise.all([
    fetchAllRows(() =>
      supabase.from('master_billable_consumables').select('id, product_name, cost_unit')
    ),
    fetchAllRows(() =>
      supabase.from('master_non_billable_consumables').select('id, product_name, cost')
    ),
  ]);

  const billableList = Array.isArray(billableMaster) ? billableMaster : (billableMaster?.data || []);
  const nonBillableList = Array.isArray(nonBillableMaster) ? nonBillableMaster : (nonBillableMaster?.data || []);

  const billableMap = new Map(billableList.map(p => [Number(p.id), p]));
  const nonBillableMap = new Map(nonBillableList.map(p => [Number(p.id), p]));
  const billableByName = new Map(billableList.map(p => [(p.product_name || '').trim().toLowerCase(), p]));
  const nonBillableByName = new Map(nonBillableList.map(p => [(p.product_name || '').trim().toLowerCase(), p]));

  // 2. Fetch transfers with date range filter (fully paginated)
  const transfers = await fetchAllRows(() => {
    let query = supabase
      .from('stock_transfers')
      .select('*')
      .order('transferred_at', { ascending: false });

    if (filters.startDate) query = query.gte('transferred_at', `${filters.startDate}T00:00:00`);
    if (filters.endDate) query = query.lte('transferred_at', `${filters.endDate}T23:59:59`);
    return query;
  });

  const selected = new Set((filters.branchIds || []).map(Number));

  // Group by product: sum quantities across the date range.
  // Cost = product cost x total summed quantity.
  const grouped = {}; // `${type}-${productId}` -> { productType, productName, unitCost, quantity }

  (transfers || []).forEach((t) => {
    // Multi-select branch filter: keep transfers where from OR to is selected
    if (selected.size > 0 && !selected.has(Number(t.from_branch_id)) && !selected.has(Number(t.to_branch_id))) {
      return;
    }

    const isNb = (t.stock_type || '').toLowerCase().startsWith('non');
    const productId = Number(t.product_id);
    const product = isNb ? nonBillableMap.get(productId) : billableMap.get(productId);
    const fallbackProduct = isNb
      ? nonBillableByName.get((t.product_name || '').trim().toLowerCase())
      : billableByName.get((t.product_name || '').trim().toLowerCase());
    const matched = product || fallbackProduct;

    // Unit Cost:
    // - For Billable items: cost_unit from master_billable_consumables
    // - For Non-Billable items: cost from master_non_billable_consumables
    const rawCost = isNb ? (matched?.cost ?? 0) : (matched?.cost_unit ?? 0);
    const unitCost = Number(rawCost) || 0;
    const key = `${isNb ? 'nb' : 'b'}-${productId || (t.product_name || 'unknown')}`;

    if (!grouped[key]) {
      grouped[key] = {
        productType: isNb ? 'Non-Billable' : 'Billable',
        productName: t.product_name || matched?.product_name || `Product #${productId}`,
        unitCost,
        quantity: 0,
      };
    }
    grouped[key].quantity += Number(t.quantity) || 0;
  });

  return Object.entries(grouped)
    .map(([key, g]) => {
      const totalCost = Math.round((g.quantity * g.unitCost) * 100) / 100;
      return {
        id: key,
        productType: g.productType,
        productName: g.productName,
        quantity: g.quantity,
        unitCost: g.unitCost,
        totalCost,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName));
}
