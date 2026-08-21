import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetry';

/**
 * Detailed Report: one row per non-billable usage, enriched with the registry's
 * product name, opening/closing dates and a dynamically counted "times used" total.
 * Shows BOTH completed and incomplete records.
 */
export async function getDetailedNonBillableReport(filters = {}) {
  const registryUseCounter = {};
  const nonBillableEntries = [];

  try {
    // Try normalized table first
    let query = supabase
      .from('billable_report')
      .select(`
        id,
        report_date,
        branch_id,
        service_id,
        machinery_id,
        bill_id,
        uid,
        branches ( branch_name ),
        master_services ( service_name ),
        billable_report_consumables!inner (
          id,
          product_type,
          consumable_id,
          is_non_billable,
          registry_id,
          batch_id
        )
      `);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.startDate) query = query.gte('report_date', filters.startDate);
    if (filters.endDate) query = query.lte('report_date', filters.endDate);

    const { data: reports, error } = await withRetry(() => query);
    if (error) throw error;

    // Filter to only non-billable items
    (reports || []).forEach((report) => {
      (report.billable_report_consumables || []).forEach((item) => {
        if (item.is_non_billable && item.registry_id) {
          registryUseCounter[item.registry_id] = (registryUseCounter[item.registry_id] || 0) + 1;
          nonBillableEntries.push({ report, item });
        }
      });
    });
  } catch (normalizedError) {
    // Fallback: Query legacy 14-slot format from billable_report
    try {
      let query = supabase
        .from('billable_report')
        .select('id, report_date, branch_id, service_id, bill_id, uid, branches(branch_name), master_services(service_name)');

      if (filters.branchId) query = query.eq('branch_id', filters.branchId);
      if (filters.startDate) query = query.gte('report_date', filters.startDate);
      if (filters.endDate) query = query.lte('report_date', filters.endDate);

      const { data: reports, error } = await withRetry(() => query);
      if (error) throw error;

      // Build field names for all 14 slots
      const batchFields = [];
      const registryFields = [];
      for (let i = 1; i <= 14; i++) {
        batchFields.push(`consumable_${i}_batch_id`);
        registryFields.push(`non_billable_registry_id_${i}`);
      }

      // Re-query with batch and registry fields
      const { data: reportsWithSlots } = await withRetry(() =>
        supabase
          .from('billable_report')
          .select(`id, report_date, branches(branch_name), master_services(service_name), ${batchFields.join(', ')}, ${registryFields.join(', ')}`)
      );

      if (reportsWithSlots) {
        reportsWithSlots.forEach((report) => {
          for (let i = 1; i <= 14; i++) {
            const batchId = report[`consumable_${i}_batch_id`];
            const registryId = report[`non_billable_registry_id_${i}`];
            if (registryId) {
              registryUseCounter[registryId] = (registryUseCounter[registryId] || 0) + 1;
              nonBillableEntries.push({
                report,
                item: {
                  registry_id: registryId,
                  batch_id: batchId || null,
                },
              });
            }
          }
        });
      }
    } catch (legacyError) {
      console.error('Error fetching non-billable report (both normalized and legacy):', legacyError);
      return [];
    }
  }

  // Fetch registry details alongside parent master item names.
  const registryIds = [...new Set(nonBillableEntries.map(e => e.item.registry_id).filter(Boolean))];
  const { data: registry } = await withRetry(() =>
    supabase
      .from('non_billable_consumable_registry')
      .select('id, opening_date, closing_date, status, master_non_billable_consumables ( product_name )')
      .in('id', registryIds.length > 0 ? registryIds : [])
  );

  const registryMap = {};
  (registry || []).forEach((reg) => {
    registryMap[reg.id] = {
      name: reg.master_non_billable_consumables?.product_name || 'Unknown',
      openingDate: reg.opening_date,
      closingDate: reg.closing_date || 'Active (Open)',
      status: reg.status,
    };
  });

  // Build detailed rows
  const detailedLogs = nonBillableEntries.map(({ report, item }) => {
    const regInfo = registryMap[item.registry_id] || { name: 'Unknown', openingDate: '-', closingDate: '-', status: '-' };
    return {
      date: report.report_date,
      branch: report.branches?.branch_name || '-',
      consumableName: regInfo.name,
      batchId: item.batch_id || 'N/A',
      openingDate: regInfo.openingDate,
      closingDate: regInfo.closingDate,
      serviceUsedBy: report.master_services?.service_name || 'Not Specified',
      serviceUsedCount: registryUseCounter[item.registry_id] || 0,
      status: regInfo.status,
    };
  });

  return detailedLogs;
}

