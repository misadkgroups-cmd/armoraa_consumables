// ============================================================================
// aiChatApi.js — ARMORAA read-only AI assistant (client side)
//
// Two-phase question answering:
//   Phase 1 — INTENT MATCHING: common questions map to predefined, hand-written
//             SQL. 100% accurate, zero AI cost, instant.
//   Phase 2 — LLM FALLBACK: anything else is sent to an LLM (OpenAI) with the
//             schema digest to generate a SELECT-only query. Optional — only
//             active when VITE_OPENAI_API_KEY is configured.
//
// SAFETY: every query — predefined OR AI-generated — runs through the
// ai_exec_sql Postgres RPC (see supabase/migrations/20260910_ai_assistant.sql),
// which executes as the SELECT-only armoraa_ai_reader role. Nothing in this
// file can write to the database.
// ============================================================================

import { supabase } from '../config/supabase';

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';

/** Run a SELECT-only query through the hardened DB RPC. */
export async function runReadOnlySql(sql) {
  const { data, error } = await supabase.rpc('ai_exec_sql', { p_sql: sql });
  if (error) throw new Error(error.message);
  return data || [];
}

const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString());

// Pick a random line from a list — keeps replies from sounding robotic.
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const todayLabel = () => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const yesterdayLabel = () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// ---------------------------------------------------------------------------
// Phase 1: predefined intents (regex -> SQL builder).
// Each intent understands many phrasings and replies in natural language.
// ---------------------------------------------------------------------------

