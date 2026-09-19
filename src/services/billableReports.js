import { supabase } from '../config/supabase';
import { fetchAllRows, chunk } from '../utils/supabaseRetry';
import { round2 } from '../utils/numUtils';

/**
 * Generates the Billable Report data directly from the relational database hierarchy:
 * billing_log -> bill_services -> bill_service_consumables (Source of Truth).
 * 
 * Supports both:
 * 1. Billable consumables: user quantity, cost from master_billable_consumables.cost_unit
 * 2. Non-Billable consumables: visual "USED", backend stored units = 1, cost = 0.00 (no cost lookup/inflation)
 * 
 * Fully paginates all queries to eliminate PostgREST's 1000-row limit on month-long date ranges.
 */
export async function getBillableReportFromServiceConsumables(filters = {}) {
  const { startDate, endDate, branchId, serviceId, machineryIds } = filters;

  // 1. Fetch bills from billing_log in the date range and branch (fully paginated)
  const bills = await fetchAllRows(() => {
    let q = supabase
      .from('billing_log')
      .select('id, bill_no, uid, patient_name, doctor_id, staff_id, service_date, branch_id')
      .gte('service_date', startDate)
      .lte('service_date', endDate)
      .is('deleted_at', null)
      .order('id', { ascending: true });
    if (branchId) q = q.eq('branch_id', branchId);
    return q;
  });

  if (!bills || bills.length === 0) return [];

  const billById = new Map((bills || []).map((b) => [Number(b.id), b]));
  const billIds = (bills || []).map((b) => b.id);

  // 2. Fetch all bill_services for these bills (fully paginated)
  let billServices = [];
  for (const ids of chunk(billIds, 100)) {
    const rows = await fetchAllRows(() => {
      let q = supabase
        .from('bill_services')
        .select('id, bill_id, service_id, service_name')
        .in('bill_id', ids)
        .is('deleted_at', null);
      if (serviceId) q = q.eq('service_id', serviceId);
      return q;
    });
    billServices.push(...rows);
  }
  if (billServices.length === 0) return [];

  const bsIds = billServices.map((bs) => bs.id);

  // 3. Fetch relational consumables from bill_service_consumables (fully paginated)
  let usage = [];
  for (const ids of chunk(bsIds, 100)) {
    const rows = await fetchAllRows(() =>
      supabase
        .from('bill_service_consumables')
        .select('bill_service_id, product_type, consumable_id, used_quantity')
        .in('bill_service_id', ids)
        .eq('status', 'Used')
        .is('deleted_at', null)
    );
    usage.push(...rows);
  }

  // 4. Fetch Billable master products
  const bIds = [...new Set(usage.filter((u) => u.product_type !== 'Non-Billable').map((u) => u.consumable_id).filter(Boolean))];
  const billableMap = {};
  for (const ids of chunk(bIds, 100)) {
    if (!ids.length) break;
    const rows = await fetchAllRows(() =>
      supabase.from('master_billable_consumables').select('id, product_name, cost_unit').in('id', ids)
    );
    (rows || []).forEach((p) => {
      billableMap[p.id] = { name: p.product_name, cost: Number(p.cost_unit || 0) };
    });
  }

  // 5. Fetch Non-Billable master products (Cost is always 0 for non-billable)
  const nbIds = [...new Set(usage.filter((u) => u.product_type === 'Non-Billable').map((u) => u.consumable_id).filter(Boolean))];
  const nbMap = {};
  for (const ids of chunk(nbIds, 100)) {
    if (!ids.length) break;
    const rows = await fetchAllRows(() =>
      supabase.from('master_non_billable_consumables').select('id, product_name').in('id', ids)
    );
    (rows || []).forEach((p) => {
      nbMap[p.id] = { name: p.product_name, cost: 0 };
    });
  }

  // Fallback lookup in registry for any missing non-billables
  const missingNbIds = nbIds.filter((id) => !nbMap[id]);
  if (missingNbIds.length > 0) {
    for (const ids of chunk(missingNbIds, 100)) {
      const rows = await fetchAllRows(() =>
        supabase
          .from('non_billable_consumable_registry')
          .select('id, product_id, master_non_billable_consumables ( product_name )')
          .in('id', ids)
      );
      (rows || []).forEach((reg) => {
        nbMap[reg.id] = {
          name: reg.master_non_billable_consumables?.product_name || `Non-Billable Item #${reg.id}`,
          cost: 0,
        };
      });
    }
  }

  // 6. Fetch machinery from billable_report lookup (fully paginated)
  const reportMap = {};
  for (const ids of chunk(billIds, 100)) {
    const rows = await fetchAllRows(() =>
      supabase
        .from('billable_report')
        .select('*')
        .in('billing_log_id', ids)
    );
    (rows || []).forEach((r) => {
      reportMap[`${r.billing_log_id}__${r.service_id}`] = r;
    });
  }

  const missMach = [...new Set(Object.values(reportMap).map((r) => r.machinery_id).filter(Boolean))];
  const machNameMap = {};
  for (const ids of chunk(missMach, 100)) {
    if (!ids.length) break;
    const rows = await fetchAllRows(() =>
      supabase.from('master_machinery').select('id, machine_name').in('id', ids)
    );
    (rows || []).forEach((m) => {
      machNameMap[m.id] = m.machine_name;
    });
  }

  // 7. Hydrate Branch, Doctor, Staff metadata
  const branchIds = [...new Set((bills || []).map((b) => b.branch_id).filter(Boolean))];
  const branchMap = {};
  if (branchIds.length) {
    for (const ids of chunk(branchIds, 100)) {
      const rows = await fetchAllRows(() => supabase.from('branches').select('id, branch_name').in('id', ids));
      (rows || []).forEach((b) => { branchMap[b.id] = b.branch_name; });
    }
  }

  const docIds = [...new Set((bills || []).map((b) => b.doctor_id).filter(Boolean))];
  const stfIds = [...new Set((bills || []).map((b) => b.staff_id).filter(Boolean))];
  const docMap = {};
  const stfMap = {};
  if (docIds.length) {
    for (const ids of chunk(docIds, 100)) {
      const rows = await fetchAllRows(() => supabase.from('master_doctors').select('id, doctor_name').in('id', ids));
      (rows || []).forEach((d) => { docMap[d.id] = d.doctor_name; });
    }
  }
  if (stfIds.length) {
    for (const ids of chunk(stfIds, 100)) {
      const rows = await fetchAllRows(() => supabase.from('master_staff').select('id, staff_name').in('id', ids));
      (rows || []).forEach((s) => { stfMap[s.id] = s.staff_name; });
    }
  }

  // Group usage by bill_service_id
  const usageByBs = new Map();
  usage.forEach((u) => {
    const k = Number(u.bill_service_id);
    if (!usageByBs.has(k)) usageByBs.set(k, []);
    usageByBs.get(k).push(u);
  });

  const wantedMach = machineryIds && machineryIds.length ? new Set(machineryIds.map(Number)) : null;
  const rows = [];

  // Iterate over every service in the matching bills
  for (const bs of billServices) {
    const bill = billById.get(Number(bs.bill_id));
    if (!bill) continue;

    const rep = reportMap[`${bill.id}__${bs.service_id}`] || null;
    if (wantedMach && (!rep || !wantedMach.has(Number(rep.machinery_id)))) continue;

    const items = usageByBs.get(Number(bs.id)) || [];
    const consumables = [];
    let totalUnits = 0;
    let totalCost = 0;
    let slot = 0;

    if (items.length > 0) {
      // Primary: Read from bill_service_consumables (Source of Truth)
      items.forEach((u) => {
        const isNb = u.product_type === 'Non-Billable';
        if (isNb) {
          slot += 1;
          const name = (nbMap[u.consumable_id] || {}).name || `Non-Billable Item #${u.consumable_id}`;
          consumables.push({
            slot,
            name,
            units: 1, // Non-billables stored as 1
            price: 0,
            amount: 0,
            cost: 0, // Cost is strictly 0.00
            isNonBillable: true,
          });
          totalUnits = round2(totalUnits + 1);
        } else {
          const units = Number(u.used_quantity || 0);
          if (!(units > 0)) return;
          const p = billableMap[u.consumable_id] || { name: `Billable Item #${u.consumable_id}`, cost: 0 };
          slot += 1;
          consumables.push({
            slot,
            name: p.name,
            units,
            cost: p.cost,
          });
          totalUnits = round2(totalUnits + units);
          totalCost = round2(totalCost + units * p.cost);
        }
      });
    } else if (rep) {
      // Fallback: If legacy billable_report has flat slots populated
      for (let i = 1; i <= 14; i++) {
        const cId = rep[`consumable_${i}_id`];
        const units = Number(rep[`consumable_${i}_units`] || 0);
        const isNb = !!rep[`is_non_billable_${i}`];
        const regId = rep[`non_billable_registry_id_${i}`];
        if (isNb) {
          slot += 1;
          const name = (nbMap[regId] || {}).name || (nbMap[cId] || {}).name || `Non-Billable Item #${regId || cId || i}`;
          consumables.push({
            slot,
            name,
            units: 1,
            cost: 0,
            price: 0,
            amount: 0,
            isNonBillable: true,
          });
          totalUnits = round2(totalUnits + 1);
        } else if (cId && units > 0) {
          const p = billableMap[cId] || { name: `Billable Item #${cId}`, cost: 0 };
          slot += 1;
          consumables.push({
            slot,
            name: p.name,
            units,
            cost: p.cost,
          });
          totalUnits = round2(totalUnits + units);
          totalCost = round2(totalCost + units * p.cost);
        }
      }
    }

    const machineName = (rep && rep.machine_name) || (rep && rep.machinery_id ? machNameMap[rep.machinery_id] : null) || '-';

    rows.push({
      id: `bsc-${bs.id}`,
      billing_log_id: bill.id,
      bill_no: bill.bill_no || '-',
      bill_id: bill.bill_no || '-',
      uid: bill.uid || '-',
      patient_name: bill.patient_name || '-',
      report_date: bill.service_date || (rep && rep.report_date) || '-',
      branch_id: bill.branch_id,
      branch_name: (bill.branch_id ? branchMap[bill.branch_id] : null) || '-',
      doctor_name: (bill.doctor_id ? docMap[bill.doctor_id] : null) || '-',
      staff_name: (bill.staff_id ? stfMap[bill.staff_id] : null) || '-',
      service_id: bs.service_id,
      service_name: bs.service_name || '-',
      machinery_id: (rep && rep.machinery_id) || null,
      machine_name: machineName,
      consumables,
      consumableCount: consumables.length,
      totalUnits,
      totalCost,
    });
  }

  rows.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  return rows;
}

