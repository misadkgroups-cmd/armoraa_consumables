// chatFlow.js — Multi-step conversational flows for the AI assistant.
// Every SQL string here runs through the read-only ai_exec_sql RPC, so all
// interpolated values are strictly validated/escaped (see numId / parseDateInput).
import { supabase } from '../config/supabase';
const fmtDate = (d) => { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return day + '.' + m + '.' + y; };
export const toIsoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseDateInput = (s) => {
  const t = String(s || '').trim();
  const dm = t.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (dm) {
    const iso = dm[3] + '-' + String(dm[2]).padStart(2, '0') + '-' + String(dm[1]).padStart(2, '0');
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : iso;
  }
  const im = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (im) {
    const d = new Date(t + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : t;
  }
  return '';
};
const numId = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null; };
function detectFlow(t){t=t.toLowerCase();if(/\b(services?\s*detail|service\s*status|complete\s*services?|incomplete\s*services?)\b/.test(t))return'services';if(/\b(report\s*analys|billable\s*report|non[-\s]?billable\s*report|transaction\s*report)\b/.test(t))return'report';if(/\b(transfer|stock\s*transfer|transfers)\b/.test(t))return'transfer';if(/\b(stock\s*manag|stock\s*level|current\s|low\s*stock|inventory)\b/.test(t))return'stock';return null}
function norm(input,step){const r=String(input).trim();if(step.options&&Array.isArray(step.options)){const m=step.options.find(o=>(typeof o==='string'?o:o.label).toLowerCase()===r.toLowerCase()||(o&&o.value!=null&&String(o.value)===r));if(m)return typeof m==='string'?m:m.value}return r}
const F = { services: { label: 'Services Details', steps: [{ key: 'status', text: 'Show services with which status?', options: ['Complete', 'Incomplete', 'All'] }, { key: 'branch', text: 'Which branch?', options: 'branches', a: true }, { key: 'startDate', text: 'Start date? (DD.MM.YYYY)', d: true }, { key: 'endDate', text: 'End date? (DD.MM.YYYY)', d: true }],b: (s) => { const w = ['b.deleted_at IS NULL']; if (s.status === 'Complete') w.push('bs.consumable_completed=true'); else if (s.status === 'Incomplete') w.push('bs.consumable_completed=false'); const bid = numId(s.branch); if (bid) w.push('b.branch_id=' + bid); const sd = parseDateInput(s.startDate); if (sd) w.push("b.service_date>='" + sd + "'"); const ed = parseDateInput(s.endDate); if (ed) w.push("b.service_date<='" + ed + "'"); return "SELECT b.bill_no,b.patient_name,bs.service_name,bs.consumable_completed,b.service_date,br.branch_name FROM bill_services bs JOIN billing_log b ON b.id=bs.bill_id JOIN branches br ON br.id=b.branch_id WHERE " + w.join(' AND ') + " ORDER BY b.service_date DESC LIMIT 200" }, m: (r, s) => {if(!r.length)return"No "+(s.status||'')+" services found.";const l=s.status&&s.status!=='All'?s.status.toLowerCase():'';return"Found **"+r.length+" "+l+" service"+(r.length===1?'':'s')+"** (see table)."}},
 report: { label: 'Report Analysis', steps: [{ key: 'reportType', text: 'Which report type?', options: ['Billable', 'Non-Billable', 'Transaction'] }, { key: 'branch', text: 'Which branch?', options: 'branches', a: true }, { key: 'startDate', text: 'Start date? (DD.MM.YYYY)', d: true }, { key: 'endDate', text: 'End date? (DD.MM.YYYY)', d: true }], b: (s) => {const t = s.reportType || 'Billable'; if (t === 'Transaction') { const w = ['1=1']; const tbid = numId(s.branch); if (tbid) w.push('(st.from_branch_id=' + tbid + ' OR st.to_branch_id=' + tbid + ')'); const tsd = parseDateInput(s.startDate); if (tsd) w.push("st.transferred_at::date>='" + tsd + "'"); const ted = parseDateInput(s.endDate); if (ted) w.push("st.transferred_at::date<='" + ted + "'"); return "SELECT st.product_name,st.from_branch_id,st.to_branch_id,st.quantity,st.status,st.transferred_at FROM stock_transfers st WHERE " + w.join(' AND ') + " ORDER BY st.transferred_at DESC LIMIT 200"; } const w = ['1=1']; const rbid = numId(s.branch); if (rbid) w.push('br.branch_id=' + rbid); const rsd = parseDateInput(s.startDate); if (rsd) w.push("br.report_date>='" + rsd + "'"); const red = parseDateInput(s.endDate); if (red) w.push("br.report_date<='" + red + "'");w.push(t==='Non-Billable'?"brc.product_type='Non-Billable'":"brc.product_type='Billable'");return "SELECT br.bill_no,br.bill_id,br.report_date,br.branch_id,COALESCE(mbc.product_name, mnbc.product_name, 'Item #' || brc.consumable_id::text) AS consumable_name,brc.units,brc.product_type FROM billable_report br JOIN billable_report_consumables brc ON brc.report_id=br.id LEFT JOIN master_billable_consumables mbc ON brc.product_type='Billable' AND mbc.id=brc.consumable_id LEFT JOIN master_non_billable_consumables mnbc ON brc.product_type='Non-Billable' AND mnbc.id=COALESCE(brc.registry_id, brc.consumable_id) WHERE "+w.join(' AND ')+" ORDER BY br.report_date DESC LIMIT 200"},m:(r,s)=>{if(!r.length)return"No "+(s.reportType||'')+" report data found.";return"**"+r.length+" row(s)** of "+(s.reportType||'')+" report data (see table)."}},
 transfer: { label: 'Transfer', steps: [{ key: 'branch', text: 'Which branch?', options: 'branches', a: true }, { key: 'startDate', text: 'Start date? (DD.MM.YYYY)', d: true }, { key: 'endDate', text: 'End date? (DD.MM.YYYY)', d: true }], b: (s) => { const w = ['1=1']; const bid = numId(s.branch); if (bid) w.push('(st.from_branch_id=' + bid + ' OR st.to_branch_id=' + bid + ')'); const sd = parseDateInput(s.startDate); if (sd) w.push("st.transferred_at::date>='" + sd + "'"); const ed = parseDateInput(s.endDate); if (ed) w.push("st.transferred_at::date<='" + ed + "'"); return "SELECT st.product_name,st.from_branch_id,st.to_branch_id,st.quantity,st.status,st.transferred_at FROM stock_transfers st WHERE " + w.join(' AND ') + " ORDER BY st.transferred_at DESC LIMIT 200"; },m:r=>{if(!r.length)return'No transfers found.';return"**"+r.length+" transfer(s)** found (see table)."}},
 stock: { label: 'Stock Management', steps: [{ key: 'stockFilter', text: 'What would you like to see?', options: ['Low Stock', 'All Stock'] }, { key: 'productType', text: 'Filter by type?', options: ['All', 'Billable', 'Non-Billable'] }, { key: 'branch', text: 'Which branch?', options: 'branches', a: true }], b: (s) => { const pt = s.productType || 'All', low = s.stockFilter === 'Low Stock', u = []; const sbid = numId(s.branch); if (pt === 'All' || pt === 'Billable') { let q = "SELECT 'Billable' AS stock_type,mbc.product_name,br.branch_name,bs.available_stock AS current_stock,mbc.minimum_stock FROM billable_stock bs JOIN master_billable_consumables mbc ON mbc.id=bs.consumable_id JOIN branches br ON br.id=bs.branch_id WHERE 1=1"; if (low) q += " AND bs.available_stock<GREATEST(mbc.minimum_stock,1)"; if (sbid) q += " AND bs.branch_id=" + sbid; u.push(q); } if (pt === 'All' || pt === 'Non-Billable') { let q = "SELECT 'Non-Billable' AS stock_type,mnc.product_name,br.branch_name,ns.available_stock AS current_stock,mnc.minimum_stock FROM non_billable_stock ns JOIN master_non_billable_consumables mnc ON mnc.id=ns.consumable_id JOIN branches br ON br.id=ns.branch_id WHERE 1=1"; if (low) q += " AND ns.available_stock<GREATEST(mnc.minimum_stock,1)"; if (sbid) q += " AND ns.branch_id=" + sbid; u.push(q); }return u.join(' UNION ALL ')+" ORDER BY stock_type,branch_name,product_name LIMIT 200"},m:(r,s)=>{if(!r.length)return"No "+(s.stockFilter||'stock')+" items found.";return"**"+r.length+" item(s)** of "+(s.stockFilter||'')+" ("+(s.productType||'All')+") (see table)."}}};
