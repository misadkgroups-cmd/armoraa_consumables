import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetry';

/**
 * Detailed Report: enriched non-billable batch and usage logs.
 * Shows BOTH batches used in services and registered completed/active batches with 0 service usages.
 */
export async function getDetailedNonBillableReport(filters = {}) {
  const registryUseCounter = {};
  const serviceEntriesByRegistryId = {};

  // 1. Fetch registry items for the branch & date range
  let registryQuery = supabase
    .from('non_billable_consumable_registry')
    .select(`
      id,
      branch_id,
      product_id,
      batch_id,
      opening_date,
      closing_date,
      status,
      branches ( branch_name ),
      master_non_billable_consumables ( product_name, cost )
    `);

  if (filters.branchId) registryQuery = registryQuery.eq('branch_id', filters.branchId);
  if (filters.startDate) registryQuery = registryQuery.gte('opening_date', filters.startDate);
  if (filters.endDate) registryQuery = registryQuery.lte('opening_date', filters.endDate);

  const { data: registryRows } = await withRetry(() =>
    registryQuery.order('opening_date', { ascending: false })
  );

  // 2. Fetch service usages from billable_report
  try {
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

    (reports || []).forEach((report) => {
      (report.billable_report_consumables || []).forEach((item) => {
        if (item.is_non_billable && item.registry_id) {
          registryUseCounter[item.registry_id] = (registryUseCounter[item.registry_id] || 0) + 1;
          if (!serviceEntriesByRegistryId[item.registry_id]) {
            serviceEntriesByRegistryId[item.registry_id] = [];
          }
          serviceEntriesByRegistryId[item.registry_id].push({ report, item });
        }
      });
    });
  } catch (normalizedError) {
    // Fallback: Query legacy 14-slot format from billable_report
    try {
      const batchFields = [];
      const registryFields = [];
      for (let i = 1; i <= 14; i++) {
        batchFields.push(`consumable_${i}_batch_id`);
        registryFields.push(`non_billable_registry_id_${i}`);
      }

      let query = supabase
        .from('billable_report')
        .select(`id, report_date, branch_id, service_id, bill_id, uid, branches(branch_name), master_services(service_name), ${batchFields.join(', ')}, ${registryFields.join(', ')}`);

      if (filters.branchId) query = query.eq('branch_id', filters.branchId);
      if (filters.startDate) query = query.gte('report_date', filters.startDate);
      if (filters.endDate) query = query.lte('report_date', filters.endDate);

      const { data: reportsWithSlots, error } = await withRetry(() => query);
      if (!error && reportsWithSlots) {
        reportsWithSlots.forEach((report) => {
          for (let i = 1; i <= 14; i++) {
            const batchId = report[`consumable_${i}_batch_id`];
            const registryId = report[`non_billable_registry_id_${i}`];
            if (registryId) {
              registryUseCounter[registryId] = (registryUseCounter[registryId] || 0) + 1;
              if (!serviceEntriesByRegistryId[registryId]) {
                serviceEntriesByRegistryId[registryId] = [];
              }
              serviceEntriesByRegistryId[registryId].push({
                report,
                item: { registry_id: registryId, batch_id: batchId || null },
              });
            }
          }
        });
      }
    } catch (legacyError) {
      console.error('Error querying legacy billable_report slots:', legacyError);
    }
  }

  // 3. Hydrate any missing registry records for service usages opened outside the date range
  const knownRegistryIds = new Set((registryRows || []).map((r) => r.id));
  const missingRegistryIds = Object.keys(serviceEntriesByRegistryId)
    .map(Number)
    .filter((id) => !knownRegistryIds.has(id));

  let extraRegistryRows = [];
  if (missingRegistryIds.length > 0) {
    const { data: extraReg } = await withRetry(() =>
      supabase
        .from('non_billable_consumable_registry')
        .select(`
          id,
          branch_id,
          product_id,
          batch_id,
          opening_date,
          closing_date,
          status,
          branches ( branch_name ),
          master_non_billable_consumables ( product_name, cost )
        `)
        .in('id', missingRegistryIds)
    );
    if (extraReg) extraRegistryRows = extraReg;
  }

  const allRegistryMap = {};
  [...(registryRows || []), ...extraRegistryRows].forEach((reg) => {
    allRegistryMap[reg.id] = reg;
  });

  // 4. Construct detailed rows
  const detailedLogs = [];
  const processedRegistryIds = new Set();

  // Add all registry batches in the period
  (registryRows || []).forEach((reg) => {
    processedRegistryIds.add(reg.id);
    const serviceEntries = serviceEntriesByRegistryId[reg.id] || [];
    const count = registryUseCounter[reg.id] || 0;
    const productName = reg.master_non_billable_consumables?.product_name || 'Unknown';
    const branchName = reg.branches?.branch_name || '-';
    const closingDate = reg.closing_date || 'Active (Open)';

    if (serviceEntries.length > 0) {
      serviceEntries.forEach(({ report, item }) => {
        detailedLogs.push({
          date: report.report_date || reg.opening_date,
          branch: report.branches?.branch_name || branchName,
          consumableName: productName,
          batchId: item.batch_id || reg.batch_id || 'N/A',
          openingDate: reg.opening_date,
          closingDate: closingDate,
          serviceUsedBy: report.master_services?.service_name || 'Not Specified',
          serviceUsedCount: count,
          status: reg.status,
        });
      });
    } else {
      // 0 usages in service logs - show batch registry row with 0 count
      detailedLogs.push({
        date: reg.opening_date,
        branch: branchName,
        consumableName: productName,
        batchId: reg.batch_id || 'N/A',
        openingDate: reg.opening_date,
        closingDate: closingDate,
        serviceUsedBy: '-',
        serviceUsedCount: 0,
        status: reg.status,
      });
    }
  });

  // Add any service usage entries for batches opened prior to the date range
  Object.entries(serviceEntriesByRegistryId).forEach(([regIdStr, entries]) => {
    const regId = Number(regIdStr);
    if (!processedRegistryIds.has(regId)) {
      const reg = allRegistryMap[regId];
      const count = registryUseCounter[regId] || 0;
      const productName = reg?.master_non_billable_consumables?.product_name || 'Unknown';
      const branchName = reg?.branches?.branch_name || '-';
      const openingDate = reg?.opening_date || '-';
      const closingDate = reg?.closing_date || (reg ? 'Active (Open)' : '-');
      const status = reg?.status || '-';

      entries.forEach(({ report, item }) => {
        detailedLogs.push({
          date: report.report_date || openingDate,
          branch: report.branches?.branch_name || branchName,
          consumableName: productName,
          batchId: item.batch_id || reg?.batch_id || 'N/A',
          openingDate: openingDate,
          closingDate: closingDate,
          serviceUsedBy: report.master_services?.service_name || 'Not Specified',
          serviceUsedCount: count,
          status: status,
        });
      });
    }
  });

  // Sort descending by date
  detailedLogs.sort((a, b) => {
    const dateA = a.date || a.openingDate || '';
    const dateB = b.date || b.openingDate || '';
    return dateB.localeCompare(dateA);
  });

  return detailedLogs;
}

