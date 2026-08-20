import { supabase } from '../config/supabase';

// ---------------------------------------------------------------------------
// NOTE: These functions are written to the PRODUCTION schema (supabase/schema.sql):
//   audit_logs   -> id, username, branch_name, module_name, action_type,
//                   table_name, record_id, old_data, new_data, created_at
//   activity_logs-> id, username, branch_name, page_name, action, remarks, created_at
// ---------------------------------------------------------------------------

/**
 * Fetch field-level audit trail for a record.
 * Filters by table_name + record_id (both exist in the production schema).
 */
export const getAuditHistory = async (tableName, recordId) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
    .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching audit history:', error);
    return [];
  }
};

/**
 * Fetch page-level activity logs.
 * Production activity_logs has no record_id column, so logs are filtered by
 * page_name only. Pass the page (e.g. 'billing_log', 'stock_management').
 */
export const getActivityLogs = async (pageName) => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('page_name', pageName)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return [];
  }
};

/**
 * Fetch per-record bill history (the true per-bill audit trail).
 * bill_history exists in the production schema and carries bill_id.
 */
export const getBillHistory = async (billId) => {
  try {
    const { data, error } = await supabase
      .from('bill_history')
      .select('*')
      .eq('bill_id', billId)
    .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching bill history:', error);
    return [];
  }
};

/**
 * Fetch the billing_log row needed for fallback synthesis.
 * Schema note: billing_log has NO `completed_at` column, so completion time
 * falls back to `updated_at` per the task spec.
 */
export const getBillRecord = async (billId) => {
  if (!billId) return null;
  try {
    const { data, error } = await supabase
      .from('billing_log')
      .select(
        'id, bill_no, patient_name, created_at, updated_at, bill_status, created_by, updated_by'
      )
      .eq('id', billId)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching bill record for timeline:', error);
    return null;
  }
};

/**
 * Write a field-level audit row to `audit_logs` using the production columns.
 *
 * Old params (module_name/field_name/old_value/new_value/performed_by*) were
 * replaced with the actual schema: username, branch_name, module_name,
 * action_type, table_name, record_id, old_data, new_data.
 */
export const logAudit = async ({
  username,
  branchName = '',
  moduleName,
  actionType,
  tableName,
  recordId,
  oldData = null,
  newData = null,
}) => {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        username: username || 'System',
        branch_name: branchName,
        module_name: moduleName,
        action_type: actionType,
        table_name: tableName,
        record_id: recordId,
        old_data: oldData,
        new_data: newData,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error logging audit:', error);
    return false;
  }
};

/**
 * Write a page-level activity row to `activity_logs` using the production columns.
 *
 * Old params (module_name/record_id/activity_type/activity_description/
 * user_id/user_name/user_role/branch_id) were replaced with the actual schema:
 * username, branch_name, page_name, action, remarks.
 */
export const logActivity = async ({
  userName,
  branchName = '',
  pageName,
  action,
  remarks = '',
}) => {
  try {
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        username: userName || 'System',
        branch_name: branchName,
        page_name: pageName,
        action,
        remarks,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error logging activity:', error);
    return false;
  }
};

// ---------------------------------------------------------------------------
// Bill lifecycle timeline (with fallback for historical bills)
// ---------------------------------------------------------------------------
// The Audit Trail modal renders a single, accurate lifecycle for one bill.
// It is built from the *per-bill* audit sources:
//   1. bill_history  -> the true per-bill audit trail (CREATE/UPDATE/DELETE/STATUS_CHANGE)
//   2. audit_logs    -> field-level changes for this exact record (table_name + record_id)
//
// Historical bills were created before the Audit Trail feature existed, so they
// have no audit rows. For those bills we synthesize the missing markers from
// the bill's OWN columns so the timeline always shows the TRUE creation and
// completion timestamps:
//   - Created   -> billing_log.created_at  (NEVER updated_at / completed_at)
//   - Completed -> billing_log.updated_at  (or a completed_at column if one exists)
//
// Completion timestamps are NEVER substituted into the creation field.
// ---------------------------------------------------------------------------

const ACTIVITY_TYPE_LABELS = {
  created: 'Created',
  edited: 'Edited',
  deleted: 'Deleted',
  status_changed: 'Status Changed',
  service_added: 'Service Added',
  service_removed: 'Service Removed',
  consumables_completed: 'Consumables Completed',
  consumables_updated: 'Consumables Updated',
};

/**
 * Build a complete, accurate lifecycle timeline for a single bill.
 * Returns normalized entries sorted chronologically (oldest first), including
 * synthesized fallback markers when no genuine audit rows exist for the bill.
 */