// ---------------------------------------------------------------------------
// CASCADING (real-time dependent) FILTER SUPPORT
// ---------------------------------------------------------------------------
// The Billable Report screen exposes four filters: Date range, Branch, Service
// and Machinery. Plain master-list dropdowns let users pick combinations that
// can never produce a row (e.g. a service a branch never performed), so these
// filters are driven by the ACTUAL report data instead:
//
//   * The date range is the "universe".
//   * Every (bill -> service -> machinery) combination inside it becomes a
//     "fact" row.
//   * Each dropdown then shows only the values present in the facts that also
//     satisfy the OTHER currently-selected filters.
//
// Result: choosing a date hides services/machinery that never occurred on that
// date, choosing a branch hides services/machinery that branch never used, and
// choosing a service hides machinery that never ran it — instead of showing
// every master record.

/**
 * Loads the filter "facts" for a date range: one row per
 * bill -> service -> machinery combination, plus the display names needed to
 * label the dropdowns.
 *
 * @param  {object}  options
 * @param  {string}  options.startDate  yyyy-MM-dd
 * @param  {string}  options.endDate    yyyy-MM-dd
 * @returns {Promise<{facts: Array<{branch_id:(number|null), service_id:(number|null), machinery_id:(number|null)}>,
 *                    serviceNames: Object<string,string>,
 *                    machineryNames: Object<string,string>}>}
 */
