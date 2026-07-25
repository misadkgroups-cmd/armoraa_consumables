import { supabase } from '../config/supabase';

export const getAuditHistory = async (tableName, recordId) => {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching audit history:', error);
    return [];
  }
};

export const getActivityLogs = async (moduleName, recordId) => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('module_name', moduleName)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return [];
  }
};

export const logAudit = async ({
  tableName,
  recordId,
  actionType,
  fieldName,
  oldValue,
  newValue,
  performedBy,
  performedByName,
  performedByRole,
  branchId
}) => {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        table_name: tableName,
        record_id: recordId,
        action_type: actionType,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        performed_by: performedBy,
        performed_by_name: performedByName,
        performed_by_role: performedByRole,
        branch_id: branchId
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error logging audit:', error);
    return false;
  }
};

export const logActivity = async ({
  moduleName,
  recordId,
  activityType,
  activityDescription,
  userId,
  userName,
  userRole,
  branchId
}) => {
  try {
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        module_name: moduleName,
        record_id: recordId,
        activity_type: activityType,
        activity_description: activityDescription,
        user_id: userId,
        user_name: userName,
        user_role: userRole,
        branch_id: branchId
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error logging activity:', error);
    return false;
  }
};

export const getDashboardKPIs = async (branchId, dateRange) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Bills created today
    let billsQuery = supabase
      .from('activity_logs')
      .select('id', { count: 'exact' })
      .eq('module_name', 'billing_log')
      .eq('activity_type', 'created')
      .eq('created_at', today);

    if (branchId) {
      billsQuery = billsQuery.eq('branch_id', branchId);
    }

    const { count: billsCreated, error: billsError } = await billsQuery;
    if (billsError) throw billsError;

    // Bills edited today
    let editedQuery = supabase
      .from('activity_logs')
      .select('id', { count: 'exact' })
      .eq('module_name', 'billing_log')
      .eq('activity_type', 'edited')
      .eq('created_at', today);

    if (branchId) {
      editedQuery = editedQuery.eq('branch_id', branchId);
    }

    const { count: billsEdited, error: editedError } = await editedQuery;
    if (editedError) throw editedError;

    // Consumables completed today
    let consumablesQuery = supabase
      .from('activity_logs')
      .select('id', { count: 'exact' })
      .eq('module_name', 'billable_consumables')
      .eq('activity_type', 'consumables_completed')
      .eq('created_at', today);

    if (branchId) {
      consumablesQuery = consumablesQuery.eq('branch_id', branchId);
    }

    const { count: consumablesCompleted, error: consumablesError } = await consumablesQuery;
    if (consumablesError) throw consumablesError;

    // Most active user
    const { data: userActivity, error: userError } = await supabase
      .from('activity_logs')
      .select('user_name, user_role')
      .eq('created_at', today)
      .order('created_at', { ascending: false })
      .limit(1);

    const mostActiveUser = userActivity && userActivity.length > 0 ? userActivity[0] : null;

    return {
      billsCreated: billsCreated || 0,
      billsEdited: billsEdited || 0,
      consumablesCompleted: consumablesCompleted || 0,
      mostActiveUser
    };
  } catch (error) {
    console.error('Error fetching dashboard KPIs:', error);
    return {
      billsCreated: 0,
      billsEdited: 0,
      consumablesCompleted: 0,
      mostActiveUser: null
    };
  }
};