export const getBillTimeline = async (billId) => {
  if (!billId) return [];

  try {
    const [billRecord, billHistory, auditHistory] = await Promise.all([
      getBillRecord(billId),
      getBillHistory(billId),
      getAuditHistory('billing_log', billId),
    ]);

    const normalized = [];

    // 1. bill_history = the true per-bill audit trail
    (billHistory || []).forEach((h) => {
      const rawType = (h.action_type || 'UPDATE').toUpperCase();
      const field = (h.field_name || '').toLowerCase();
      const type = field.includes('consumables')
        ? 'consumables_updated'
        : field.includes('service')
        ? 'service_added'
        : rawType === 'CREATE'
        ? 'created'
        : rawType === 'DELETE'
        ? 'deleted'
        : rawType === 'STATUS_CHANGE'
        ? 'status_changed'
        : 'edited';

      normalized.push({
        id: `bh-${h.id}`,
        source: 'bill_history',
        type,
        rawType,
        description:
          h.new_value ||
          (h.field_name ? `${h.field_name} updated` : 'Bill updated'),
        oldValue: h.old_value,
        newValue: h.new_value,
        userName: h.username || 'System',
        branchName: h.branch_name || '',
        createdAt: h.created_at,
      });
    });

    // 2. audit_logs = field-level changes for this exact record
    (auditHistory || []).forEach((a) => {
      const rawType = (a.action_type || 'UPDATE').toUpperCase();
      const type =
        rawType === 'CREATE' ? 'created' : rawType === 'DELETE' ? 'deleted' : 'edited';
      const billNo = a.new_data && a.new_data.bill_no ? a.new_data.bill_no : null;
      const description = a.field_name
        ? `${a.field_name} updated`
        : billNo
        ? `Bill #${billNo} updated`
        : 'Record updated';

      normalized.push({
        id: `al-${a.id}`,
        source: 'audit_logs',
        type,
        rawType,
        description,
        oldValue: a.old_data ? JSON.stringify(a.old_data, null, 2) : null,
        newValue: a.new_data ? JSON.stringify(a.new_data, null, 2) : null,
        userName: a.username || 'System',
        branchName: a.branch_name || '',
        createdAt: a.created_at,
      });
    });

    // 3. Fallback for historical bills (no audit rows exist for the bill).
    //    Determined ONLY from the per-bill sources above so page-wide activity
    //    logs cannot contaminate the Created/Completed markers. Creation always
    //    resolves to the bill's created_at; completion never overrides creation.
    if (billRecord) {
      const hasCreated = normalized.some((e) => e.type === 'created');
      const hasCompletion = normalized.some(
        (e) => e.type === 'status_changed' || e.rawType === 'STATUS_CHANGE'
      );

      if (!hasCreated) {
        // TRUE creation time — never a mutation timestamp.
        normalized.push({
          id: `fallback-created-${billRecord.id}`,
          source: 'fallback',
          type: 'created',
          rawType: 'created',
          description: `Bill #${billRecord.bill_no} created`,
          userName: 'System',
          branchName: '',
          createdAt: billRecord.created_at,
        });
      }

      // Only synthesize a Completion marker when the bill is actually Complete
      // AND no real completion event was recorded.
      const completedAt = billRecord.completed_at || billRecord.updated_at;
      if (
        billRecord.bill_status === 'Complete' &&
        !hasCompletion &&
        completedAt
      ) {
        normalized.push({
          id: `fallback-completed-${billRecord.id}`,
          source: 'fallback',
          type: 'status_changed',
          rawType: 'status_changed',
          description: `Bill #${billRecord.bill_no} marked as Complete`,
          userName: 'System',
          branchName: '',
          createdAt: completedAt,
        });
      }
    }

    // Chronological order (oldest first) — Created → Consumables Updated → Completed
    normalized.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    return normalized;
  } catch (e) {
    console.error('Error building bill timeline:', e);
    return [];
  }
};

/**
 * Dashboard KPIs based on the production activity_logs columns
 * (page_name + action). Falls back gracefully when no rows exist.
 */
export const getDashboardKPIs = async (branchId) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Bills created today
    let billsQuery = supabase
      .from('activity_logs')
      .select('id', { count: 'exact' })
      .eq('page_name', 'billing_log')
      .eq('action', 'created')
      .gte('created_at', today);

    if (branchId) {
      billsQuery = billsQuery.eq('branch_name', String(branchId));
    }

    const { count: billsCreated, error: billsError } = await billsQuery;
    if (billsError) throw billsError;

    // Bills edited today
    let editedQuery = supabase
      .from('activity_logs')
      .select('id', { count: 'exact' })
      .eq('page_name', 'billing_log')
      .eq('action', 'edited')
      .gte('created_at', today);

    if (branchId) {
      editedQuery = editedQuery.eq('branch_name', String(branchId));
    }

    const { count: billsEdited, error: editedError } = await editedQuery;
    if (editedError) throw editedError;

    // Consumables completed today
    let consumablesQuery = supabase
      .from('activity_logs')
      .select('id', { count: 'exact' })
      .eq('page_name', 'billable_consumables')
      .eq('action', 'consumables_completed')
      .gte('created_at', today);

    if (branchId) {
      consumablesQuery = consumablesQuery.eq('branch_name', String(branchId));
    }

    const { count: consumablesCompleted, error: consumablesError } = await consumablesQuery;
    if (consumablesError) throw consumablesError;

    // Most active user
    const { data: userActivity, error: userError } = await supabase
      .from('activity_logs')
      .select('username, branch_name')
      .order('created_at', { ascending: false })
      .limit(1);

    const mostActiveUser = userActivity && userActivity.length > 0 ? userActivity[0] : null;

    return {
      billsCreated: billsCreated || 0,
      billsEdited: billsEdited || 0,
      consumablesCompleted: consumablesCompleted || 0,
      mostActiveUser,
    };
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    return {
      billsCreated: 0,
      billsEdited: 0,
      consumablesCompleted: 0,
      mostActiveUser: null,
    };
  }
};