export async function getReportFilterFacts({ startDate, endDate } = {}) {
  const empty = { facts: [], serviceNames: {}, machineryNames: {} };
  if (!startDate || !endDate) return empty;

  // 1. Bills inside the date range (the facts universe).
  const bills = await fetchAllRows(() =>
    supabase
      .from('billing_log')
      .select('id, branch_id')
      .gte('service_date', startDate)
      .lte('service_date', endDate)
      .is('deleted_at', null)
      .order('id', { ascending: true })
  );
  if (!bills || bills.length === 0) return empty;

  const billById = new Map((bills || []).map((b) => [Number(b.id), b]));
  const billIds = (bills || []).map((b) => b.id);

  // 2. Services attached to those bills.
  let billServices = [];
  for (const ids of chunk(billIds, 100)) {
    const rows = await fetchAllRows(() =>
      supabase
        .from('bill_services')
        .select('bill_id, service_id')
        .in('bill_id', ids)
        .is('deleted_at', null)
    );
    billServices.push(...rows);
  }
  if (billServices.length === 0) return empty;

  // 3. Machinery recorded for each (bill, service) pair.
  const reportMap = {};
  for (const ids of chunk(billIds, 100)) {
    const rows = await fetchAllRows(() =>
      supabase
        .from('billable_report')
        .select('billing_log_id, service_id, machinery_id')
        .in('billing_log_id', ids)
    );
    (rows || []).forEach((r) => {
      reportMap[`${r.billing_log_id}__${r.service_id}`] = r;
    });
  }

  // 4. Flatten into fact rows.
  const facts = [];
  billServices.forEach((bs) => {
    const bill = billById.get(Number(bs.bill_id));
    if (!bill) return;
    const rep = reportMap[`${bs.bill_id}__${bs.service_id}`];
    facts.push({
      branch_id: bill.branch_id != null ? Number(bill.branch_id) : null,
      service_id: bs.service_id != null ? Number(bs.service_id) : null,
      machinery_id: rep && rep.machinery_id != null ? Number(rep.machinery_id) : null,
    });
  });

  // 5. Resolve display names for the ids actually present.
  const serviceNames = {};
  const machineryNames = {};
  const svcIds = [...new Set(facts.map((f) => f.service_id).filter(Boolean))];
  const machIds = [...new Set(facts.map((f) => f.machinery_id).filter(Boolean))];

  for (const ids of chunk(svcIds, 100)) {
    if (!ids.length) break;
    const rows = await fetchAllRows(() =>
      supabase.from('master_services').select('id, service_name').in('id', ids)
    );
    (rows || []).forEach((s) => {
      serviceNames[s.id] = s.service_name;
    });
  }
  for (const ids of chunk(machIds, 100)) {
    if (!ids.length) break;
    const rows = await fetchAllRows(() =>
      supabase.from('master_machinery').select('id, machine_name').in('id', ids)
    );
    (rows || []).forEach((m) => {
      machineryNames[m.id] = m.machine_name;
    });
  }

  return { facts, serviceNames, machineryNames };
}

