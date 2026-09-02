import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetry';

/**
 * Transaction Report: product transfer history (no bills involved).
 * Each row = one stock transfer of a product (From branch -> To branch).
 * Cost = product cost x transferred quantity.
 */
export async function getTransactionReport(filters = {}) {
  // 1. Load master product costs for both types
  const [billableMaster, nonBillableMaster] = await Promise.all([
    withRetry(() =>
      supabase.from('master_billable_consumables').select('id, product_name, cost_unit')
    ),
    withRetry(() =>
      supabase.from('master_non_billable_consumables').select('id, product_name, cost')
    ),
  ]);

  // 2. Fetch transfers with date range filter
  let query = supabase
    .from('stock_transfers')
    .select('*')
    .order('transferred_at', { ascending: false });

  if (filters.startDate) query = query.gte('transferred_at', `${filters.startDate}T00:00:00`);
  if (filters.endDate) query = query.lte('transferred_at', `${filters.endDate}T23:59:59`);

  const { data: transfers, error } = await withRetry(() => query);
  if (error) throw error;

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
    const productId = t.product_id;
    const master = isNb ? (nonBillableMaster && nonBillableMaster.data) || [] : (billableMaster && billableMaster.data) || [];
    const product = master.find((p) => Number(p.id) === Number(productId));
    const unitCost = Number(isNb ? (product && product.cost) : (product && product.cost_unit)) || 0;
    const key = `${isNb ? 'nb' : 'b'}-${productId}`;

    if (!grouped[key]) {
      grouped[key] = {
        productType: isNb ? 'Non-Billable' : 'Billable',
        productName: t.product_name || (product && product.product_name) || `Product #${productId}`,
        unitCost,
        quantity: 0,
      };
    }
    grouped[key].quantity += Number(t.quantity) || 0;
  });

  return Object.entries(grouped)
    .map(([key, g]) => ({
      id: key,
      productType: g.productType,
      productName: g.productName,
      quantity: g.quantity,
      unitCost: g.unitCost,
      totalCost: g.quantity * g.unitCost,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

