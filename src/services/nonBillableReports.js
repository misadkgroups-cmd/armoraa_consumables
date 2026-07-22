import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetry';

/**
 * Detailed Report: one row per non-billable usage, enriched with the registry's
 * product name, opening/closing dates and a dynamically counted "times used" total.
 * Queries from billable_report with normalized billable_report_consumables child table.
 * Falls back to legacy 14-slot format if child table doesn't exist.
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
 * Summary Report: aggregated consumption counts grouped by Consumable Name,
 * multiplied by the unit price to produce total operational cost.
 * Queries from billable_report with normalized billable_report_consumables child table.
 * Falls back to legacy 14-slot format if child table doesn't exist.
 */
export async function getSummaryNonBillableReport(filters = {}) {
  const usageByProduct = {}; // productId -> count

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

    // Group by registry_id (non-billable product)
    (reports || []).forEach((report) => {
      (report.billable_report_consumables || []).forEach((item) => {
        if (item.is_non_billable && item.registry_id) {
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
        reports.forEach((report) => {
          for (let i = 1; i <= 14; i++) {
            const registryId = report[`non_billable_registry_id_${i}`];
            if (registryId) {
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

  // Fetch registry details with product names and costs
  const registryIds = Object.keys(usageByProduct).map(Number);
  const { data: registry } = await withRetry(() =>
    supabase
      .from('non_billable_consumable_registry')
      .select('id, product_id, master_non_billable_consumables ( product_name, cost )')
      .in('id', registryIds.length > 0 ? registryIds : [])
  );

  const registryMap = {};
  (registry || []).forEach((reg) => {
    registryMap[reg.id] = {
      productId: reg.product_id,
      name: reg.master_non_billable_consumables?.product_name || 'Unknown',
      cost: Number(reg.master_non_billable_consumables?.cost) || 0,
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

  // Aggregate by product name
  const summaryGroup = {};
  Object.entries(usageByProduct).forEach(([registryId, count]) => {
    const regInfo = registryMap[registryId];
    if (regInfo) {
      const productName = regInfo.name;
      if (!summaryGroup[productName]) {
        summaryGroup[productName] = {
          'NON-BILLABLE CONSUMABLE': productName,
          'QUANTITY USED': 0,
          _unitCost: regInfo.cost,
        };
      }
      summaryGroup[productName]['QUANTITY USED'] += count;
    }
  });

  // Process data map back into clean array rows with computed arithmetic costs
  return Object.values(summaryGroup).map((item) => {
    const totalCost = item['QUANTITY USED'] * item._unitCost;
    return {
      'NON-BILLABLE CONSUMABLE': item['NON-BILLABLE CONSUMABLE'],
      'QUANTITY USED': item['QUANTITY USED'],
      'TOTAL COST': totalCost,
    };
  });
}