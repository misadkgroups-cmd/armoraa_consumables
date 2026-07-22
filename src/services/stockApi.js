import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetry';

// Get current stock for a product
export async function getStock(productType, consumableId, branchId) {
  try {
    const { data, error } = await withRetry(() =>
      supabase
        .from('stock_inventory')
        .select('*')
        .eq('product_type', productType)
        .eq('consumable_id', consumableId)
        .eq('branch_id', branchId)
        .maybeSingle()
    );
    
    if (error) {
      console.warn('getStock: DB error after retries:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error('Error fetching stock:', e);
    return null;
  }
}

// Get all stock for a branch
export async function getBranchStock(branchId) {
  try {
    const { data, error } = await withRetry(() =>
      supabase
        .from('stock_inventory')
        .select('*')
        .eq('branch_id', branchId)
        .order('updated_at', { ascending: false })
    );
    
    if (error) {
      console.warn('getBranchStock: DB error after retries:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Error fetching branch stock:', e);
    return [];
  }
}

// Update stock (Inward/Outward/Adjustment/Transfer)
export async function updateStock({
  productType,
  consumableId,
  branchId,
  quantity, // positive for inward, negative for outward
  transactionType,
  remarks = '',
  createdBy = 'System'
}) {
  try {
    // Get current stock
    const currentStock = await getStock(productType, consumableId, branchId);
    let newStock;
    
    if (currentStock) {
      newStock = (currentStock.current_stock || 0) + quantity;
      if (newStock < 0) {
        return { success: false, message: 'Insufficient stock' };
      }
      
      // Update existing stock record
      const { error } = await withRetry(() =>
        supabase
          .from('stock_inventory')
          .update({
            current_stock: newStock,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentStock.id)
      );
      
      if (error) throw error;
    } else {
      // Create new stock record
      newStock = Math.max(0, quantity);
      const { error } = await withRetry(() =>
        supabase
          .from('stock_inventory')
          .insert({
            product_type: productType,
            consumable_id: consumableId,
            branch_id: branchId,
            current_stock: newStock,
            created_by: createdBy
          })
      );
      
      if (error) throw error;
    }
    
    // Create stock transaction record (history)
    const { error: txError } = await withRetry(() =>
      supabase
        .from('stock_transactions')
        .insert({
          transaction_type: transactionType,
          product_type: productType,
          consumable_id: consumableId,
          branch_id: branchId,
          quantity: quantity,
          remarks: remarks,
          created_by: createdBy
        })
    );
    
    if (txError) console.error('Transaction log error (503 retries exhausted):', txError.message);
    
    return { success: true, newStock };
  } catch (e) {
    console.error('Error updating stock:', e);
    return { success: false, message: e.message };
  }
}

// Get stock transaction history
export async function getStockHistory(productType, consumableId, branchId, limit = 50) {
  try {
    const { data, error } = await withRetry(() => {
      let query = supabase
        .from('stock_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (productType) query = query.eq('product_type', productType);
      if (consumableId) query = query.eq('consumable_id', consumableId);
      if (branchId) query = query.eq('branch_id', branchId);
      
      return query.limit(limit);
    });
    
    if (error) {
      console.warn('getStockHistory: DB error after retries:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Error fetching stock history:', e);
    return [];
  }
}

// Batch update stock from billable report consumable items (normalized child table)
// NOTE: Non-billable stock is already deducted when the batch is registered/opened
// in the Non-Billable Consumables page. This function only processes Billable items.
export async function updateStockFromBill(reportData, branchId, createdBy = 'System') {
  try {
    const results = [];
    
    // Support both legacy 14-slot format and normalized consumableItems array
    const consumableItems = reportData.consumableItems || [];
    
    if (consumableItems.length > 0) {
      // NEW: Normalized format from billable_report_consumables
      for (const item of consumableItems) {
        // SKIP non-billable items: stock deduction already happened at batch registration
        if (item.product_type === 'Non-Billable') continue;
        
        if (item.product_type === 'Billable' && item.consumable_id) {
          const quantity = -Math.abs(Number(item.units));
          const result = await updateStock({
            productType: 'Billable',
            consumableId: item.consumable_id,
            branchId,
            quantity,
            transactionType: 'Outward',
            remarks: `Bill ${reportData.bill_id} - Service consumption`,
            createdBy
          });
          results.push(result);
        }
      }
    } else {
      // LEGACY: 14-slot format (backwards compatibility)
      for (let i = 1; i <= 14; i++) {
        const consumableId = reportData[`consumable_${i}_id`];
        const units = reportData[`consumable_${i}_units`];
        const isNonBillable = reportData[`is_non_billable_${i}`];
        
        // SKIP non-billable items: stock deduction already happened at batch registration
        if (isNonBillable) continue;
        
        // Billable items only: ensure consumableId and units are valid
        if (!consumableId || !units || units <= 0) continue;
        
        const result = await updateStock({
          productType: 'Billable',
          consumableId,
          branchId,
          quantity: -Math.abs(Number(units)),
          transactionType: 'Outward',
          remarks: `Bill ${reportData.bill_id} - Service consumption`,
          createdBy
        });
        results.push(result);
      }
    }
    
    return results;
  } catch (e) {
    console.error('Error updating stock from bill:', e);
    return [];
  }
}

// Deduct stock for non-billable registry opening (when status changes to 'active')
export async function deductNonBillableStock(registryId, branchId, createdBy = 'System') {
  try {
    const { data: registryItem, error: fetchError } = await supabase
      .from('non_billable_consumable_registry')
      .select('product_id, status')
      .eq('id', registryId)
      .single();
    
    if (fetchError) throw fetchError;
    if (!registryItem) return { success: false, message: 'Registry item not found' };
    
    // Only deduct when marking as opened/active (status changing to active)
    // This function should be called when a registry item transitions to active status
    // For now, we'll handle the opening_date scenario - when a batch becomes active, 
    // we decrement stock by 1 (or by the quantity in the batch if available)
    
    const result = await updateStock({
      productType: 'Non-Billable',
      consumableId: registryItem.product_id,
      branchId,
      quantity: -1, // Each batch represents one unit consumed when opened
      transactionType: 'Outward',
      remarks: `Non-billable batch opened (registry ID: ${registryId})`,
      createdBy
    });
    
    return result;
  } catch (e) {
    console.error('Error deducting non-billable stock:', e);
    return { success: false, message: e.message };
  }
}

// Transfer stock between branches
export async function transferStock({
  productType,
  consumableId,
  fromBranchId,
  toBranchId,
  quantity, // positive number for units to transfer
  remarks = '',
  createdBy = 'System'
}) {
  try {
    // Validate transfer
    if (!fromBranchId || !toBranchId) {
      return { success: false, message: 'Both source and destination branches are required' };
    }
    if (fromBranchId === toBranchId) {
      return { success: false, message: 'Cannot transfer to the same branch' };
    }
    if (!quantity || quantity <= 0) {
      return { success: false, message: 'Please enter a valid quantity' };
    }

    // Check source stock has enough
    const sourceStock = await getStock(productType, consumableId, fromBranchId);
    const sourceCurrentStock = sourceStock?.current_stock || 0;
    
    // If source stock is 0 or null, return error
    if (!sourceStock || sourceCurrentStock <= 0) {
      return { success: false, message: `No stock available at source branch` };
    }
    
    if (sourceCurrentStock < quantity) {
      return { success: false, message: `Insufficient stock. Available: ${sourceCurrentStock}` };
    }

    // Deduct from source branch
    const deductResult = await updateStock({
      productType,
      consumableId,
      branchId: fromBranchId,
      quantity: -quantity,
      transactionType: 'Transfer',
      remarks: `Transfer to ${toBranchId === 'corporate' ? 'Corporate' : (await getBranchName(toBranchId))}: ${remarks}`,
      createdBy
    });

    if (!deductResult.success) {
      return deductResult;
    }

    // Add to destination branch
    const addResult = await updateStock({
      productType,
      consumableId,
      branchId: toBranchId,
      quantity: quantity,
      transactionType: 'Transfer',
      remarks: `Transfer from ${fromBranchId === 'corporate' ? 'Corporate' : (await getBranchName(fromBranchId))}: ${remarks}`,
      createdBy
    });

    if (!addResult.success) {
      // Rollback the deduction
      await updateStock({
        productType,
        consumableId,
        branchId: fromBranchId,
        quantity: quantity,
        transactionType: 'Adjustment',
        remarks: `Rollback: Transfer failed to ${toBranchId === 'corporate' ? 'Corporate' : (await getBranchName(toBranchId))}`,
        createdBy
      });
      return addResult;
    }

    return { success: true, message: 'Stock transferred successfully' };
  } catch (e) {
    console.error('Error transferring stock:', e);
    return { success: false, message: e.message };
  }
}

// Helper to get branch name by ID
async function getBranchName(branchId) {
  try {
    const { data } = await supabase
      .from('branches')
      .select('branch_name')
      .eq('id', branchId)
      .single();
    return data?.branch_name || `Branch ${branchId}`;
  } catch (e) {
    return `Branch ${branchId}`;
  }
}

// Adjust stock manually
export async function adjustStock(productType, consumableId, branchId, newStockLevel, remarks, createdBy) {
  try {
    const currentStock = await getStock(productType, consumableId, branchId);
    const currentLevel = currentStock?.current_stock || 0;
    const adjustment = newStockLevel - currentLevel;
    
    if (adjustment === 0) return { success: true, message: 'No adjustment needed' };
    
    const result = await updateStock({
      productType,
      consumableId,
      branchId,
      quantity: adjustment,
      transactionType: 'Adjustment',
      remarks: remarks || `Manual adjustment from ${currentLevel} to ${newStockLevel}`,
      createdBy
    });
    
    return result;
  } catch (e) {
    console.error('Error adjusting stock:', e);
    return { success: false, message: e.message };
  }
}