const INTENTS = [
  {
    id: 'bills_today',
    match: /bills?\s*(created|made|registered|today|so far)|how\s*many\s*bills?\s*today|today'?s?\s*bills?|bills?\s*count\s*today/i,
    build: () => `SELECT COUNT(*) AS n FROM billing_log WHERE service_date = CURRENT_DATE AND deleted_at IS NULL`,
    answer: (r) => {
      const n = r[0]?.n || 0;
      if (n === 0) return pick([
        `No bills have been created yet today (${todayLabel()}).`,
        `It's still early — zero bills registered today so far.`,
        `Nothing on the books for today yet.`,
      ]);
      return pick([
        `**${fmt(n)} bill${n === 1 ? '' : 's'}** created so far today (${todayLabel()}).`,
        `We've logged **${fmt(n)} bill${n === 1 ? '' : 's'}** today.`,
        `Today's bill count is at **${fmt(n)}** and counting.`,
      ]);
    },
  },
  {
    id: 'bills_yesterday',
    match: /bills?\s*(yesterday|previous\s*day)|how\s*many\s*bills?\s*yesterday|yesterday'?s?\s*bills?/i,
    build: () => `SELECT COUNT(*) AS n FROM billing_log WHERE service_date = CURRENT_DATE - 1 AND deleted_at IS NULL`,
    answer: (r) => {
      const n = r[0]?.n || 0;
      return pick([
        `Yesterday (${yesterdayLabel()}) had **${fmt(n)} bill${n === 1 ? '' : 's'}**.`,
        `**${fmt(n)} bill${n === 1 ? '' : 's'}** were created yesterday.`,
        `We closed yesterday at **${fmt(n)} bill${n === 1 ? '' : 's'}**.`,
      ]);
    },
  },
  {
    id: 'bills_month',
    match: /bills?\s*(this|per|last)\s*month|monthly\s*(comparison|trend|report)|month\s*wise|month\s*by\s*month|how\s*many\s*bills?\s*(this|per)\s*month/i,
    build: () => `SELECT DATE_TRUNC('month', service_date)::date AS month, COUNT(*) AS bills FROM billing_log WHERE deleted_at IS NULL AND service_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months' GROUP BY 1 ORDER BY month`,
    answer: (r) => {
      if (!r.length) return "I don't have any bill data for the recent months.";
      const parts = r.map((x) => `${x.month}: **${fmt(x.bills)}**`).join(' · ');
      return `Here's the monthly bill count for the last few months — ${parts}.`;
    },
  },
  {
    id: 'top_services',
    match: /top\s*services?|popular\s*services?|most\s*(billed|used|popular)\s*services?|which\s*services?\s*(are|were)|best\s*services?/i,
    build: () => `SELECT service_name, SUM(times_billed) AS times_billed FROM v_service_usage WHERE month >= DATE_TRUNC('month', CURRENT_DATE) GROUP BY service_name ORDER BY times_billed DESC LIMIT 10`,
    answer: (r) => {
      if (!r.length) return "No service billing data yet this month.";
      const top = r.slice(0, 3).map((x, i) => `${i + 1}. ${x.service_name} (${fmt(x.times_billed)})`).join(', ');
      return `The most-billed services this month: ${top}. Full breakdown is in the table.`;
    },
  },
  {
    id: 'top_doctors',
    match: /top\s*doctors?|most\s*active\s*doctors?|best\s*doctors?|which\s*doctor|doctor\s*(performance|ranking|wise)/i,
    build: () => `SELECT md.doctor_name AS doctor, COUNT(*) AS bills FROM billing_log b JOIN master_doctors md ON md.id = b.doctor_id WHERE b.deleted_at IS NULL AND b.service_date >= DATE_TRUNC('month', CURRENT_DATE) GROUP BY md.doctor_name ORDER BY bills DESC LIMIT 10`,
    answer: (r) => {
      if (!r.length) return "I couldn't find any doctor billing records this month.";
      const top = r.slice(0, 3).map((x, i) => `${i + 1}. ${x.doctor} (${fmt(x.bills)})`).join(', ');
      return `Top doctors by bill count this month: ${top}. More details in the table.`;
    },
  },
  {
    id: 'branch_performance',
    match: /branch\s*(performance|comparison|wise|ranking)|top\s*branches?|which\s*branch|best\s*branch|branch\s*report/i,
    build: () => `SELECT branch_name, total_bills, completed_bills FROM v_branch_performance ORDER BY total_bills DESC`,
    answer: (r) => {
      if (!r.length) return "No branch data available.";
      const top = r[0];
      return `${r.length} branches on record. Leading is **${top.branch_name}** with **${fmt(top.total_bills)}** total bills (${fmt(top.completed_bills)} complete). Full comparison in the table.`;
    },
  },
  {
    id: 'low_stock',
    match: /low\s+stock|below\s*(minimum|reorder)|stock\s*alert|running\s*out|out\s*of\s*stock|reorder|which\s*(items?|products?|consumables?)\s*(are|is)\s*low/i,
    build: () => `SELECT 'Billable' AS stock_type, mbc.product_name, br.branch_name, bs.available_stock, mbc.minimum_stock FROM billable_stock bs JOIN master_billable_consumables mbc ON mbc.id = bs.consumable_id JOIN branches br ON br.id = bs.branch_id WHERE bs.available_stock < GREATEST(mbc.minimum_stock, 1) UNION ALL SELECT 'Non-Billable', mnc.product_name, br.branch_name, ns.available_stock, mnc.minimum_stock FROM non_billable_stock ns JOIN master_non_billable_consumables mnc ON mnc.id = ns.consumable_id JOIN branches br ON br.id = ns.branch_id WHERE ns.available_stock < GREATEST(mnc.minimum_stock, 1) ORDER BY stock_type, branch_name, product_name`,
    answer: (r) => {
      if (!r.length) return pick([`Good news — nothing is below minimum stock right now. All items are adequately stocked.`, `All clear on the stock front. Every item is at or above its minimum level.`]);
      const names = r.slice(0, 5).map((x) => `${x.product_name} (${x.branch_name})`).join(', ');
      return `**${r.length} item${r.length === 1 ? '' : 's'}** below minimum stock: ${names}${r.length > 5 ? ` and ${r.length - 5} more` : ''}. Check the table for exact quantities.`;
    },
  },
  {
    id: 'current_stock',
    match: /(current|total|overall)\s*stock|stock\s*(level|status|report|position)|show\s*stock|stock\s*list|how\s*much\s*stock/i,
    build: () => `SELECT 'Billable' AS stock_type, mbc.product_name, br.branch_name, bs.available_stock FROM billable_stock bs JOIN master_billable_consumables mbc ON mbc.id = bs.consumable_id JOIN branches br ON br.id = bs.branch_id UNION ALL SELECT 'Non-Billable', mnc.product_name, br.branch_name, ns.available_stock FROM non_billable_stock ns JOIN master_non_billable_consumables mnc ON mnc.id = ns.consumable_id JOIN branches br ON br.id = ns.branch_id ORDER BY stock_type, branch_name, product_name LIMIT 200`,
    answer: (r) => {
      if (!r.length) return "No stock records found.";
      const branches = new Set(r.map((x) => x.branch_name)).size;
      return `Showing current stock for **${r.length} item-location combinations** across **${branches} branch${branches === 1 ? '' : 'es'}**. Scroll the table for details.`;
    },
  },
  {
    id: 'stock_transfers',
    match: /stock\s*transfers?\s*(today|yesterday)?|transfers?\s*(today|yesterday)|any\s*transfers?/i,
    build: (m) => {
      const day = /yesterday/i.test(m) ? 'CURRENT_DATE - 1' : 'CURRENT_DATE';
      // stock_transfers has transferred_at (NOT created_at) and no deleted_at.
      return `SELECT st.product_name, br.branch_name AS from_branch, st.status, st.quantity, st.transferred_at FROM stock_transfers st LEFT JOIN branches br ON br.id = st.from_branch_id WHERE st.transferred_at::date = ${day} ORDER BY st.transferred_at DESC LIMIT 100`;
    },
    answer: (r) => {
      if (!r.length) return pick([`No stock transfers recorded for that day.`, `The transfer log is empty for that date.`]);
      return `**${r.length} transfer${r.length === 1 ? '' : 's'}** on record — details in the table.`;
    },
  },
  {
    id: 'most_used_consumables',
    match: /most\s*used\s*consumables?|consumable\s*(usage|consumption|report)|top\s*consumables?|which\s*consumables?\s*(are|were)|popular\s*consumables?/i,
    build: () => `SELECT consumable_name, product_type, SUM(total_units) AS total_units, SUM(times_used) AS times_used FROM v_consumable_usage GROUP BY consumable_name, product_type ORDER BY total_units DESC LIMIT 15`,
    answer: (r) => {
      if (!r.length) return "No consumable usage data recorded yet.";
      const top = r.slice(0, 3).map((x, i) => `${i + 1}. ${x.consumable_name} (${fmt(x.total_units)} units)`).join(', ');
      return `Most-used consumables by volume: ${top}. Full list in the table.`;
    },
  },
  {
    id: 'who_changed_bill',
    match: /who\s*(changed|edited|updated|modified)\s*bill|audit.*bill|history.*bill|what.*changed.*bill|track\s*bill/i,
    build: (m) => {
      // bill_no is TEXT (e.g. "B-1024", "BL/25/001") — accept alphanumerics,
      // slash, dash. Escape single quotes so the value can't break out.
      const raw = ((m.match(/bill\s*#?\s*([A-Za-z0-9/_-]+)/i) || [])[1] || '').trim();
      if (!raw) return `SELECT bill_no, consumable_name, old_units, units AS new_units, action_type, entered_by, created_at FROM consumable_history ORDER BY created_at DESC LIMIT 50`;
      const billNo = raw.replace(/'/g, "''").slice(0, 60);
      return `SELECT bill_no, consumable_name, old_units, units AS new_units, action_type, entered_by, created_at FROM consumable_history WHERE bill_no ILIKE '%${billNo}%' ORDER BY created_at DESC LIMIT 50`;
    },
    answer: (r) => {
      if (!r.length) return pick([`No change history found for that bill number in consumable_history.`, `I couldn't find any edits recorded for that bill.`]);
      const people = [...new Set(r.map((x) => x.entered_by))].join(', ');
      return `**${r.length} change${r.length === 1 ? '' : 's'}** recorded for that bill, made by ${people}. See the table for what was modified and when.`;
    },
  },
  {
    id: 'changes_yesterday',
    match: /what\s*(was\s*)?changed\s*yesterday|changes?\s*yesterday|audit.*yesterday|yesterday'?s?\s*changes?|edits?\s*yesterday/i,
    build: () => `SELECT bill_no, consumable_name, old_units, units AS new_units, action_type, entered_by, created_at FROM consumable_history WHERE created_at::date = CURRENT_DATE - 1 ORDER BY created_at DESC LIMIT 100`,
    answer: (r) => {
      if (!r.length) return pick([`No edits or changes were recorded yesterday.`, `Yesterday's audit log is clean — nothing was changed.`]);
      return `**${r.length} change${r.length === 1 ? '' : 's'}** were made yesterday. Details in the table.`;
    },
  },
  {
    id: 'bill_mismatch',
    match: /bill\s*mismatch|mismatch(ed)?\s*bills?|incomplete\s*consumables?|complete\s*but\s*no\s*consumables?|missing\s*consumables?/i,
    build: () => `SELECT b.bill_no, b.patient_name, bs.service_name, bs.consumable_completed FROM bill_services bs JOIN billing_log b ON b.id = bs.bill_id WHERE bs.consumable_completed = false AND b.bill_status = 'Complete' AND b.deleted_at IS NULL ORDER BY b.bill_no LIMIT 100`,
    answer: (r) => {
      if (!r.length) return pick([`Everything checks out — no bills are marked Complete without consumables being recorded.`, `No mismatches found. All completed bills have their consumables logged.`]);
      return `**${r.length} service${r.length === 1 ? '' : 's'}** flagged — bill is Complete but consumables weren't recorded. See the table to follow up.`;
    },
  },
  {
    id: 'top_staff',
    match: /top\s*staff|most\s*active\s*staff|staff\s*(ranking|performance|wise)|busiest\s*staff/i,
    build: () => `SELECT ms.staff_name AS staff, COUNT(*) AS bills FROM billing_log b JOIN master_staff ms ON ms.id = b.staff_id WHERE b.deleted_at IS NULL AND b.service_date >= DATE_TRUNC('month', CURRENT_DATE) GROUP BY ms.staff_name ORDER BY bills DESC LIMIT 10`,
    answer: (r) => {
      if (!r.length) return "I couldn't find any staff records for this month.";
      const top = r.slice(0, 3).map((x, i) => `${i + 1}. ${x.staff} (${fmt(x.bills)})`).join(', ');
      return `Top staff members by bill volume this month: ${top}. Details in the table.`;
    },
  },
  {
    id: 'total_patients',
    match: /(total|how\s*many|all)\s*patients?|patient\s*count|unique\s*patients?/i,
    build: () => `SELECT COUNT(DISTINCT patient_name) AS unique_patients, COUNT(*) AS total_visits FROM billing_log WHERE deleted_at IS NULL`,
    answer: (r) => {
      const p = r[0]?.unique_patients || 0;
      const v = r[0]?.total_visits || 0;
      return `**${fmt(p)} unique patient${p === 1 ? '' : 's'}** on record across **${fmt(v)} total visit${v === 1 ? '' : 's'}**.`;
    },
  },
  {
    id: 'completed_bills',
    match: /completed?\s*bills?|how\s*many\s*complete\s*bills?|bills?\s*completed/i,
    build: () => `SELECT COUNT(*) AS n FROM billing_log WHERE bill_status = 'Complete' AND deleted_at IS NULL`,
    answer: (r) => {
      const n = r[0]?.n || 0;
      return `There are **${fmt(n)} completed bill${n === 1 ? '' : 's'}** across all branches.`;
    },
  },
  {
    id: 'incomplete_bills',
    match: /incomplet(e|ed)\s*bills?|pending\s*bills?|bills?\s*incomplete/i,
    build: () => `SELECT b.bill_no, b.patient_name, b.service_date, br.branch_name FROM billing_log b JOIN branches br ON br.id = b.branch_id WHERE b.bill_status != 'Complete' AND b.deleted_at IS NULL ORDER BY b.service_date DESC LIMIT 50`,
    answer: (r) => {
      if (!r.length) return "All bills are complete! No pending or incomplete bills found.";
      return `**${r.length} incomplete bill${r.length === 1 ? '' : 's'}** found requiring consumable entry. See table below.`;
    },
  },
  {
    id: 'recent_activity',
    match: /recent\s*(activity|logs?|actions?)|who\s*did\s*what|system\s*activity/i,
    build: () => `SELECT username, branch_name, page_name, action, remarks, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 25`,
    answer: (r) => {
      if (!r.length) return "No recent activity logs recorded.";
      return `Here are the latest **${r.length} activity log${r.length === 1 ? '' : 's'}** in the table below.`;
    },
  },
];

// ---------------------------------------------------------------------------
// Keyword fuzzy matcher — the safety net between strict regex and the LLM.
// Scores each intent by keyword overlap with the user's question and returns
// the best match only if it clears a confidence threshold.
// ---------------------------------------------------------------------------
const KEYWORD_HINTS = {
  bills_today: ['bill', 'today', 'created', 'registered', 'so far'],
  bills_yesterday: ['bill', 'yesterday', 'previous day'],
  bills_month: ['bill', 'month', 'monthly', 'monthwise', 'trend', 'per month'],
  top_services: ['service', 'popular', 'most billed', 'most used', 'top service'],
  top_doctors: ['doctor', 'dr', 'physician', 'most active', 'top doctor', 'busiest'],
  top_staff: ['staff', 'therapist', 'assistant', 'top staff', 'busiest staff'],
  total_patients: ['patient', 'patients', 'unique patient', 'patient count'],
  completed_bills: ['complete bill', 'completed bills', 'complete count'],
  incomplete_bills: ['incomplete bill', 'pending bills', 'pending bill'],
  branch_performance: ['branch', 'top branch', 'which branch', 'branch wise', 'comparison'],
  low_stock: ['low stock', 'running out', 'out of stock', 'reorder', 'below minimum', 'stock alert', 'minimum'],
  current_stock: ['stock', 'stock level', 'stock position', 'how much stock', 'current stock', 'stock report', 'inventory'],
  stock_transfers: ['transfer', 'transferred', 'stock transfer'],
  most_used_consumables: ['consumable', 'most used', 'consumption', 'usage', 'top consumable'],
  who_changed_bill: ['who changed', 'who edited', 'audit', 'history', 'track bill', 'modified'],
  changes_yesterday: ['changed yesterday', 'edits yesterday', 'yesterday', 'audit'],
  bill_mismatch: ['mismatch', 'incomplete', 'complete but', 'missing consumables'],
  recent_activity: ['activity', 'recent activity', 'activity log', 'who logged'],
};

function matchByKeywords(text) {
  const q = text.toLowerCase();
  const words = new Set(q.split(/\W+/).filter(Boolean));
  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const hints = KEYWORD_HINTS[intent.id] || [];
    let score = 0;
    for (const hint of hints) {
      if (hint.includes(' ')) {
        if (q.includes(hint)) score += 3;            // multi-word phrase match
      } else if (words.has(hint)) {
        score += 1;                                 // single word match
      }
    }
    if (score > bestScore) { bestScore = score; best = intent; }
  }
  // Require a meaningful match (a phrase or 2+ keywords). "stock" alone is
  // ambiguous (low stock vs current stock vs transfers), so threshold = 2.
  if (best && bestScore >= 2) return best;
  return null;
}

/**
 * Answer a question.
 * @returns {Promise<{sql: string, rows: Array, text: string, source: string}>}
 */
export async function askQuestion(message) {
  const text = String(message || '').trim();
  if (!text) throw new Error('Please type a question.');

  // ---- Phase 1: predefined intent ----
  for (const intent of INTENTS) {
    const m = text.match(intent.match);
    if (m) {
      const sql = intent.build(text);
      const rows = await runReadOnlySql(sql);
      return { sql, rows, text: intent.answer(rows), source: 'predefined' };
    }
  }

  // ---- Phase 1.5: keyword fuzzy match ----
  // If strict regex missed, route by keywords so "show me bills" / "which doctor
  // did the most" / "low stock items" still land on the right report.
  const fuzzy = matchByKeywords(text);
  if (fuzzy) {
    const sql = fuzzy.build(text);
    const rows = await runReadOnlySql(sql);
    return { sql, rows, text: fuzzy.answer(rows), source: 'predefined' };
  }

  // ---- Phase 2: LLM fallback (optional) ----
  if (OPENAI_KEY) {
    const sql = await generateSqlWithLlm(text);
    const rows = await runReadOnlySql(sql);
    return {
      sql,
      rows,
      text: rows.length
        ? `Here's what I found for "${text}" — **${rows.length} row${rows.length === 1 ? '' : 's'}** in the table below.`
        : `I ran a query for "${text}" but it came back empty — no matching records right now.`,
      source: 'llm',
    };
  }

  throw new Error(
    pick([
      `I'm not sure I understood that. I can help with bills, stock, branches, services, doctors, consumables and audit trails — try rephrasing, or tap one of the quick buttons above.`,
      `Hmm, I don't have a report for that exact question yet. Try asking about today's bills, low stock, branch performance, or who changed a bill — or use a quick button.`,
      `I didn't catch that one. Things I'm good at: bill counts, stock levels, top services/doctors/branches, consumable usage, and audit history. Give one of those a shot!`,
    ])
  );
}

// ---------------------------------------------------------------------------
// Phase 2: LLM natural language -> SQL (optional; needs VITE_OPENAI_API_KEY)
// ---------------------------------------------------------------------------

const SCHEMA_DIGEST = [
  'Tables (Postgres):',
  '- billing_log(id, bill_no TEXT, uid, patient_name, doctor_id, staff_id, service_date DATE, branch_id, bill_status Check(Complete|Incomplete), created_at, deleted_at)',
  '- bill_services(id, bill_id references billing_log.id, service_id, service_name, service_status, consumable_completed BOOL)',
  '- branches(id, branch_name, status)',
  '- master_doctors(id, doctor_name), master_staff(id, staff_name)',
  '- master_billable_consumables(id, product_name, unit, minimum_stock, status), master_non_billable_consumables(id, product_name, minimum_stock, status)',
  '- billable_stock(consumable_id, branch_id, available_stock NUMERIC), non_billable_stock(consumable_id, branch_id, available_stock NUMERIC)',
  "- stock_transactions(id, transaction_type Inward|Outward|Transfer|Adjustment, product_type, consumable_id, branch_id, quantity NUMERIC, created_at)",
  '- stock_transfers(id, product_name, product_id, from_branch_id, to_branch_id, quantity NUMERIC, status, transferred_at)',
  '- billable_report(id, bill_id TEXT, bill_no TEXT, service_id, machinery_id, report_date DATE, branch_id, billing_log_id, consumable_X_id/units NUMERIC, is_non_billable_X BOOL for X=1..14, updated_by)',
  '- billable_report_consumables(report_id, product_type, consumable_id, units NUMERIC, is_non_billable, registry_id, batch_id, slot_number) — NO consumable_name column; resolve names via master_billable_consumables / master_non_billable_consumables',
  '- bill_service_consumables(bill_service_id, product_type, consumable_id, used_quantity NUMERIC, status)',
  "- consumable_history(bill_id, bill_service_id, service_id, service_name, consumable_id, consumable_name, product_type, units, old_units, action_type Added|Updated|Deleted, branch_id, entered_by, created_at, bill_no, patient_name)",
  '- audit_logs(id, username, branch_name, module_name, action_type, table_name, record_id, old_data JSONB, new_data JSONB, created_at)',
  '- activity_logs(id, username, branch_name, page_name, action, remarks, created_at)',
  'Views: v_daily_activity(branch_id, branch_name, service_date, bill_count), v_branch_performance(branch_id, branch_name, total_bills, completed_bills), v_service_usage(service_name, branch_id, branch_name, month, times_billed), v_consumable_usage(consumable_name, product_type, branch_id, branch_name, total_units, times_used)',
].join('\n');

const SYSTEM_PROMPT = `You are a SQL generator for a clinic MIS. Convert the user's question into ONE PostgreSQL SELECT statement.
Rules:
- Output ONLY the SQL. No prose, no markdown fences, no semicolon.
- SELECT/WITH only. NEVER write INSERT, UPDATE, DELETE, DROP, ALTER or any data-modifying statement.
- Use only the tables/views listed. bill_no is TEXT. Use ILIKE for name searches.
- Limit result rows to 100 unless it is a full aggregation.
- Dates: today is CURRENT_DATE.
${SCHEMA_DIGEST}`;

async function generateSqlWithLlm(question) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI service error (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  let sql = (json.choices?.[0]?.message?.content || '').trim();
  // Strip markdown fences if the model added them anyway.
  sql = sql.replace(/^```(?:sql)?/i, '').replace(/```$/, '').trim();
  // Client-side last-line guard (the DB RPC is the real enforcement).
  if (!/^\s*(SELECT|WITH)\b/i.test(sql) || /;\s*\S/i.test(sql)) {
    throw new Error('The AI generated an unsafe query and it was blocked.');
  }
  return sql;
}

// Quick buttons shown in the chat widget.
export const QUICK_ACTIONS = [
  { label: "Today's Bills", question: 'How many bills were created today?' },
  { label: "Yesterday's Bills", question: 'How many bills were created yesterday?' },
  { label: 'Top Services', question: 'Show top services this month' },
  { label: 'Top Doctors', question: 'Show top doctors this month' },
  { label: 'Branch Performance', question: 'Show branch performance' },
  { label: 'Low Stock', question: 'Show low stock items' },
  { label: 'Monthly Trend', question: 'Show bills per month' },
  { label: 'Stock Transfers', question: 'Show stock transfers today' },
  { label: 'Most Used Consumables', question: 'Show most used consumables' },
  { label: 'Bill Mismatch', question: 'Show bill mismatch' },
];


