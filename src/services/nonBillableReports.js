import { supabase } from '../config/supabase';

// Build the 14-slot column list once: is_non_billable_X, non_billable_registry_id_X, consumable_X_batch_id
const SLOT_SELECT = Array.from({ length: 14 }, (_, i) => {
  const s = i + 1;
  return `is_non_billable_${s}, non_billable_registry_id_${s}, consumable_${s}_batch_id`;
}).join(',\n      ');

// Same 14 slots but without the batch_id column — used by the Summary report,
// which groups strictly by the clean product name and never displays a batch.
const SUMMARY_SLOT_SELECT = Array.from({ length: 14 }, (_, i) => {
  const s = i + 1;
  return `is_non_billable_${s}, non_billable_registry_id_${s}`;
}).join(',\n      ');

/**
 * Detailed Report: one row per non-billable usage, enriched with the registry's
 * product name, opening/closing dates and a dynamically counted "times used" total.
 */
export async function getDetailedNonBillableReport(filters = {}) {
  let query = supabase
    .from('billable_report')
    .select(`
      id,
      report_date,
      branches ( branch_name ),
      master_services ( service_name ),
      ${SLOT_SELECT}
    `);

  if (filters.branchId) query = query.eq('branch_id', filters.branchId);
  if (filters.startDate) query = query.gte('report_date', filters.startDate);
  if (filters.endDate) query = query.lte('report_date', filters.endDate);

  const { data: reports, error } = await query;
  if (error) throw error;

  // Step A: count how many times each registry id is used across all reports.
  const registryUseCounter = {};
  (reports || []).forEach((report) => {
    for (let slot = 1; slot <= 14; slot++) {
      const isNonBillable = report[`is_non_billable_${slot}`];
      const registryId = report[`non_billable_registry_id_${slot}`];
      if (isNonBillable && registryId) {
        registryUseCounter[registryId] = (registryUseCounter[registryId] || 0) + 1;
      }
    }
  });

  // Fetch registry details alongside parent master item names.
  const { data: registry } = await supabase
    .from('non_billable_consumable_registry')
    .select('id, opening_date, closing_date, status, master_non_billable_consumables ( product_name )');

  const registryMap = {};
  (registry || []).forEach((reg) => {
    registryMap[reg.id] = {
      name: reg.master_non_billable_consumables?.product_name || 'Unknown',
      openingDate: reg.opening_date,
      closingDate: reg.closing_date || 'Active (Open)',
      status: reg.status,
    };
  });

  // Step B: build detailed rows and inject the dynamically counted total.
  const detailedLogs = [];
  (reports || []).forEach((report) => {
    for (let slot = 1; slot <= 14; slot++) {
      const isNonBillable = report[`is_non_billable_${slot}`];
      const registryId = report[`non_billable_registry_id_${slot}`];
      const batchId = report[`consumable_${slot}_batch_id`];

      if (isNonBillable && registryId) {
        const regInfo = registryMap[registryId] || { name: 'Unknown', openingDate: '-', closingDate: '-', status: '-' };
        detailedLogs.push({
          date: report.report_date,
          branch: report.branches?.branch_name || '-',
          consumableName: regInfo.name,
          batchId: batchId || 'N/A',
          openingDate: regInfo.openingDate,
          closingDate: regInfo.closingDate,
          serviceUsedBy: report.master_services?.service_name || 'Not Specified',
          serviceUsedCount: registryUseCounter[registryId] || 0,
          status: regInfo.status,
        });
      }
    }
  });

  return detailedLogs;
}

/**
 * Summary Report: aggregated consumption counts grouped by Consumable Name + Batch ID,
 * multiplied by the unit price to produce total operational cost.
 */
export async function getSummaryNonBillableReport(filters = {}) {
  let query = supabase
    .from('billable_report')
    .select(`
      id,
      ${SUMMARY_SLOT_SELECT}
    `);

  if (filters.branchId) query = query.eq('branch_id', filters.branchId);
  if (filters.startDate) query = query.gte('report_date', filters.startDate);
  if (filters.endDate) query = query.lte('report_date', filters.endDate);

  const { data: reports, error } = await query;
  if (error) throw error;

  // Fetch product names and base pricing scales from the inventory master records.
  const { data: registry } = await supabase
    .from('non_billable_consumable_registry')
    .select('id, master_non_billable_consumables ( product_name, cost )');

  const registryMap = {};
  (registry || []).forEach((reg) => {
    registryMap[reg.id] = {
      name: reg.master_non_billable_consumables?.product_name || 'Unknown',
      cost: Number(reg.master_non_billable_consumables?.cost) || 0,
    };
  });

  // Group items strictly by the clean Product Name string parameter.
  const summaryGroup = {};
  (reports || []).forEach((report) => {
    for (let slot = 1; slot <= 14; slot++) {
      const isNonBillable = report[`is_non_billable_${slot}`];
      const registryId = report[`non_billable_registry_id_${slot}`];

      if (isNonBillable && registryId) {
        const regInfo = registryMap[registryId] || { name: 'Unknown', cost: 0 };
        const productName = regInfo.name;

        if (!summaryGroup[productName]) {
          summaryGroup[productName] = {
            'NON-BILLABLE CONSUMABLE': productName,
            'QUANTITY USED': 0,
            _unitCost: regInfo.cost,
          };
        }
        summaryGroup[productName]['QUANTITY USED'] += 1;
      }
    }
  });

  // Process data map back into clean array rows with computed arithmetic costs.
  return Object.values(summaryGroup).map((item) => {
    const totalCost = item['QUANTITY USED'] * item._unitCost;
    return {
      'NON-BILLABLE CONSUMABLE': item['NON-BILLABLE CONSUMABLE'],
      'QUANTITY USED': item['QUANTITY USED'],
      'TOTAL COST': totalCost,
    };
  });
}