/**
 * Computes which filter values are still valid for the CURRENT selections.
 *
 * Standard cascading rule: the options for a facet are the values found in the
 * fact rows that satisfy every OTHER facet. A facet never filters itself, so
 * the value the user just picked always stays visible in its own dropdown.
 *
 * @param  {Array}  facts       rows produced by getReportFilterFacts
 * @param  {object} selections  { branchId, serviceId, machineryIds }
 * @returns {{branchIds: Set<number>, serviceIds: Set<number>, machineryIds: Set<number>}}
 */
export function computeCascadingFacets(facts = [], selections = {}) {
  const branchSel = selections.branchId ? String(selections.branchId) : '';
  const serviceSel = selections.serviceId ? String(selections.serviceId) : '';
  const machSel = new Set(
    (selections.machineryIds || []).map(Number).filter((n) => Number.isFinite(n))
  );
  const hasMachSel = machSel.size > 0;

  const branchIds = new Set();
  const serviceIds = new Set();
  const machineryIds = new Set();

  (facts || []).forEach((row) => {
    const branchOk = !branchSel || String(row.branch_id) === branchSel;
    const serviceOk = !serviceSel || String(row.service_id) === serviceSel;
    const machOk = !hasMachSel || machSel.has(Number(row.machinery_id));

    // Branch facet: honour service + machinery, ignore the branch selection.
    if (serviceOk && machOk && row.branch_id != null) branchIds.add(Number(row.branch_id));
    // Service facet: honour branch + machinery, ignore the service selection.
    if (branchOk && machOk && row.service_id != null) serviceIds.add(Number(row.service_id));
    // Machinery facet: honour branch + service, ignore the machinery selection.
    if (branchOk && serviceOk && row.machinery_id != null) machineryIds.add(Number(row.machinery_id));
  });

  return { branchIds, serviceIds, machineryIds };
}