/**
 * Summary Report: aggregated consumption counts grouped by Consumable Name.
 * Shows Completed Qty, Incomplete Qty, Total Registry Count, Service Usage Count,
 * Opening Stock, Received, Used, and Closing Stock.
 */
export async function getSummaryNonBillableReport(filters = {}) {
  const usageByProduct = {}; // productId -> count
  const registryStatusByProduct = {}; // productId -> { completed: 0, incomplete: 0, total: 0 }

  try {
    // Try normalized table first
    let query = supabase
      .from('billable_report')
      .select(`
        id,
        billable_report_consumables!inner (
          id,
          product_type,
          is_non_billable,
          registry_id
        )
      `);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.startDate) query = query.gte('report_date', filters.startDate);
    if (filters.endDate) query = query.lte('report_date', filters.endDate);

    const { data: reports, error } = await withRetry(() => query);
    if (error) throw error;

    // Group by registry_id (non-billable product) - count each batch only once
    const countedRegistryIds = new Set();
    (reports || []).forEach((report) => {
      (report.billable_report_consumables || []).forEach((item) => {
        if (item.is_non_billable && item.registry_id && !countedRegistryIds.has(item.registry_id)) {
          countedRegistryIds.add(item.registry_id);
          usageByProduct[item.registry_id] = (usageByProduct[item.registry_id] || 0) + 1;
        }
      });
    });
  } catch (normalizedError) {
    // Fallback: Query legacy 14-slot format
    try {
      const registryFields = [];
      for (let i = 1; i <= 14; i++) {
        registryFields.push(`non_billable_registry_id_${i}`);
      }

      let query = supabase
        .from('billable_report')
        .select(registryFields.join(', '));

      if (filters.branchId) query = query.eq('branch_id', filters.branchId);
      if (filters.startDate) query = query.gte('report_date', filters.startDate);
      if (filters.endDate) query = query.lte('report_date', filters.endDate);

      const { data: reports } = await withRetry(() => query);

      if (reports) {
        const countedRegistryIds = new Set();
        reports.forEach((report) => {
          for (let i = 1; i <= 14; i++) {
            const registryId = report[`non_billable_registry_id_${i}`];
            if (registryId && !countedRegistryIds.has(registryId)) {
              countedRegistryIds.add(registryId);
              usageByProduct[registryId] = (usageByProduct[registryId] || 0) + 1;
            }
          }
        });
      }
    } catch (legacyError) {
      console.error('Error fetching summary non-billable report:', legacyError);
      return [];
    }
  }

  // Fetch registry details with product names, costs, and status
  const registryIds = Object.keys(usageByProduct).map(Number);
  const { data: registry } = await withRetry(() =>
    supabase
      .from('non_billable_consumable_registry')
      .select('id, product_id, status, opening_date, closing_date, master_non_billable_consumables ( product_name, cost )')
      .in('id', registryIds.length > 0 ? registryIds : [])
  );

  const registryMap = {};
  (registry || []).forEach((reg) => {
    registryMap[reg.id] = {
      productId: reg.product_id,
      name: reg.master_non_billable_consumables?.product_name || 'Unknown',
      cost: Number(reg.master_non_billable_consumables?.cost) || 0,
      status: reg.status || 'active',
    };
  });

  // Get unique product IDs for fetching stock
  const productIds = [...new Set(Object.values(registryMap).map(r => r.productId).filter(Boolean))];
  
  // Fetch products to aggregate by product_name
  const { data: products } = await withRetry(() =>
    supabase
      .from('master_non_billable_consumables')
      .select('id, product_name, cost')
      .in('id', productIds.length > 0 ? productIds : [])
  );

  const productMap = {};
  (products || []).forEach((p) => {
    productMap[p.id] = p;
  });

  // Fetch ALL registry records for the branch (not just used ones) to count
  // completed/incomplete statuses and compute opening/closing stock
  let registryQuery = supabase
    .from('non_billable_consumable_registry')
    .select('id, product_id, status, opening_date, closing_date, batch_id');

  if (filters.branchId) registryQuery = registryQuery.eq('branch_id', filters.branchId);
  if (filters.startDate) registryQuery = registryQuery.gte('opening_date', filters.startDate);
  if (filters.endDate) registryQuery = registryQuery.lte('opening_date', filters.endDate);

  const { data: allRegistry } = await withRetry(() => registryQuery);

  // Count completed/incomplete per product
  (allRegistry || []).forEach((reg) => {
    const pid = reg.product_id;
    if (!registryStatusByProduct[pid]) {
      registryStatusByProduct[pid] = { completed: 0, incomplete: 0, total: 0 };
    }
    registryStatusByProduct[pid].total++;
    if (reg.status === 'completed') {
      registryStatusByProduct[pid].completed++;
    } else {
      registryStatusByProduct[pid].incomplete++;
    }
  });

  // Fetch current stock levels for non-billable products
  let stockQuery = supabase
    .from('non_billable_stock')
    .select('consumable_id, available_stock');

  if (filters.branchId) stockQuery = stockQuery.eq('branch_id', filters.branchId);

  const { data: stockData } = await withRetry(() => stockQuery);
  const stockMap = {};
  (stockData || []).forEach((s) => {
    stockMap[s.consumable_id] = Number(s.available_stock) || 0;
  });

  // Aggregate by product name
  const summaryGroup = {};
  Object.entries(usageByProduct).forEach(([registryId, count]) => {
    const regInfo = registryMap[registryId];
    if (regInfo) {
      const productName = regInfo.name;
      const pid = regInfo.productId;
      if (!summaryGroup[productName]) {
        summaryGroup[productName] = {
          'NON-BILLABLE CONSUMABLE': productName,
          'COMPLETED QTY': 0,
          'INCOMPLETE QTY': 0,
          'TOTAL REGISTRY COUNT': 0,
          'SERVICE USAGE COUNT': 0,
          'OPENING STOCK': 0,
          'RECEIVED': 0,
          'USED': 0,
          'CLOSING STOCK': 0,
          _unitCost: regInfo.cost,
          _productId: pid,
        };
      }
      summaryGroup[productName]['SERVICE USAGE COUNT'] += count;
    }
  });

  // Merge registry status counts into summary
  Object.entries(registryStatusByProduct).forEach(([pid, counts]) => {
    // Find the product name for this pid
    const product = productMap[pid];
    if (!product) return;
    const productName = product.product_name;
    if (!summaryGroup[productName]) {
      summaryGroup[productName] = {
        'NON-BILLABLE CONSUMABLE': productName,
        'COMPLETED QTY': 0,
        'INCOMPLETE QTY': 0,
        'TOTAL REGISTRY COUNT': 0,
        'SERVICE USAGE COUNT': 0,
        'OPENING STOCK': 0,
        'RECEIVED': 0,
        'USED': 0,
        'CLOSING STOCK': 0,
        _unitCost: Number(product.cost) || 0,
        _productId: pid,
      };
    }
    summaryGroup[productName]['COMPLETED QTY'] = counts.completed;
    summaryGroup[productName]['INCOMPLETE QTY'] = counts.incomplete;
    summaryGroup[productName]['TOTAL REGISTRY COUNT'] = counts.total;
    summaryGroup[productName]['USED'] = counts.total;
    summaryGroup[productName]['CLOSING STOCK'] = stockMap[pid] || 0;
    summaryGroup[productName]['OPENING STOCK'] = (stockMap[pid] || 0) + counts.total;
  });

  // Process data map back into clean array rows
  return Object.values(summaryGroup).map((item) => {
    const totalCost = item['SERVICE USAGE COUNT'] * item._unitCost;
    return {
      'NON-BILLABLE CONSUMABLE': item['NON-BILLABLE CONSUMABLE'],
      'COMPLETED QTY': item['COMPLETED QTY'],
      'INCOMPLETE QTY': item['INCOMPLETE QTY'],
      'TOTAL REGISTRY COUNT': item['TOTAL REGISTRY COUNT'],
      'SERVICE USAGE COUNT': item['SERVICE USAGE COUNT'],
      'OPENING STOCK': item['OPENING STOCK'],
      'RECEIVED': item['RECEIVED'],
      'USED': item['USED'],
      'CLOSING STOCK': item['CLOSING STOCK'],
      'TOTAL COST': totalCost,
    };
  });
}