/**
 * Summary Report: aggregated consumption counts grouped by Consumable Name.
 * Shows Completed Qty, Incomplete Qty, Total Registry Count, Service Usage Count,
 * Opening Stock, Received, Used, and Closing Stock.
 */
export async function getSummaryNonBillableReport(filters = {}) {
  // 1. Fetch all master products so product names and costs are always available
  const { data: masterProducts } = await withRetry(() =>
    supabase
      .from('master_non_billable_consumables')
      .select('id, product_name, cost, status')
      .order('product_name')
  );
  const productMap = {};
  (masterProducts || []).forEach((p) => {
    productMap[p.id] = p;
  });

  // 2. Fetch registry items for the branch and date range
  let registryQuery = supabase
    .from('non_billable_consumable_registry')
    .select('id, product_id, status, opening_date, closing_date, batch_id');

  if (filters.branchId) registryQuery = registryQuery.eq('branch_id', filters.branchId);
  if (filters.startDate) registryQuery = registryQuery.gte('opening_date', filters.startDate);
  if (filters.endDate) registryQuery = registryQuery.lte('opening_date', filters.endDate);

  const { data: allRegistry } = await withRetry(() => registryQuery);

  const registryStatusByProduct = {}; // productId -> { completed: 0, incomplete: 0, total: 0 }
  const registryIdToProductId = {};

  (allRegistry || []).forEach((reg) => {
    const pid = reg.product_id;
    registryIdToProductId[reg.id] = pid;
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

  // 3. Fetch service usage counts from billable_report
  const usageByProduct = {}; // productId -> service count
  try {
    let query = supabase
      .from('billable_report')
      .select(`
        id,
        billable_report_consumables!inner (
          id,
          product_type,
          consumable_id,
          is_non_billable,
          registry_id
        )
      `);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.startDate) query = query.gte('report_date', filters.startDate);
    if (filters.endDate) query = query.lte('report_date', filters.endDate);

    const { data: reports, error } = await withRetry(() => query);
    if (error) throw error;

    (reports || []).forEach((report) => {
      (report.billable_report_consumables || []).forEach((item) => {
        if (item.is_non_billable && item.registry_id) {
          const pid = registryIdToProductId[item.registry_id] || item.consumable_id;
          if (pid) {
            usageByProduct[pid] = (usageByProduct[pid] || 0) + 1;
          }
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
        .select(`id, ${registryFields.join(', ')}`);

      if (filters.branchId) query = query.eq('branch_id', filters.branchId);
      if (filters.startDate) query = query.gte('report_date', filters.startDate);
      if (filters.endDate) query = query.lte('report_date', filters.endDate);

      const { data: reports } = await withRetry(() => query);
      if (reports) {
        reports.forEach((report) => {
          for (let i = 1; i <= 14; i++) {
            const registryId = report[`non_billable_registry_id_${i}`];
            if (registryId) {
              const pid = registryIdToProductId[registryId];
              if (pid) {
                usageByProduct[pid] = (usageByProduct[pid] || 0) + 1;
              }
            }
          }
        });
      }
    } catch (legacyError) {
      console.error('Error fetching summary usage from legacy columns:', legacyError);
    }
  }

  // 4. Fetch current stock levels
  let stockQuery = supabase
    .from('non_billable_stock')
    .select('consumable_id, available_stock');

  if (filters.branchId) stockQuery = stockQuery.eq('branch_id', filters.branchId);

  const { data: stockData } = await withRetry(() => stockQuery);
  const stockMap = {};
  (stockData || []).forEach((s) => {
    stockMap[s.consumable_id] = Number(s.available_stock) || 0;
  });

  // 5. Aggregate summary per product
  const allProductIds = new Set([
    ...Object.keys(registryStatusByProduct).map(Number),
    ...Object.keys(usageByProduct).map(Number),
    ...Object.keys(stockMap).map(Number),
  ]);

  const summaryGroup = {};

  allProductIds.forEach((pid) => {
    const product = productMap[pid];
    if (!product) return;

    const productName = product.product_name;
    const regCounts = registryStatusByProduct[pid] || { completed: 0, incomplete: 0, total: 0 };
    const serviceUsageCount = usageByProduct[pid] || 0;
    const closingStock = stockMap[pid] || 0;
    const openingStock = closingStock + regCounts.total;
    const unitCost = Number(product.cost) || 0;
    const totalCost = serviceUsageCount * unitCost;

    if (regCounts.total > 0 || serviceUsageCount > 0 || closingStock > 0) {
      summaryGroup[productName] = {
        'NON-BILLABLE CONSUMABLE': productName,
        'COMPLETED QTY': regCounts.completed,
        'INCOMPLETE QTY': regCounts.incomplete,
        'TOTAL REGISTRY COUNT': regCounts.total,
        'SERVICE USAGE COUNT': serviceUsageCount,
        'OPENING STOCK': openingStock,
        'RECEIVED': 0,
        'USED': regCounts.total,
        'CLOSING STOCK': closingStock,
        'TOTAL COST': totalCost,
      };
    }
  });

  return Object.values(summaryGroup).sort((a, b) =>
    a['NON-BILLABLE CONSUMABLE'].localeCompare(b['NON-BILLABLE CONSUMABLE'])
  );
}