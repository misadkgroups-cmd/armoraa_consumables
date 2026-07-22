import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetry';

// Log audit trail for data changes
export async function logAudit({
  username,
  branchName,
  moduleName,
  actionType, // CREATE, UPDATE, DELETE
  tableName,
  recordId,
  oldData = null,
  newData = null
}) {
  try {
    const { error } = await withRetry(() =>
      supabase
        .from('audit_logs')
        .insert({
          username: username || 'System',
          branch_name: branchName || null,
          module_name: moduleName,
          action_type: actionType,
          table_name: tableName,
          record_id: recordId,
          old_data: oldData,
          new_data: newData
        })
    );
    
    if (error) {
      console.error('Audit log error (503 retries exhausted):', error.message);
    }
    return { success: !error };
  } catch (e) {
    console.error('Error logging audit:', e);
    return { success: false };
  }
}

// Log activity
export async function logActivity({
  username,
  branchName,
  pageName,
  action,
  remarks = ''
}) {
  try {
    const { error } = await withRetry(() =>
      supabase
        .from('activity_logs')
        .insert({
          username: username || 'System',
          branch_name: branchName || null,
          page_name: pageName,
          action: action,
          remarks: remarks
        })
    );
    
    if (error) {
      console.error('Activity log error (503 retries exhausted):', error.message);
    }
    return { success: !error };
  } catch (e) {
    console.error('Error logging activity:', e);
    return { success: false };
  }
}

// Get audit history for a record
export async function getAuditHistory(tableName, recordId, limit = 50) {
  try {
    const { data, error } = await withRetry(() => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false });
      
      if (limit) query = query.limit(limit);
      
      return query;
    });
    
    if (error) {
      console.warn('Get audit history error:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Error fetching audit history:', e);
    return [];
  }
}

// Get activity logs (for page-level history)
export async function getActivityLogs(pageName = null, limit = 50) {
  try {
    const { data, error } = await withRetry(() => {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (pageName) query = query.eq('page_name', pageName);
      if (limit) query = query.limit(limit);
      
      return query;
    });
    
    if (error) {
      console.warn('Get activity logs error:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Error fetching activity logs:', e);
    return [];
  }
}

// Log bill history
export async function logBillHistory({
  billId,
  username,
  actionType, // CREATE, UPDATE, DELETE, STATUS_CHANGE
  fieldName = null,
  oldValue = null,
  newValue = null
}) {
  try {
    const { error } = await withRetry(() =>
      supabase
        .from('bill_history')
        .insert({
          bill_id: billId,
          username: username || 'System',
          action_type: actionType,
          field_name: fieldName,
          old_value: oldValue,
          new_value: newValue
        })
    );
    
    if (error) {
      console.error('Bill history log error (503 retries exhausted):', error.message);
    }
    return { success: !error };
  } catch (e) {
    console.error('Error logging bill history:', e);
    return { success: false };
  }
}
