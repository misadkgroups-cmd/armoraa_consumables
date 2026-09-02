import { supabase } from '../config/supabase';
import { withRetry } from '../utils/supabaseRetry';
import { round2 } from '../utils/numUtils';

// Get current stock for a product
// billable_stock / non_billable_stock are the SOURCE OF TRUTH.
// stock_inventory is legacy and no longer read.
export async function getStock(productType, consumableId, branchId) {
  try {
    const table = productType === 'Non-Billable' ? 'non_billable_stock' : 'billable_stock';
    const { data, error } = await withRetry(() =>
      supabase
        .from(table)
        .select('*')
        .eq('consumable_id', consumableId)
        .eq('branch_id', branchId)
        .maybeSingle()
    );
    
    if (error) {
      console.warn('getStock: DB error after retries:', error.message);
      return null;
    }
    if (!data) return null;
    // Normalize to the shape consumers expect (current_stock + product_type)
    return {
      ...data,
      product_type: productType,
      current_stock: data.available_stock,
    };
  } catch (e) {
    console.error('Error fetching stock:', e);
    return null;
  }
}

// Get all stock for a branch (billable + non-billable, source-of-truth tables)
export async function getBranchStock(branchId) {
  try {
    const [billableResult, nonBillableResult] = await Promise.all([
      withRetry(() =>
        supabase
          .from('billable_stock')
          .select('*')
          .eq('branch_id', branchId)
          .order('updated_at', { ascending: false })
      ),
      withRetry(() =>
        supabase
          .from('non_billable_stock')
          .select('*')
          .eq('branch_id', branchId)
          .order('updated_at', { ascending: false })
      ),
    ]);

    if (billableResult.error) {
      console.warn('getBranchStock: billable_stock DB error after retries:', billableResult.error.message);
    }
    if (nonBillableResult.error) {
      console.warn('getBranchStock: non_billable_stock DB error after retries:', nonBillableResult.error.message);
    }

    const billable = (billableResult.data || []).map(row => ({
      ...row,
      product_type: 'Billable',
      current_stock: row.available_stock,
    }));
    const nonBillable = (nonBillableResult.data || []).map(row => ({
      ...row,
      product_type: 'Non-Billable',
      current_stock: row.available_stock,
    }));

    return [...billable, ...nonBillable];
  } catch (e) {
    console.error('Error fetching branch stock:', e);
    return [];
  }
}