async function askStep(state) {
  const flow = F[state.flow];
  const step = flow.steps[state.stepIndex];
  let options = step.options;
  if (options === 'branches') {
    const { data } = await supabase.from('branches').select('id,branch_name').order('branch_name');
    options = (data || []).map((b) => ({ label: b.branch_name, value: String(b.id) }));
    if (step.a) options.unshift({ label: 'All Branches', value: 'all' });
    // Persist resolved options on the returned state so runFlowStep can
    // validate the user's answer against the actual branch list.
    state = { ...state, stepOptions: options };
  }let prefill='';if(step.d){if(step.key==='startDate')prefill=fmtDate(new Date(Date.now()-30*86400000));if(step.key==='endDate')prefill=fmtDate(new Date())}return{done:false,text:step.text,options,prefill,state}}
export async function runFlowStep(state, userInput) {
  if (!state || !state.flow) { const fk = detectFlow(String(userInput || '')); if (!fk) return null; return askStep({ flow: fk, stepIndex: 0, answers: {} }); }
  const flow = F[state.flow];
  if (!flow) return null;
  const step = flow.steps[state.stepIndex];
  if (!step) return { done: true, text: 'Something went wrong restarting that flow — please pick a category again.', rows: [], state: null };
  const next = { flow: state.flow, stepIndex: state.stepIndex, answers: { ...(state.answers || {}) }, stepOptions: state.stepOptions };
  // Branch answers must come from the offered buttons (never free-typed ids).
  if (step.key === 'branch') {
    const raw = String(userInput || '').trim();
    const opts = Array.isArray(state.stepOptions) ? state.stepOptions : (Array.isArray(step.options) ? step.options : null);
    const valid = opts ? opts.some((o) => (typeof o === 'string' ? o : o.label).toLowerCase() === raw.toLowerCase() || (o && o.value != null && String(o.value) === raw)) : (/^\d+$/.test(raw) || /^all( branches)?$/i.test(raw));
    if (!valid) return { done: false, text: 'Please pick a branch from the buttons above.', options: opts || step.options, prefill: '', state: next };
    const normed = norm(userInput, { ...step, options: opts || step.options });
    if (!opts && !/^\d+$/.test(String(normed)) && !/^all( branches)?$/i.test(String(normed))) {
      return { done: false, text: 'Please pick a branch from the buttons above.', options: opts || step.options, prefill: '', state: next };
    }
    next.answers[step.key] = normed;
    next.stepIndex++;
    if (next.stepIndex < flow.steps.length) return await askStep(next);
  } else if (step.d) {
    // Date steps: normalize DD.MM.YYYY -> ISO; re-ask on invalid input.
    const iso = parseDateInput(userInput);
    if (!iso) return { done: false, text: step.text + ' (use DD.MM.YYYY, e.g. ' + fmtDate(new Date()) + ')', options: step.options, prefill: '', state: next };
    next.answers[step.key] = iso;
    next.stepIndex++;
    if (next.stepIndex < flow.steps.length) return await askStep(next);
  } else {
    next.answers[step.key] = norm(userInput, step);
    next.stepIndex++;
    if (next.stepIndex < flow.steps.length) return await askStep(next);
  }
  const sql = flow.b(next.answers);
  const { data, error } = await supabase.rpc('ai_exec_sql', { p_sql: sql });
  if (error) return { done: true, text: '⚠️ ' + error.message, rows: [], state: null };
  return { done: true, sql, rows: data || [], text: flow.m(data || [], next.answers), state: null };
}
export const FLOW_CATEGORIES = [{key:'services',label:'Services Details',sample:'Show complete services'},{key:'report',label:'Report Analysis',sample:'Billable report'},{key:'transfer',label:'Transfer',sample:'Transfers this month'},{key:'stock',label:'Stock Management',sample:'Low stock items'}];