// Update stock (Inward/Outward/Adjustment/Transfer)
// Writes to billable_stock / non_billable_stock (source of truth).
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
    const table = productType === 'Non-Billable' ? 'non_billable_stock' : 'billable_stock';
    const currentStock = await getStock(productType, consumableId, branchId);
    const newStock = round2((currentStock?.current_stock || 0) + quantity);
    
    if (newStock < 0) {
      return { success: false, message: 'Insufficient stock' };
    }
    
    // Upsert the stock row (unique on consumable_id + branch_id)
    const { error } = await withRetry(() =>
      supabase
        .from(table)
        .upsert(
          {
            consumable_id: consumableId,
            branch_id: branchId,
            available_stock: newStock,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'consumable_id,branch_id' }
        )
    );
    
    if (error) throw error;
    
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
export async function getStockHistory(productType, consumableId, branchId, limit = 50, dateFrom = null, dateTo = null) {
  try {
    const { data, error } = await withRetry(() => {
      let query = supabase
        .from('stock_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (productType) query = query.eq('product_type', productType);
      if (consumableId) query = query.eq('consumable_id', consumableId);
      if (branchId) query = query.eq('branch_id', branchId);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);
      
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
    const adjustment = round2(newStockLevel - currentLevel);
    
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
// ---------------------------------------------------------------------------
// Branch-level Inward stock (Add Product / Add Stock on Billable / Non-Billable)
// Adds quantity to the source-of-truth table (billable_stock / non_billable_stock)
// and records an Inward transaction in stock_transactions.
// ---------------------------------------------------------------------------
export async function addInwardStock(productType, consumableId, branchId, quantity, remarks = '', createdBy = 'System') {
  try {
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return { success: false, message: 'Please enter a valid quantity' };
    }

    const currentStock = await getStock(productType, consumableId, branchId);
    const newStock = round2((currentStock?.current_stock || 0) + qty);

    const table = productType === 'Non-Billable' ? 'non_billable_stock' : 'billable_stock';

    const { error: upsertError } = await withRetry(() =>
      supabase.from(table).upsert(
        {
          consumable_id: consumableId,
          branch_id: branchId,
          available_stock: newStock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'consumable_id,branch_id' }
      )
    );

    if (upsertError) throw upsertError;

    const { error: txError } = await withRetry(() =>
      supabase.from('stock_transactions').insert({
        transaction_type: 'Inward',
        product_type: productType,
        consumable_id: consumableId,
        branch_id: branchId,
        quantity: qty,
        remarks: remarks || 'Inward stock added',
        created_by: createdBy,
      })
    );

    if (txError) {
      console.error('addInwardStock: transaction log error:', txError.message);
    }

    return { success: true, newStock };
  } catch (e) {
    console.error('Error adding inward stock:', e);
    return { success: false, message: e.message };
  }
}

// ---------------------------------------------------------------------------
// Corporate stock: add/inward stock (increment available_units)
// Records an Inward transaction in corporate_stock_transactions.
// ---------------------------------------------------------------------------
export async function addCorporateInwardStock(productId, stockType, productName, quantity, remarks = '', createdBy = 'System') {
  try {
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return { success: false, message: 'Please enter a valid quantity' };
    }

    const { data, error } = await withRetry(() =>
      supabase
        .from('corporate_stock')
        .select('available_units, product_name')
        .eq('product_id', Number(productId))
        .eq('stock_type', stockType)
        .single()
    );

    if (error) throw error;
    if (!data) return { success: false, message: 'Corporate stock record not found for this product' };

    const newQty = round2((data.available_units || 0) + qty);

    const { error: updError } = await withRetry(() =>
      supabase
        .from('corporate_stock')
        .update({ available_units: newQty, updated_at: new Date().toISOString(), updated_by: createdBy })
        .eq('product_id', Number(productId))
        .eq('stock_type', stockType)
    );

    if (updError) throw updError;

    const { error: txError } = await withRetry(() =>
      supabase.from('corporate_stock_transactions').insert({
        product_id: Number(productId),
        product_name: productName || data.product_name || '',
        stock_type: stockType,
        transaction_type: 'Inward',
        quantity: qty,
        balance_after: newQty,
        remarks: remarks || 'Inward stock added',
        from_location: 'Purchase / Incoming',
        to_location: 'Corporate Warehouse',
        created_by: createdBy,
      })
    );

    if (txError) console.error('addCorporateInwardStock: transaction log error:', txError.message);

    return { success: true, newQty };
  } catch (e) {
    console.error('Error adding corporate inward stock:', e);
    return { success: false, message: e.message };
  }
}

// ---------------------------------------------------------------------------
// Corporate stock transactions history (Transaction History tab)
// Returns all corporate movements including the new From / To location columns.
// ---------------------------------------------------------------------------
export async function getCorporateTransactions(limit = 500, dateFrom = null, dateTo = null) {
  try {
    const { data, error } = await withRetry(() => {
      let query = supabase
        .from('corporate_stock_transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo);
      return query.limit(limit);
    });

    if (error) {
      console.warn('getCorporateTransactions: DB error after retries:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Error fetching corporate transactions:', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Bulk transfer: Corporate Warehouse -> Branch for multiple products.
// Each selected product is decremented from corporate_stock and added to the
// branch source-of-truth table (billable_stock / non_billable_stock).
// Every product is recorded in corporate_stock_transactions (Transfer) AND
// stock_transactions (Inward at destination branch).
//
// transfers = [{ product_id, product_name, stock_type, quantity }]
// Returns an array of per-product result objects.
// ---------------------------------------------------------------------------
export async function transferFromCorporateBulk(transfers, toBranchId, toBranchName, remarks = '', createdBy = 'System') {
  const results = [];

  if (!toBranchId) {
    return [{ success: false, message: 'Destination branch is required' }];
  }

  for (const t of transfers) {
    const qty = Number(t.quantity);
    const productId = Number(t.product_id);

    if (!qty || qty <= 0) {
      results.push({ success: false, productId, product_name: t.product_name, message: `Quantity must be greater than 0 for ${t.product_name}` });
      continue;
    }

    try {
      const { data: corp, error: corpErr } = await withRetry(() =>
        supabase
          .from('corporate_stock')
          .select('available_units, product_name')
          .eq('product_id', productId)
          .eq('stock_type', t.stock_type)
          .single()
      );

      if (corpErr || !corp) {
        results.push({ success: false, productId, product_name: t.product_name, message: `Corporate stock not found for ${t.product_name || productId}` });
        continue;
      }

      // Validate sufficient stock (prevents transfer when insufficient)
      if (corp.available_units < qty) {
        results.push({
          success: false,
          productId,
          product_name: t.product_name,
          message: `Available stock is only ${corp.available_units} units.`,
          available: corp.available_units,
        });
        continue;
      }

      const newCorpQty = round2(Number(corp.available_units) - qty);

      const { error: corpUpdError } = await withRetry(() =>
        supabase
          .from('corporate_stock')
          .update({ available_units: newCorpQty, updated_at: new Date().toISOString(), updated_by: createdBy })
          .eq('product_id', productId)
          .eq('stock_type', t.stock_type)
      );

      if (corpUpdError) {
        results.push({ success: false, productId, product_name: t.product_name, message: corpUpdError.message });
        continue;
      }

      // Increment branch source-of-truth stock (billable_stock / non_billable_stock)
      const table = t.stock_type === 'Non-Billable' ? 'non_billable_stock' : 'billable_stock';
      const { data: existing } = await supabase
        .from(table)
        .select('available_stock')
        .eq('consumable_id', productId)
        .eq('branch_id', Number(toBranchId))
        .maybeSingle();

      const newBranchStock = (existing?.available_stock || 0) + qty;

      const { error: branchErr } = await withRetry(() =>
        supabase.from(table).upsert(
          {
            consumable_id: productId,
            branch_id: Number(toBranchId),
            available_stock: newBranchStock,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'consumable_id,branch_id' }
        )
      );

      if (branchErr) {
        results.push({ success: false, productId, product_name: t.product_name, message: branchErr.message });
        continue;
      }

      // Record corporate-side Transfer transaction (with From / To)
      await supabase.from('corporate_stock_transactions').insert({
        product_id: productId,
        product_name: t.product_name || corp.product_name || '',
        stock_type: t.stock_type,
        transaction_type: 'Transfer',
        quantity: qty,
        balance_after: newCorpQty,
        remarks: remarks || `Transferred to ${toBranchName || 'branch'}`,
        from_location: 'Corporate Warehouse',
        to_location: toBranchName || `Branch ${toBranchId}`,
        created_by: createdBy,
      });

      // Record destination-side Inward transaction
      await supabase.from('stock_transactions').insert({
        transaction_type: 'Inward',
        product_type: t.stock_type,
        consumable_id: productId,
        branch_id: Number(toBranchId),
        quantity: qty,
        remarks: `Received from Corporate Warehouse${remarks ? ' - ' + remarks : ''}`,
        created_by: createdBy,
      });

      results.push({ success: true, productId, product_name: t.product_name, message: 'Transferred', newCorporateQty: newCorpQty, newBranchStock });
    } catch (e) {
      results.push({ success: false, productId, product_name: t.product_name, message: e.message });
    }
  }

  return results;
}



// ---------------------------------------------------------------------------
// === Multi-Location Transfer Request -> Receipt workflow
// ---------------------------------------------------------------------------

// Creates PENDING transfer requests between any valid locations:
// - Corporate → Branch
// - Branch → Branch
// - Branch → Corporate
// Corporate → Corporate is NOT allowed.
//
// Source stock is reduced immediately; destination stock increases only
// after the receiving branch confirms receipt (see receiveTransfer).
// Each product is recorded in stock_transfers + stock_transfer_notifications.
//
// transfers = [{ product_id, product_name, stock_type, quantity }]
// Returns an array of per-product result objects.
export async function createMultiLocationTransferRequest(
  transfers,
  transferType,
  fromBranchId,
  toBranchId,
  remarks = '',
  createdBy = 'System'
) {
  const results = [];

  if (!fromBranchId || !toBranchId) {
    return [{ success: false, message: 'Both source and destination are required' }];
  }
  if (fromBranchId === toBranchId) {
    return [{ success: false, message: 'Source and destination cannot be the same' }];
  }
  if (transferType === 'Corporate→Corporate' || (fromBranchId === 'corporate' && toBranchId === 'corporate')) {
    return [{ success: false, message: 'Corporate to Corporate transfers are not allowed' }];
  }

  const isFromCorporate = fromBranchId === 'corporate';
  const isToCorporate = toBranchId === 'corporate';

  // Determine the source table based on transfer type
  const getSourceStock = async (productId, stockType) => {
    if (isFromCorporate) {
      const { data, error } = await withRetry(() =>
        supabase
          .from('corporate_stock')
          .select('available_units, product_name')
          .eq('product_id', Number(productId))
          .eq('stock_type', stockType)
          .single()
      );
      if (error || !data) return null;
      return { ...data, current_stock: data.available_units };
    } else {
      const table = stockType === 'Non-Billable' ? 'non_billable_stock' : 'billable_stock';
      const { data, error } = await withRetry(() =>
        supabase
          .from(table)
          .select('available_stock')
          .eq('consumable_id', Number(productId))
          .eq('branch_id', Number(fromBranchId))
          .maybeSingle()
      );
      if (error) return null;
      return { current_stock: data?.available_stock || 0 };
    }
  };

  const deductSourceStock = async (productId, stockType, qty) => {
    if (isFromCorporate) {
      const { data: corp, error: corpErr } = await withRetry(() =>
        supabase
          .from('corporate_stock')
          .select('available_units, product_name')
          .eq('product_id', Number(productId))
          .eq('stock_type', stockType)
          .single()
      );
      if (corpErr || !corp) return { success: false, message: 'Corporate stock not found' };
      if ((corp.available_units || 0) < qty) return { success: false, message: `Available stock is only ${corp.available_units} units.` };

      const newQty = Number(corp.available_units) - qty;
      const { error: updErr } = await withRetry(() =>
        supabase
          .from('corporate_stock')
          .update({ available_units: newQty, updated_at: new Date().toISOString(), updated_by: createdBy })
          .eq('product_id', Number(productId))
          .eq('stock_type', stockType)
      );
      if (updErr) return { success: false, message: updErr.message };

      await supabase.from('corporate_stock_transactions').insert({
        product_id: Number(productId),
        product_name: corp.product_name || '',
        stock_type: stockType,
        transaction_type: 'Transfer',
        quantity: qty,
        balance_after: newQty,
        remarks: remarks || `Transferred to ${isToCorporate ? 'Corporate Warehouse' : 'branch'}`,
        from_location: 'Corporate Warehouse',
        to_location: isToCorporate ? 'Corporate Warehouse' : `Branch ${toBranchId}`,
        created_by: createdBy,
      });
      return { success: true };
    } else {
      const table = stockType === 'Non-Billable' ? 'non_billable_stock' : 'billable_stock';
      const { data: existing, error: fetchErr } = await withRetry(() =>
        supabase
          .from(table)
          .select('available_stock')
          .eq('consumable_id', Number(productId))
          .eq('branch_id', Number(fromBranchId))
          .maybeSingle()
      );
      if (fetchErr) return { success: false, message: fetchErr.message };
      const currentStock = existing?.available_stock || 0;
      if (currentStock < qty) return { success: false, message: `Available stock is only ${currentStock} units.` };

      const newStock = round2(currentStock - qty);
      const { error: updErr } = await withRetry(() =>
        supabase
          .from(table)
          .update({ available_stock: newStock, updated_at: new Date().toISOString() })
          .eq('consumable_id', Number(productId))
          .eq('branch_id', Number(fromBranchId))
      );
      if (updErr) return { success: false, message: updErr.message };

      await supabase.from('stock_transactions').insert({
        transaction_type: 'Transfer',
        product_type: stockType,
        consumable_id: Number(productId),
        branch_id: Number(fromBranchId),
        quantity: -qty,
        remarks: `Transfer to ${isToCorporate ? 'Corporate Warehouse' : `Branch ${toBranchId}`}: ${remarks || ''}`,
        created_by: createdBy,
      });
      return { success: true };
    }
  };

  for (const t of transfers) {
    const qty = Number(t.quantity);
    const productId = Number(t.product_id);
    if (!qty || qty <= 0) {
      results.push({ success: false, productId, product_name: t.product_name, message: `Quantity must be greater than 0 for ${t.product_name}` });
      continue;
    }

    try {
      const sourceStock = await getSourceStock(productId, t.stock_type);
      if (!sourceStock || (sourceStock.current_stock || 0) < qty) {
        results.push({
          success: false,
          productId,
          product_name: t.product_name,
          message: `Insufficient stock. Available: ${sourceStock?.current_stock || 0}`,
        });
        continue;
      }

      const deductResult = await deductSourceStock(productId, t.stock_type, qty);
      if (!deductResult.success) {
        results.push({ success: false, productId, product_name: t.product_name, message: deductResult.message });
        continue;
      }

      // Create Pending transfer record
      const { data: stData, error: stErr } = await supabase
        .from('stock_transfers')
        .insert({
          product_id: productId,
          product_name: t.product_name || '',
          stock_type: t.stock_type,
          quantity: qty,
          from_branch_id: isFromCorporate ? null : Number(fromBranchId),
          to_branch_id: isToCorporate ? null : Number(toBranchId),
          status: 'Pending',
          transferred_by: createdBy,
          transferred_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (stErr) {
        results.push({ success: false, productId, product_name: t.product_name, message: stErr.message });
        continue;
      }

      // Branch → Corporate: auto-confirm immediately (no manual receipt needed).
      // The stock is added back to corporate_stock right away and the transfer
      // is marked 'Received' instead of sitting in 'Pending'.
      if (isToCorporate) {
        const { data: corpRow, error: corpFetchErr } = await withRetry(() =>
          supabase
            .from('corporate_stock')
            .select('id, available_units, product_name')
            .eq('product_id', productId)
            .eq('stock_type', t.stock_type)
            .single()
        );

        if (corpFetchErr || !corpRow) {
          results.push({ success: false, productId, product_name: t.product_name, message: 'Corporate stock record not found for auto-confirm' });
          continue;
        }

        const newCorpQty = round2(Number(corpRow.available_units || 0) + qty);
        const { error: corpUpdErr } = await withRetry(() =>
          supabase
            .from('corporate_stock')
            .update({ available_units: newCorpQty, updated_at: new Date().toISOString(), updated_by: createdBy })
            .eq('id', corpRow.id)
        );
        if (corpUpdErr) {
          results.push({ success: false, productId, product_name: t.product_name, message: corpUpdErr.message });
          continue;
        }

        // Mark the transfer as Received straight away
        await supabase
          .from('stock_transfers')
          .update({ status: 'Received', received_by: createdBy, received_at: new Date().toISOString() })
          .eq('id', stData.id);

        // Corporate audit row (Inward from the branch)
        await supabase.from('corporate_stock_transactions').insert({
          product_id: productId,
          product_name: t.product_name || corpRow.product_name || '',
          stock_type: t.stock_type,
          transaction_type: 'Inward',
          quantity: qty,
          balance_after: newCorpQty,
          remarks: `Received from Branch ${fromBranchId}${remarks ? `: ${remarks}` : ''}`,
          from_location: `Branch ${fromBranchId}`,
          to_location: 'Corporate Warehouse',
          created_by: createdBy,
        });

        results.push({
          success: true,
          transferId: stData.id,
          productId,
          product_name: t.product_name,
          message: 'Branch → Corporate transfer auto-confirmed (Received)',
          newCorporateQty: newCorpQty,
        });
        continue;
      }

      // Create notification for destination
      if (!isToCorporate) {
        await supabase.from('stock_transfer_notifications').insert({
          transfer_id: stData.id,
          user_branch_id: Number(toBranchId),
          is_read: false,
        });
      }

      results.push({
        success: true,
        transferId: stData.id,
        productId,
        product_name: t.product_name,
        message: 'Transfer request created (Pending Receipt)',
      });
    } catch (e) {
      results.push({ success: false, productId, product_name: t.product_name, message: e.message });
    }
  }

  return results;
}

// MIS Admin ships stock out of the Corporate Warehouse and creates a
// PENDING transfer request. Branch stock is intentionally NOT updated here;
// it is only updated when the destination branch confirms receipt
// (see receiveTransfer). Every product the admin ships is recorded in
// stock_transfers (status 'Pending') + stock_transfer_notifications (bell)
// plus a corporate_stock_transactions audit row.
//
// transfers = [{ product_id, product_name, stock_type, quantity }]
// Returns an array of per-product result objects.
export async function createTransferRequest(transfers, toBranchId, toBranchName, createdBy = 'System') {
  const results = [];
  if (!toBranchId) {
    return [{ success: false, message: 'Destination branch is required' }];
  }

  for (const t of transfers) {
    const qty = Number(t.quantity);
    const productId = Number(t.product_id);

    if (!qty || qty <= 0) {
      results.push({ success: false, productId, product_name: t.product_name, message: `Quantity must be greater than 0 for ${t.product_name}` });
      continue;
    }

    try {
      const { data: corp, error: corpErr } = await withRetry(() =>
        supabase
          .from('corporate_stock')
          .select('available_units, product_name')
          .eq('product_id', productId)
          .eq('stock_type', t.stock_type)
          .single()
      );

      if (corpErr || !corp) {
        results.push({ success: false, productId, product_name: t.product_name, message: `Corporate stock not found for ${t.product_name}` });
        continue;
      }

      // Pre-validate sufficient stock (prevents transfer when insufficient)
      if (corp.available_units < qty) {
        results.push({
          success: false,
          productId,
          product_name: t.product_name,
          message: `Available stock is only ${corp.available_units} units.`,
          available: corp.available_units,
        });
        continue;
      }

      const newCorpQty = round2(Number(corp.available_units) - qty);

      // 1. Deduct from the Corporate Warehouse (the goods ship out now)
      const { error: updErr } = await withRetry(() =>
        supabase
          .from('corporate_stock')
          .update({ available_units: newCorpQty, updated_at: new Date().toISOString(), updated_by: createdBy })
          .eq('product_id', productId)
          .eq('stock_type', t.stock_type)
      );
      if (updErr) {
        results.push({ success: false, productId, product_name: t.product_name, message: updErr.message });
        continue;
      }

      // 2. Audit row in corporate_stock_transactions (Transfer)
      await supabase.from('corporate_stock_transactions').insert({
        product_id: productId,
        product_name: t.product_name || corp.product_name || '',
        stock_type: t.stock_type,
        transaction_type: 'Transfer',
        quantity: qty,
        balance_after: newCorpQty,
        remarks: `Shipped to ${toBranchName || 'branch'}`,
        from_location: 'Corporate Warehouse',
        to_location: toBranchName || '',
        created_by: createdBy,
      });

      // 3. The transfer request itself (Pending). Branch stock is NOT touched here.
      const { data: stData, error: stErr } = await supabase
        .from('stock_transfers')
        .insert({
          product_id: productId,
          product_name: t.product_name || corp.product_name || '',
          stock_type: t.stock_type,
          quantity: qty,
          from_branch_id: null, // Corporate Warehouse origin
          to_branch_id: Number(toBranchId),
          status: 'Pending',
          transferred_by: createdBy,
          transferred_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (stErr) {
        results.push({ success: false, productId, product_name: t.product_name, message: stErr.message });
        continue;
      }

      // 4. Notification for the destination branch (drives the bell)
      await supabase.from('stock_transfer_notifications').insert({
        transfer_id: stData.id,
        user_branch_id: Number(toBranchId),
        is_read: false,
      });

      results.push({
        success: true,
        transferId: stData.id,
        productId,
        product_name: t.product_name,
        message: 'Transfer request created (Pending Receipt)',
        newCorporateQty,
      });
    } catch (e) {
      results.push({ success: false, productId, product_name: t.product_name, message: e.message });
    }
  }

  return results;
}

// Fetch transfer requests for the current user.
// MIS Admin -> ALL transfers (or filtered by explicit branchFilter).
// Branch user -> only their own (to/from).
export async function getTransfers(userBranchId, isMis = false, limit = 500, productId = null, productType = null, branchFilter = null, dateFrom = null, dateTo = null) {
  try {
    let q = supabase
      .from('stock_transfers')
      .select('*')
      .order('transferred_at', { ascending: false })
      .limit(limit);

    if (!isMis && userBranchId) {
      const bid = Number(userBranchId);
      q = q.or(`to_branch_id.eq.${bid},from_branch_id.eq.${bid}`);
    } else if (isMis && branchFilter) {
      if (branchFilter === 'corporate') {
        // Corporate Warehouse is stored as NULL in from_branch_id / to_branch_id
        q = q.or('from_branch_id.is.null,to_branch_id.is.null');
      } else {
        const bid = Number(branchFilter);
        q = q.or(`to_branch_id.eq.${bid},from_branch_id.eq.${bid}`);
      }
    }

    if (productId) {
      q = q.eq('product_id', Number(productId));
    }
    if (productType) {
      q = q.eq('stock_type', productType);
    }
    if (dateFrom) q = q.gte('transferred_at', dateFrom);
    if (dateTo) q = q.lte('transferred_at', dateTo);

    const { data, error } = await withRetry(() => q);
    if (error) {
      console.warn('getTransfers: DB error after retries:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Error fetching transfers:', e);
    return [];
  }
}

// Incoming Pending transfers for a specific branch (for the bell popup).
// branchId === null/undefined -> ALL pending transfers (MIS view).
export async function getIncomingTransfers(branchId, limit = 50) {
  try {
    const { data, error } = await withRetry(() => {
      let q = supabase
        .from('stock_transfers')
        .select('*')
        .eq('status', 'Pending')
        .order('transferred_at', { ascending: false })
        .limit(limit);
      if (branchId !== null && branchId !== undefined && branchId !== '') {
        q = q.eq('to_branch_id', Number(branchId));
      }
      return q;
    });
    if (error) {
      console.warn('getIncomingTransfers:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('Error fetching incoming transfers:', e);
    return [];
  }
}

  // Branch user confirms receipt -> stock moves into the destination branch
  export async function receiveTransfer(transferId, createdBy = 'System') {
    try {
      const { data: tr, error: trErr } = await withRetry(() =>
        supabase
          .from('stock_transfers')
          .select('product_id, product_name, stock_type, quantity, to_branch_id, from_branch_id, status')
          .eq('id', Number(transferId))
          .single()
      );
      if (trErr || !tr) {
        console.error('Transfer not found:', transferId, trErr);
        return { success: false, message: 'Transfer not found or already processed' };
      }
      if (!tr.status || tr.status !== 'Pending') {
        return { success: false, message: `Transfer is already ${tr.status || 'processed'}` };
      }

    const qty = Number(tr.quantity);
    const productId = Number(tr.product_id);
    const table = tr.stock_type === 'Non-Billable' ? 'non_billable_stock' : 'billable_stock';
    const toBranchId = Number(tr.to_branch_id);

    // Read the current destination-branch stock
    const { data: existing } = await supabase
      .from(table)
      .select('available_stock')
      .eq('consumable_id', productId)
      .eq('branch_id', toBranchId)
      .maybeSingle();

    const newBranchStock = (existing?.available_stock || 0) + qty;

    // Increment branch stock only on confirmed receipt
    const { error: branchErr } = await withRetry(() =>
      supabase.from(table).upsert(
        {
          consumable_id: productId,
          branch_id: toBranchId,
          available_stock: newBranchStock,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'consumable_id,branch_id' }
      )
    );
    if (branchErr) return { success: false, message: branchErr.message, newBranchStock };

    // Mark the transfer received
    const { error: updErr } = await withRetry(() =>
      supabase
        .from('stock_transfers')
        .update({ status: 'Received', received_by: createdBy, received_at: new Date().toISOString() })
        .eq('id', Number(transferId))
    );
    if (updErr) return { success: false, message: updErr.message };

    // Destination-side Inward log (branch history)
    await supabase.from('stock_transactions').insert({
      transaction_type: 'Inward',
      product_type: tr.stock_type,
      consumable_id: productId,
      branch_id: toBranchId,
      quantity: qty,
      remarks: `Received from Corporate Warehouse (Transfer #${transferId})`,
      created_by: createdBy,
    });

    // Mark related notifications read
    await supabase.from('stock_transfer_notifications').update({ is_read: true }).eq('transfer_id', Number(transferId));

    return { success: true, transferId, newBranchStock, message: 'Transfer received' };
  } catch (e) {
    console.error('receiveTransfer:', e);
    return { success: false, message: e.message };
  }
}

// Unread stock-transfer notification count for the bell badge.
// branchId === null/undefined -> count across ALL branches (MIS view).
export async function getUnreadTransferNotificationCount(branchId) {
  try {
    const { count, error } = await withRetry(() => {
      let q = supabase
        .from('stock_transfer_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);
      if (branchId !== null && branchId !== undefined && branchId !== '') {
        q = q.eq('user_branch_id', Number(branchId));
      }
      return q;
    });
    if (error) {
      console.warn('getUnreadTransferNotificationCount:', error.message);
      return 0;
    }
    return count || 0;
  } catch (e) {
    console.error('getUnreadTransferNotificationCount:', e);
    return 0;
  }
}

// Mark all unread transfer notifications as read.
// branchId === null/undefined -> mark ALL branches (MIS view).
export async function markTransferNotificationsRead(branchId) {
  try {
    const { error } = await withRetry(() => {
      let q = supabase
        .from('stock_transfer_notifications')
        .update({ is_read: true })
        .eq('is_read', false);
      if (branchId !== null && branchId !== undefined && branchId !== '') {
        q = q.eq('user_branch_id', Number(branchId));
      }
      return q;
    });
    if (error) console.warn('markTransferNotificationsRead:', error.message);
    return !error;
  } catch (e) {
    console.error('markTransferNotificationsRead:', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// PRODUCT-LEVEL AUDIT TRAIL  (used by the History icon on a product row)
// ---------------------------------------------------------------------------
// Returns EVERY stock movement for a single product, merged from ALL sources
// and sorted chronologically (newest first):
//   * stock_transactions          -> branch level Inward / Outward / Adjustment
//   * corporate_stock_transactions -> corporate Inward / Outward / Adjustment
//   * stock_transfers             -> transfer request lifecycle (ship + receive)
//
// Transfer shipments/receipts are sourced ONLY from `stock_transfers` (the
// canonical transfer log). The matching balance-bookkeeping rows that the
// transfer flows ALSO write to stock_transactions / corporate_stock_transactions
// are omitted so each transfer event appears exactly once on the audit trail.
// ---------------------------------------------------------------------------
export async function getProductHistory(productId, productType, productName = '', limit = 500, dateFrom = null, dateTo = null, branchFilter = null) {
  const pid = Number(productId);
  const ptype = productType; // 'Billable' | 'Non-Billable'

  try {
    // 1. Branch-level movements (chronological — we need correct deltas)
    const stRes = await withRetry(() => {
      let q = supabase
        .from('stock_transactions')
        .select('*')
        .eq('consumable_id', pid)
        .eq('product_type', ptype)
        .order('created_at', { ascending: true });
      if (branchFilter && branchFilter !== 'corporate') {
        q = q.eq('branch_id', Number(branchFilter));
      }
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo);
      return q.limit(limit);
    });

    // 2. Corporate-level movements (only when no specific non-corporate branch filter)
    let cstRes = { data: [], error: null };
    if (branchFilter === null || branchFilter === 'corporate') {
      cstRes = await withRetry(() => {
        let q = supabase
          .from('corporate_stock_transactions')
          .select('*')
          .eq('product_id', pid)
          .eq('stock_type', ptype)
          .order('created_at', { ascending: true });
        if (dateFrom) q = q.gte('created_at', dateFrom);
        if (dateTo) q = q.lte('created_at', dateTo);
        return q.limit(limit);
      });
    }

    // 3. Transfer request lifecycle (shipment + optional receipt)
    const trRes = await withRetry(() => {
      let q = supabase
        .from('stock_transfers')
        .select('*')
        .eq('product_id', pid)
        .eq('stock_type', ptype)
        .order('transferred_at', { ascending: true });
      if (branchFilter) {
        if (branchFilter === 'corporate') {
          q = q.or('from_branch_id.is.null,to_branch_id.is.null');
        } else {
          const bid = Number(branchFilter);
          q = q.or(`to_branch_id.eq.${bid},from_branch_id.eq.${bid}`);
        }
      }
      if (dateFrom) q = q.gte('transferred_at', dateFrom);
      if (dateTo) q = q.lte('transferred_at', dateTo);
      return q.limit(limit);
    });

    if (stRes.error && stRes.error.code !== '503') console.warn('getProductHistory stock_transactions:', stRes.error.message);
    if (cstRes.error && cstRes.error.code !== '503') console.warn('getProductHistory corporate_stock_transactions:', cstRes.error.message);
    if (trRes.error && trRes.error.code !== '503') console.warn('getProductHistory stock_transfers:', trRes.error.message);

    // Branch name resolution map (small lookup table)
    const { data: branchesData } = await supabase.from('branches').select('id, branch_name');
    const branchesMap = {};
    (branchesData || []).forEach((b) => { branchesMap[Number(b.id)] = b.branch_name; });

    const branchName = (id) => {
      if (id === null || id === undefined || id === '' || id === 'corporate' || Number(id) === 0) return 'Corporate Warehouse';
      const n = Number(id);
      return branchesMap[n] || `Branch ${n}`;
    };

    const merged = [];

    // --- stock_transactions (branch level) ---
    // quantity is already signed in this table.
    (stRes.data || []).forEach((r) => {
      const t = (r.transaction_type || '').toLowerCase();
      if (t === 'transfer') return; // represented canonically by stock_transfers
      const qty = Number(r.quantity) || 0;
      const branch = branchName(r.branch_id);
      let type, from, to, signedQty;

      if (t === 'inward') {
        // Skip receipt rows emitted by receiveTransfer — they duplicate the
        // "Branch Receipt" event already captured by stock_transfers.
        if ((r.remarks || '').includes('Received from')) return;
        type = 'Stock Added';
        signedQty = Math.abs(qty);
        from = '—';
        to = branch;
      } else if (t === 'outward') {
        type = 'Stock Used';
        signedQty = -Math.abs(qty);
        from = branch;
        to = 'Consumed';
      } else if (t === 'adjustment') {
        type = 'Manual Correction';
        signedQty = qty; // already signed
        from = 'Manual Adjustment';
        to = branch;
      } else {
        type = 'Stock Movement';
        signedQty = qty;
        from = '—';
        to = branch;
      }

      merged.push({
        id: `st-${r.id}`,
        source: 'stock_transactions',
        transaction_type: type,
        date: r.created_at,
        product_name: r.product_name || productName || '',
        product_id: r.consumable_id,
        product_type: r.product_type,
        quantity: signedQty,
        from,
        to,
        status: (t.charAt(0).toUpperCase() + t.slice(1)) || 'Completed',
        remarks: r.remarks || '',
        created_by: r.created_by || 'System',
        branch_id: r.branch_id || null,
      });
    });

    // --- corporate_stock_transactions (corporate level) ---
    // `quantity` here is the absolute magnitude (CHECK quantity > 0). The real
    // signed change is derived from balance_after vs the previous corporate txn.
    let prevCorpBalance = null;
    (cstRes.data || []).forEach((r) => {
      const balance = r.balance_after != null ? Number(r.balance_after) : prevCorpBalance;
      const delta = prevCorpBalance !== null ? (balance - prevCorpBalance) : balance;
      prevCorpBalance = balance; // track for every row (incl. transfers) in chronological order

      const t = (r.transaction_type || '').toLowerCase();
      if (t === 'transfer') return; // represented canonically by stock_transfers

      const from = r.from_location || 'Corporate Warehouse';
      const to = r.to_location || 'Corporate Warehouse';
      let type;
      if (t === 'inward') {
        type = from === 'Opening Balance' || from === 'Opening Stock' ? 'Opening Stock' : 'Stock Added';
      } else if (t === 'outward') {
        type = 'Stock Used';
      } else if (t === 'adjustment') {
        type = 'Stock Updated';
      } else {
        type = 'Stock Movement';
      }

      merged.push({
        id: `cct-${r.id}`,
        source: 'corporate_stock_transactions',
        transaction_type: type,
        date: r.created_at,
        product_name: r.product_name || productName || '',
        product_id: r.product_id,
        product_type: r.stock_type,
        quantity: delta,
        from,
        to,
        status: 'Completed',
        remarks: r.remarks || '',
        created_by: r.created_by || 'System',
        balance_after: r.balance_after,
      });
    });

    // --- stock_transfers (transfer lifecycle) ---
    (trRes.data || []).forEach((r) => {
      const qty = Number(r.quantity) || 0;
      const fromBranch = branchName(r.from_branch_id);
      const toBranch = branchName(r.to_branch_id);
      const status = r.status || 'Pending';

      // Always: the shipment (stock leaves the source)
      merged.push({
        id: `str-${r.id}-ship`,
        source: 'stock_transfers',
        transaction_type: 'Transfer Out',
        date: r.transferred_at,
        product_name: r.product_name || productName || '',
        product_id: r.product_id,
        product_type: r.stock_type,
        quantity: -qty,
        from: fromBranch,
        to: toBranch,
        status,
        remarks: r.remarks || '',
        created_by: r.transferred_by || 'System',
      });

      // When received: the goods land at the destination branch
      if (status === 'Received' && r.received_at) {
        merged.push({
          id: `str-${r.id}-receipt`,
          source: 'stock_transfers',
          transaction_type: 'Branch Receipt',
          date: r.received_at,
          product_name: r.product_name || productName || '',
          product_id: r.product_id,
          product_type: r.stock_type,
          quantity: qty,
          from: fromBranch,
          to: toBranch,
          status: 'Received',
          remarks: r.remarks || '',
          created_by: r.received_by || r.transferred_by || 'System',
        });
      } else if (status === 'Cancelled') {
        merged.push({
          id: `str-${r.id}-cancel`,
          source: 'stock_transfers',
          transaction_type: 'Transfer Cancelled',
          date: r.transferred_at,
          product_name: r.product_name || productName || '',
          product_id: r.product_id,
          product_type: r.stock_type,
          quantity: 0,
          from: fromBranch,
          to: toBranch,
          status: 'Cancelled',
          remarks: r.remarks || '',
          created_by: r.transferred_by || 'System',
        });
      }
    });

    // Newest first
    merged.sort((a, b) => new Date(b.date) - new Date(a.date));
    return merged.slice(0, limit);
  } catch (e) {
    console.error('Error fetching product history:', e);
    return [];
  }
}
