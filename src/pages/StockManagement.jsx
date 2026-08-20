import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import { Search, Plus, Edit2, Package, TrendingUp, TrendingDown, ArrowLeftRight, History, FileText, FileSpreadsheet, Send, Printer } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import * as stockApi from '../services/stockApi';

// MIS operations are recorded against this user
const CURRENT_USER = 'Admin';

const StockManagement = () => {
  const { branchId, misMode } = useBranch();
  const [activeTab, setActiveTab] = useState('billable');
  const [stock, setStock] = useState([]);
  const [corporateStock, setCorporateStock] = useState([]);
  const [history, setHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');
  const [historyProductFilter, setHistoryProductFilter] = useState(null);
  // History sub-tab: 'transfers' (Stock Transfers) | 'consumed' (Consumed / Usage History)
  const [historySubTab, setHistorySubTab] = useState('transfers');
  // History filters: branch (MIS only) + date range
  const [historyBranchFilter, setHistoryBranchFilter] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');

  // Adjust stock modal (existing, kept)
  const [adjustForm, setAdjustForm] = useState({ product_id: '', product_type: 'Billable', current_stock: 0, add_units: '', reduce_units: '', remarks: '' });
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Corporate stock: Add Product modal (creates/updates a corporate_stock row)
  const [corporateForm, setCorporateForm] = useState({ product_id: '', product_type: 'Billable', available_units: '', minimum_units: 10, remarks: '' });
  const [showCorporateModal, setShowCorporateModal] = useState(false);
  const [editingCorporateId, setEditingCorporateId] = useState(null);

  // Corporate stock: Add Stock modal (inward increment to an existing corporate product)
  const [showCorpAddStockModal, setShowCorpAddStockModal] = useState(false);
  const [corpAddStockForm, setCorpAddStockForm] = useState({ product_id: '', quantity: '', remarks: '' });

  // Branch inward modal (Add Product on Billable / Non-Billable tabs)
  const [showAddInwardModal, setShowAddInwardModal] = useState(false);
  const [addInwardForm, setAddInwardForm] = useState({ product_id: '', quantity: '', remarks: '' });

  // Bulk Transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ transfer_type: 'Corporate→Branch', product_type: 'Billable', from_branch_id: 'corporate', to_branch_id: branchId || '', remarks: '' });
  const [transferRows, setTransferRows] = useState([]);
  const [transferSearch, setTransferSearch] = useState('');

  // ---- Branches ----
  const fetchBranches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, branch_name')
        .order('branch_name');

      if (!error && data) {
        setBranches([
          { id: 'corporate', branch_name: 'Corporate Warehouse' },
          ...data,
        ]);
      }
    } catch (e) {
      console.error('Error fetching branches:', e);
    }
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // ---- Initial data load ----
  useEffect(() => {
    if (branchId) {
      fetchStock();
      fetchCorporateStock();
      fetchProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, activeTab]);

  // Toast auto-clear
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3000);
      return () => clearTimeout(t);
    }
  }, [successMsg]);
  useEffect(() => {
    if (errorMsg) {
      const t = setTimeout(() => setErrorMsg(''), 4000);
      return () => clearTimeout(t);
    }
  }, [errorMsg]);

  const fetchStock = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const data = await stockApi.getBranchStock(branchId);
      setStock(data || []);
      setErrorMsg('');
    } catch (e) {
      console.error('Error fetching stock:', e);
      setErrorMsg('Failed to load branch stock');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const fetchCorporateStock = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('corporate_stock')
        .select('*')
        .order('product_name');

      if (!error && data) {
        setCorporateStock(data);
        setErrorMsg('');
      } else {
        setErrorMsg('Failed to load corporate stock');
      }
    } catch (e) {
      console.error('Error fetching corporate stock:', e);
      setErrorMsg('Failed to load corporate stock');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const [billable, nonBillable] = await Promise.all([
        supabase.from('master_billable_consumables').select('id, product_name, unit, minimum_stock').eq('status', 'Active').order('product_name'),
        supabase.from('master_non_billable_consumables').select('id, product_name, minimum_stock').eq('status', 'Active').order('product_name'),
      ]);

      const billableProducts = (billable.data || []).map(p => ({ ...p, type: 'Billable' }));
      const nonBillableProducts = (nonBillable.data || []).map(p => ({ ...p, type: 'Non-Billable' }));
      setProducts([...billableProducts, ...nonBillableProducts]);
    } catch (e) {
      console.error('Error fetching products:', e);
    }
  };

  // Branch name lookup for transfer rows (from_branch_id / to_branch_id)
  const branchNameById = (id) => {
    if (id === null || id === undefined || id === '' || Number(id) === 0) return 'Corporate Warehouse';
    const b = branches.find(x => String(x.id) === String(id));
    return b ? b.branch_name : (id === 'corporate' ? 'Corporate Warehouse' : `Branch ${id}`);
  };

  // Transaction History shows BOTH inter-branch transfers (stock_transfers) AND
  // branch-level stock movements (stock_transactions) — i.e. consumption/usage
  // (Outward), stock adds (Inward) and manual adjustments — so that consumable
  // usage is visible here, not just transfers.
  // MIS Admin -> ALL. Branch user -> only their own branch.
  // NOTE: transfer bookkeeping rows are skipped because they are already
  // represented by the canonical stock_transfers records (avoids duplicates).
  const fetchHistory = useCallback(async (productFilter = null) => {
    if (!misMode && !branchId && !productFilter) return;
    setLoading(true);
    try {
      let merged = [];

      // Resolve active filters (branch filter only applies to MIS Admin)
      const activeBranchFilter = misMode ? (historyBranchFilter || null) : null;
      const dateFrom = historyDateFrom ? new Date(historyDateFrom).toISOString() : null;
      const dateTo = historyDateTo ? new Date(historyDateTo + 'T23:59:59').toISOString() : null;

      if (productFilter) {
        // ================================================================
        // PRODUCT-SPECIFIC HISTORY (View History icon):
        // Use the comprehensive product-level audit trail that matches the
        // EXACT product_id and merges ALL sources:
        //   stock_transactions  (branch Inward/Outward/Adjustment)
        //   corporate_stock_transactions (corporate movements)
        //   stock_transfers     (transfer lifecycle: ship + receive)
        // ================================================================
        const rows = await stockApi.getProductHistory(
          productFilter.id,
          productFilter.type,
          productFilter.name || '',
          500,
          dateFrom,
          dateTo,
          activeBranchFilter
        );

        merged = (rows || []).map((r) => ({
          id: r.id,
          source: r.source,
          transaction_type: r.transaction_type,
          product_id: r.product_id,
          product_type: r.product_type,
          stock_type: r.product_type,
          product_name: r.product_name || productFilter.name || `Product ${r.product_id || ''}`,
          quantity: Number(r.quantity) || 0,
          transferred_at: r.date,
          status: r.status || 'Completed',
          fromLabel: r.from,
          toLabel: r.to,
          from_branch_id: null,
          to_branch_id: null,
          branch_id: r.branch_id || null,
          remarks: r.remarks || '',
          balance_after: r.balance_after,
        }));
      } else {
        // ================================================================
        // GLOBAL TRANSACTION HISTORY (Transaction History tab, no filter):
        // Shows inter-branch transfers (stock_transfers) AND branch-level
        // stock movements (stock_transactions — consumption/usage, adds,
        // adjustments). MIS Admin -> ALL. Branch user -> their branch only.
        // ================================================================
        // Branch filter applies to usage records too (MIS Admin only).
        // 'corporate' has no branch_id in stock_transactions (it lives in
        // corporate_stock_transactions), so pass null for that case.
        const txnBranchId = misMode
          ? (activeBranchFilter && activeBranchFilter !== 'corporate' ? Number(activeBranchFilter) : null)
          : branchId;
        const [transferData, txnData] = await Promise.all([
          stockApi.getTransfers(branchId, misMode, 500, null, null, activeBranchFilter, dateFrom, dateTo),
          stockApi.getStockHistory(null, null, txnBranchId, 500, dateFrom, dateTo),
        ]);

        // stock_transactions does not store the product name; resolve it from the
        // master product list (falls back to "Product <id>").
        const productLookup = {};
        (products || []).forEach((p) => {
          productLookup[`${Number(p.id)}|${p.type}`] = p.product_name;
        });

        const consumptionRows = (txnData || [])
          .filter((r) => {
            const t = (r.transaction_type || '').toLowerCase();
            if (t === 'transfer') return false; // mirrored by stock_transfers
            if (t === 'inward' && (r.remarks || '').toLowerCase().includes('received from')) return false; // receipt already on stock_transfers
            return true;
          })
          .map((r) => {
            const t = (r.transaction_type || '').toLowerCase();
            const isOutward = t === 'outward';
            const isInward = t === 'inward';
            return {
              id: `tx-${r.id}`,
              source: 'stock_transactions',
              transaction_type: r.transaction_type,
              product_id: r.consumable_id,
              product_type: r.product_type,
              stock_type: r.product_type,
              product_name: r.product_name || productLookup[`${Number(r.consumable_id)}|${r.product_type}`] || `Product ${r.consumable_id || ''}`,
              quantity: Number(r.quantity) || 0,
              transferred_at: r.created_at,
              status: 'Completed',
              from_branch_id: isOutward ? r.branch_id : null,
              to_branch_id: (isInward || t === 'adjustment') ? r.branch_id : null,
              branch_id: r.branch_id,
              remarks: r.remarks || '',
            };
          });

        merged = [...(transferData || []), ...consumptionRows];
      }

      merged.sort((a, b) => new Date(b.transferred_at || 0) - new Date(a.transferred_at || 0));
      setHistory(merged);
      setErrorMsg('');
    } catch (e) {
      console.error('Error fetching transaction history:', e);
      setErrorMsg('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  }, [misMode, branchId, products, historyBranchFilter, historyDateFrom, historyDateTo]);

  // Branch user confirms receipt -> stock moves into the destination branch
  const handleReceive = async (transfer) => {
    if (!window.confirm(`Confirm receipt of ${transfer.quantity} ${transfer.product_name || 'units'}?`)) return;
    setLoading(true);
    try {
      const result = await stockApi.receiveTransfer(transfer.id, CURRENT_USER);
      if (result.success) {
        setSuccessMsg('Transfer received. Branch stock updated.');
        fetchHistory(historyProductFilter);
        fetchStock();
      } else {
        setErrorMsg(result.message || 'Failed to receive transfer');
      }
    } catch (e) {
      setErrorMsg('Error receiving transfer: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewHistory = (product) => {
    setHistoryProductFilter(product);
    setSearch('');
    setActiveTab('history');
    fetchHistory(product);
  };

  // Clear all history filters (branch + date range)
  const clearHistoryFilters = () => {
    setHistoryBranchFilter('');
    setHistoryDateFrom('');
    setHistoryDateTo('');
    fetchHistory(historyProductFilter);
  };

  // ---- Adjust stock (existing) ----
  const handleAdjustStock = async () => {
    if (!adjustForm.product_id) return;

    const currentStock = Number(adjustForm.current_stock) || 0;
    const addUnits = Number(adjustForm.add_units) || 0;
    const reduceUnits = Number(adjustForm.reduce_units) || 0;

    if (addUnits <= 0 && reduceUnits <= 0) {
      alert('Please enter units to add or reduce');
      return;
    }

    if (addUnits > 0 && reduceUnits > 0) {
      alert('Please enter only add OR reduce units, not both');
      return;
    }

    const newStock = addUnits > 0 ? currentStock + addUnits : currentStock - reduceUnits;

    if (newStock < 0) {
      alert('Stock cannot be negative');
      return;
    }

    setLoading(true);
    try {
      const adjustmentType = addUnits > 0 ? 'Add' : 'Reduce';
      const result = await stockApi.adjustStock(
        adjustForm.product_type,
        Number(adjustForm.product_id),
        branchId,
        newStock,
        adjustForm.remarks || `${adjustmentType} units manually`,
        CURRENT_USER
      );

      if (result.success) {
        setSuccessMsg(`Stock adjusted successfully. New stock: ${newStock}`);
        setShowAdjustModal(false);
        setAdjustForm({ product_id: '', product_type: 'Billable', current_stock: 0, add_units: '', reduce_units: '', remarks: '' });
        fetchStock();
      } else {
        setErrorMsg(result.message || 'Failed to adjust stock');
      }
    } catch (e) {
      setErrorMsg('Error adjusting stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Branch inward stock (Add Product on Billable / Non-Billable tabs) ----
  const handleAddInwardStock = async () => {
    if (!addInwardForm.product_id || !addInwardForm.quantity) {
      alert('Please select a product and enter a quantity');
      return;
    }
    const qty = Number(addInwardForm.quantity);
    if (qty <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }
    const productType = activeTab === 'billable' ? 'Billable' : 'Non-Billable';
    setLoading(true);
    try {
      const result = await stockApi.addInwardStock(
        productType,
        Number(addInwardForm.product_id),
        branchId,
        qty,
        addInwardForm.remarks || 'Inward stock added',
        CURRENT_USER
      );
      if (result.success) {
        setSuccessMsg(`Inward stock added successfully. New balance: ${result.newStock}`);
        setShowAddInwardModal(false);
        setAddInwardForm({ product_id: '', quantity: '', remarks: '' });
        fetchStock();
      } else {
        setErrorMsg(result.message);
      }
    } catch (e) {
      setErrorMsg('Error adding inward stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Corporate: Add Product (create/update corporate_stock row) ----
  const handleSaveCorporateStock = async () => {
    if (!corporateForm.product_id || !corporateForm.available_units) {
      alert('Please fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      const productIdInt = parseInt(corporateForm.product_id);
      const availableUnitsInt = parseInt(corporateForm.available_units);
      const minimumUnitsInt = parseInt(corporateForm.minimum_units) || 10;
      const productName = products.find(p => String(p.id) === corporateForm.product_id)?.product_name || '';

      if (!editingCorporateId) {
        // Add Product mode: make sure the product is not already tracked at corporate level
        const { data: existing } = await supabase
          .from('corporate_stock')
          .select('id')
          .eq('product_id', productIdInt)
          .eq('stock_type', corporateForm.product_type)
          .maybeSingle();

        if (existing) {
          alert(`"${productName}" already exists in corporate stock. Use "Add Stock" to increase its quantity or edit the existing entry.`);
          return;
        }
      }

      let error;
      if (editingCorporateId) {
        const result = await supabase
          .from('corporate_stock')
          .update({ available_units: availableUnitsInt, minimum_units: minimumUnitsInt, updated_by: CURRENT_USER })
          .eq('id', editingCorporateId);
        error = result.error;
      } else {
        const result = await supabase
          .from('corporate_stock')
          .upsert({
            product_id: productIdInt,
            product_name: productName,
            stock_type: corporateForm.product_type,
            available_units: availableUnitsInt,
            minimum_units: minimumUnitsInt,
            updated_by: CURRENT_USER,
          }, { onConflict: 'product_id,stock_type' });
        error = result.error;
      }

      if (error) throw error;

      // Transaction log (Inward for new, Adjustment for edits)
      await supabase.from('corporate_stock_transactions').insert([{
        product_id: productIdInt,
        product_name: productName,
        stock_type: corporateForm.product_type,
        transaction_type: editingCorporateId ? 'Adjustment' : 'Inward',
        quantity: availableUnitsInt,
        balance_after: availableUnitsInt,
        remarks: corporateForm.remarks || (editingCorporateId ? 'Stock updated' : 'Initial stock'),
        from_location: editingCorporateId ? 'Adjustment' : 'Opening Balance',
        to_location: 'Corporate Warehouse',
        created_by: CURRENT_USER,
      }]);

      setSuccessMsg(editingCorporateId ? 'Corporate stock updated successfully' : 'Corporate stock added successfully');
      setShowCorporateModal(false);
      setEditingCorporateId(null);
      setCorporateForm({ product_id: '', product_type: 'Billable', available_units: '', minimum_units: 10, remarks: '' });
      fetchCorporateStock();
    } catch (error) {
      console.error('Error saving corporate stock:', error);
      setErrorMsg('Failed to save corporate stock: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Corporate: Add Stock (inward increment) ----
  const handleCorpAddStock = async () => {
    if (!corpAddStockForm.product_id || !corpAddStockForm.quantity) {
      alert('Please select a product and enter a quantity');
      return;
    }
    const qty = Number(corpAddStockForm.quantity);
    if (qty <= 0) {
      alert('Quantity must be greater than 0');
      return;
    }
    const selectedRow = corporateStock.find(x => String(x.id) === corpAddStockForm.product_id);
    if (!selectedRow) {
      alert('Invalid product selection');
      return;
    }
    setLoading(true);
    try {
      const result = await stockApi.addCorporateInwardStock(
        selectedRow.product_id,
        selectedRow.stock_type,
        selectedRow.product_name,
        qty,
        corpAddStockForm.remarks || 'Inward stock added',
        CURRENT_USER
      );
      if (result.success) {
        setSuccessMsg('Stock added to corporate warehouse successfully');
        setShowCorpAddStockModal(false);
        setCorpAddStockForm({ product_id: '', quantity: '', remarks: '' });
        fetchCorporateStock();
      } else {
        setErrorMsg(result.message);
      }
    } catch (e) {
      setErrorMsg('Error adding corporate stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Transfer helpers ----
  const initTransferRows = (productType, sourceBranchId) => {
    if (sourceBranchId === 'corporate') {
      return corporateStock
        .filter(x => x.stock_type === productType)
        .map(x => ({
          id: x.id,
          product_id: x.product_id,
          product_name: x.product_name,
          stock_type: x.stock_type,
          available: Number(x.available_units) || 0,
          qty: '',
          selected: false,
        }));
    }
    
    // Branch-to-Branch or Branch-to-Corporate: use current branch stock as source
    return stock
      .filter(x => x.product_type === productType)
      .map(x => {
        const product = products.find(p => p.id === x.consumable_id && p.type === x.product_type);
        return {
          id: x.id,
          product_id: x.consumable_id,
          product_name: product?.product_name || `Product ${x.consumable_id}`,
          stock_type: x.product_type,
          available: Number(x.current_stock) || 0,
          qty: '',
          selected: false,
        };
      });
  };

  const openTransferModal = () => {
    const type = activeTab === 'non-billable' ? 'Non-Billable' : 'Billable';
    let transferType = 'Corporate→Branch';
    let fromBranchId = 'corporate';
    
    // For MIS Admin with branch selected, default to Branch→Branch
    // For branch users, always start with Branch→Branch
    if (branchId) {
      transferType = 'Branch→Branch';
      fromBranchId = String(branchId);
    }
    
    const formData = { transfer_type: transferType, product_type: type, from_branch_id: fromBranchId, to_branch_id: '', remarks: '' };
    
    // Initialize transfer rows based on the source branch - FORCE new array
    const rows = initTransferRows(type, fromBranchId);
    
    // Reset all state
    setTransferForm(formData);
    setTransferRows(rows);
    setTransferSearch('');
    setShowTransferModal(true);
  };

  const getAvailableLocations = (transferType, currentBranchId) => {
    // Ensure branches are loaded before filtering
    if (!branches || branches.length === 0) {
      return [{ id: 'corporate', name: 'Corporate Warehouse' }];
    }
    
    const currentId = String(currentBranchId);
    const locs = branches.map(b => ({ id: String(b.id), name: b.branch_name }));
    
    switch (transferType) {
      case 'Corporate→Branch':
        // From: Corporate, To: Any branch
        return [{ id: 'corporate', name: 'Corporate Warehouse' }, ...locs.filter(l => l.id !== 'corporate')];
      case 'Branch→Corporate':
        // From: Current branch only, To: Corporate
        return [{ id: 'corporate', name: 'Corporate Warehouse' }, ...locs.filter(l => l.id === currentId)];
      case 'Branch→Branch':
        // From: Current branch, To: Other branches (exclude corporate)
        const currentBranch = locs.find(l => l.id === currentId);
        const otherBranches = locs.filter(l => l.id !== 'corporate' && l.id !== currentId);
        if (currentBranch) {
          return [currentBranch, ...otherBranches];
        }
        return otherBranches;
      default:
        return locs;
    }
  };

  // Sync transfer rows when from_branch_id or product_type changes
  // NOTE: Do NOT include transfer_type here - it causes race condition with handleTransferTypeChange
  useEffect(() => {
    if (showTransferModal && transferForm.from_branch_id) {
      const rows = initTransferRows(transferForm.product_type, transferForm.from_branch_id);
      setTransferRows(rows);
    }
  }, [showTransferModal, transferForm.from_branch_id, transferForm.product_type]);

  const handleTransferTypeChange = (newType) => {
    let fromId = 'corporate';
    let toId = '';
    
    // Set correct from_branch_id based on transfer type
    if (newType === 'Corporate→Branch') {
      fromId = 'corporate';
    } else if ((newType === 'Branch→Corporate' || newType === 'Branch→Branch') && branchId) {
      fromId = String(branchId);
    }
    
    // Guard: if branchId is not available for branch-based transfers, don't update
    if ((newType === 'Branch→Corporate' || newType === 'Branch→Branch') && !branchId) {
      console.warn('Cannot switch to branch-based transfer: branchId not available');
      return;
    }
    
    // Update form state
    const updatedForm = { 
      transfer_type: newType, 
      product_type: transferForm.product_type,
      from_branch_id: fromId, 
      to_branch_id: toId,
      remarks: transferForm.remarks
    };
    
    // Immediately initialize rows with the correct from_branch_id
    const newRows = initTransferRows(transferForm.product_type, fromId);
    
    // Update both form and rows together
    setTransferForm(updatedForm);
    setTransferRows(newRows);
  };

  const handleTransferAll = async () => {
    const { transfer_type, from_branch_id, to_branch_id, product_type, remarks } = transferForm;

    if (!to_branch_id) {
      alert('Please select a destination');
      return;
    }
    if (from_branch_id === to_branch_id) {
      alert('Source and destination cannot be the same');
      return;
    }
    if (transfer_type === 'Corporate→Branch' && to_branch_id === 'corporate') {
      alert('Please select a valid branch destination');
      return;
    }
    if (transfer_type === 'Branch→Corporate' && from_branch_id === 'corporate') {
      alert('Source must be a branch for Branch → Corporate transfer');
      return;
    }

    const toTransfer = transferRows.filter(r => r.selected && Number(r.qty) > 0);
    if (toTransfer.length === 0) {
      alert('Please select at least one product and enter a transfer quantity');
      return;
    }

    const invalid = toTransfer.find(r => Number(r.qty) > r.available);
    if (invalid) {
      alert(`Available stock is only ${invalid.available} units for ${invalid.product_name || 'product'}.`);
      return;
    }

    const toBranch = branches.find(b => String(b.id) === String(to_branch_id));
    const toBranchName = toBranch?.branch_name || '';
    const fromBranch = branches.find(b => String(b.id) === String(from_branch_id));
    const fromBranchName = fromBranch?.branch_name || 'Corporate Warehouse';

    if (!toBranchName) {
      alert('Invalid destination selected');
      return;
    }

    setLoading(true);
    try {
      const transfers = toTransfer.map(r => ({
        product_id: r.product_id,
        product_name: r.product_name,
        stock_type: r.stock_type,
        quantity: Number(r.qty),
      }));

      const results = await stockApi.createMultiLocationTransferRequest(
        transfers,
        transfer_type,
        from_branch_id,
        to_branch_id,
        remarks || 'Stock transfer',
        CURRENT_USER
      );

      const failures = results.filter(r => !r.success);
      const successes = results.filter(r => r.success);

      let msg = `${successes.length} of ${toTransfer.length} product(s) transferred from ${fromBranchName} to ${toBranchName}.`;
      if (failures.length) {
        msg += '\n\nFailed:\n' + failures.map(f => `- ${f.product_name || 'Product'}: ${f.message}`).join('\n');
      }
      alert(msg);

      setShowTransferModal(false);
      setTransferRows([]);
      if (from_branch_id === 'corporate') {
        fetchCorporateStock();
      } else {
        fetchStock();
      }
      fetchHistory();
      setSuccessMsg('Transfer request created (Pending Receipt)');
    } catch (e) {
      setErrorMsg('Error transferring stock: ' + e.message);
      alert('Error transferring stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTransferRow = (idx, patch) => {
    setTransferRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const toggleTransferRow = (productId) => {
    const idStr = String(productId);
    setTransferRows(prev => prev.map(r => 
      (String(r.product_id) === idStr || String(r.id) === idStr) 
        ? { ...r, selected: !r.selected, qty: '' }
        : r
    ));
  };

  // ---- Helpers ----
  const getProduct = (item) => {
    const type = item.stock_type || item.product_type;
    const id = item.product_id || item.consumable_id;
    return products.find(p => p.id === id && p.type === type) || null;
  };


  const getTransactionIcon = (type) => {
    switch (type) {
      case 'Inward': return <TrendingUp size={16} className="text-green-600" />;
      case 'Outward': return <TrendingDown size={16} className="text-red-600" />;
      case 'Transfer': return <ArrowLeftRight size={16} className="text-blue-600" />;
      case 'Adjustment': return <Edit2 size={16} className="text-orange-600" />;
      default: return <Package size={16} className="text-gray-600" />;
    }
  };

  // ---- Filtering (search) ----
  const filteredStock = useMemo(() => {
    return stock.filter(item => {
      const product = products.find(p => p.id === item.consumable_id && p.type === item.product_type);
      const productName = product?.product_name || '';
      const matchesSearch = productName.toLowerCase().includes(search.toLowerCase());

      if (activeTab === 'billable') {
        return matchesSearch && item.product_type === 'Billable';
      } else if (activeTab === 'non-billable') {
        return matchesSearch && item.product_type === 'Non-Billable';
      }
      return matchesSearch;
    });
  }, [stock, products, search, activeTab]);

  const filteredCorporateStock = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    if (!s) return corporateStock;
    return corporateStock.filter(item => {
      const product = products.find(p => p.id === item.product_id && p.type === item.stock_type);
      const name = (item.product_name || product?.product_name || '').toLowerCase();
      const type = (item.stock_type || '').toLowerCase();
      return name.includes(s) || type.includes(s);
    });
  }, [corporateStock, products, search]);

  // ---------------------------------------------------------------------------
  // HISTORY SUB-TAB CLASSIFICATION
  // ---------------------------------------------------------------------------
  // Stock Transfers tab  -> inter-warehouse / inter-branch movements
  //   (stock_transfers lifecycle: Transfer Out / Branch Receipt / Transfer
  //    Cancelled, plus any row with status Pending / Received / Cancelled).
  // Consumed / Usage tab -> clinic consumption (Outward / Stock Used / "Consumed").
  // ---------------------------------------------------------------------------
  const transferHistory = useMemo(() => {
    return (history || []).filter(item => {
      if (item.source === 'stock_transfers') return true;
      const t = (item.transaction_type || '').toLowerCase();
      if (t.includes('transfer')) return true;
      if (item.status === 'Pending' || item.status === 'Received' || item.status === 'Cancelled') return true;
      // Global inter-branch transfer rows carry both from + to branch ids
      if (item.from_branch_id && item.to_branch_id && t !== 'outward' && item.toLabel !== 'Consumed') return true;
      return false;
    });
  }, [history]);

  const consumedHistory = useMemo(() => {
    return (history || []).filter(item => {
      const t = (item.transaction_type || '').toLowerCase();
      if (t === 'outward') return true;
      if (t.includes('used')) return true;   // "Stock Used" (product audit trail)
      if (item.toLabel === 'Consumed') return true;
      return false;
    });
  }, [history]);

  const filteredHistory = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    let result = history;

    // Product-specific filter: only show transfers for the selected product
    if (historyProductFilter) {
      const filterId = Number(historyProductFilter.id);
      const filterType = historyProductFilter.type;
      result = result.filter(item =>
        Number(item.product_id) === filterId &&
        (item.stock_type || '') === filterType
      );
    }

    // Sub-tab filter (Stock Management History tab only)
    if (activeTab === 'history') {
      if (historySubTab === 'consumed') {
        const ids = new Set(consumedHistory.map(i => i.id));
        result = result.filter(item => ids.has(item.id));
      } else {
        const ids = new Set(transferHistory.map(i => i.id));
        result = result.filter(item => ids.has(item.id));
      }
    }

    if (!s) return result;
    return result.filter(item => {
      const productName = (item.product_name || '').toLowerCase();
      const type = (item.stock_type || '').toLowerCase();
      const fromBranch = branchNameById(item.from_branch_id).toLowerCase();
      const toBranch = branchNameById(item.to_branch_id).toLowerCase();
      const status = (item.status || '').toLowerCase();
      const txnType = (item.transaction_type || '').toLowerCase();
      const remarks = (item.remarks || '').toLowerCase();
      return productName.includes(s) || type.includes(s) || fromBranch.includes(s) || toBranch.includes(s) || status.includes(s) || txnType.includes(s) || remarks.includes(s);
    });
  }, [history, search, branches, historyProductFilter, activeTab, historySubTab, transferHistory, consumedHistory, historyBranchFilter, historyDateFrom, historyDateTo]);

  // ---- Unified export data (works for every tab) ----
  const buildExportData = useMemo(() => {
    if (activeTab === 'corporate') {
      const rows = filteredCorporateStock.map(item => ({
        'Product Name': item.product_name || getProduct(item)?.product_name || `Product ${item.product_id}`,
        'Type': item.stock_type,
        'Available Units': item.available_units,
        'Minimum Units': item.minimum_units || 10,
        'Last Updated': item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-',
      }));
      return { title: 'Corporate Stock Report', headers: ['Product Name', 'Type', 'Available Units', 'Minimum Units', 'Last Updated'], rows };
    }

    if (activeTab === 'history') {
      const isConsumedTab = historySubTab === 'consumed';
      const rows = filteredHistory.map(item => ({
        'Date': item.transferred_at ? new Date(item.transferred_at).toLocaleString('en-GB') : '-',
        'Product': item.product_name || `Product ${item.product_id || ''}`,
        'Qty': isConsumedTab ? `-${Math.abs(Number(item.quantity) || 0)}` : item.quantity,
        'From': item.fromLabel || (item.transaction_type === 'Inward' ? 'Stock Added' : item.transaction_type === 'Adjustment' ? 'Manual Correction' : branchNameById(item.from_branch_id)),
        'To': item.toLabel || (item.transaction_type === 'Outward' ? 'Consumed' : branchNameById(item.to_branch_id)),
        'Status': item.status || '-',
      }));
      return {
        title: isConsumedTab ? 'Consumed / Usage History Report' : 'Stock Transfers Report',
        headers: ['Date', 'Product', 'Qty', 'From', 'To', 'Status'],
        rows,
      };
    }

    const rows = filteredStock.map(item => {
      const product = getProduct(item);
      return {
        'Product Name': product?.product_name || `Product ${item.consumable_id}`,
        'Type': item.product_type,
        'Available Units': item.current_stock,
        'Minimum Units': product?.minimum_stock || 10,
        'Last Updated': item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-',
      };
    });
    const tabLabel = activeTab === 'billable' ? 'Billable' : 'Non-Billable';
    return { title: `${tabLabel} Stock Report`, headers: ['Product Name', 'Type', 'Available Units', 'Minimum Units', 'Last Updated'], rows };
  }, [activeTab, filteredStock, filteredCorporateStock, filteredHistory, products]);

  // ---- Export functions ----
  const downloadCSV = () => {
    const { headers, rows } = buildExportData;
    if (rows.length === 0) return;

    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    const { rows, title } = buildExportData;
    if (rows.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title);
    XLSX.writeFile(workbook, `stock-${activeTab}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPDF = () => {
    const { headers, rows, title } = buildExportData;
    if (rows.length === 0) return;

    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginLeft = 40;
    const marginTop = 100;
    const rowHeight = 22;
    const colWidth = (pageWidth - marginLeft * 2) / headers.length;
    const bottomMargin = 50;
    let y = marginTop;

    // Header block
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('ARMORAA', marginLeft, 34);

    doc.setFontSize(15);
    doc.setFont('helvetica', 'normal');
    doc.text(title, marginLeft, 56);

    doc.setFontSize(9);
    doc.setTextColor(128);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth - marginLeft, 34, { align: 'right' });
    doc.setTextColor(0);

    const drawTableHeader = (yy) => {
      doc.setFillColor(241, 245, 249);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      let x = marginLeft;
      headers.forEach(h => {
        doc.rect(x, yy, colWidth, rowHeight, 'FD');
        doc.text(h, x + colWidth / 2, yy + rowHeight / 2 + 3, { align: 'center' });
        x += colWidth;
      });
    };

    const drawRow = (cells, yy, alt) => {
      const r = alt ? 248 : 255;
      doc.setFillColor(r, r, r);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      let x = marginLeft;
      cells.forEach(cell => {
        doc.rect(x, yy, colWidth, rowHeight, 'FD');
        doc.text(String(cell), x + 5, yy + rowHeight / 2 + 3);
        x += colWidth;
      });
    };

    drawTableHeader(y);
    y += rowHeight;

    rows.forEach((row, i) => {
      const cells = headers.map(h => row[h]);
      if (y + rowHeight > doc.internal.pageSize.getHeight() - bottomMargin) {
        doc.addPage();
        drawTableHeader(marginTop);
        y = marginTop + rowHeight;
      }
      drawRow(cells, y, i % 2 === 0);
      y += rowHeight;
    });

    doc.save(`${title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const currentTabType = activeTab === 'non-billable' ? 'Non-Billable' : 'Billable';

  return (
    <div className="page-wrapper animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Stock Management</h1>
          <p>Track and manage consumable inventory</p>
        </div>
        <div className="page-header-actions">
          {/* Exports are available on every tab (uses the currently filtered records) */}
          <button
            onClick={downloadCSV}
            disabled={buildExportData.rows.length === 0 || loading}
            className="btn btn-secondary"
            title="Export CSV"
          >
            <FileText size={16} />
            Export CSV
          </button>
          <button
            onClick={downloadExcel}
            disabled={buildExportData.rows.length === 0 || loading}
            className="btn btn-secondary"
            title="Export Excel (all filtered records)"
          >
            <FileSpreadsheet size={16} />
            Export Excel
          </button>
          <button
            onClick={exportPDF}
            disabled={buildExportData.rows.length === 0 || loading}
            className="btn btn-secondary"
            title="Export PDF"
          >
            <Printer size={16} />
            Export PDF
          </button>

          {/* Corporate tab MIS actions */}
          {misMode && activeTab === 'corporate' && (
            <>
              <button
                onClick={() => {
                  setCorporateForm({ product_id: '', product_type: 'Billable', available_units: '', minimum_units: 10, remarks: '' });
                  setEditingCorporateId(null);
                  setShowCorporateModal(true);
                }}
                className="btn btn-primary"
                title="Add Product to Corporate Stock"
              >
                <Plus size={16} /> + Add Product
              </button>
              <button
                onClick={() => {
                  setCorpAddStockForm({ product_id: '', quantity: '', remarks: '' });
                  setShowCorpAddStockModal(true);
                }}
                className="btn btn-primary"
                style={{ backgroundColor: '#059669' }}
                title="Add Inward Stock to Corporate Warehouse"
              >
                <Plus size={16} /> + Add Stock
              </button>
            </>
          )}

          {/* Billable / Non-Billable MIS actions */}
          {misMode && activeTab !== 'corporate' && activeTab !== 'history' && (
            <button
              onClick={() => {
                setAddInwardForm({ product_id: '', quantity: '', remarks: '' });
                setShowAddInwardModal(true);
              }}
              className="btn btn-primary"
              title="Add Product / Inward Stock"
            >
              <Plus size={16} /> Add Product
            </button>
          )}

          {misMode && activeTab !== 'corporate' && activeTab !== 'history' && (
            <button
              onClick={openTransferModal}
              className="btn btn-primary"
              style={{ backgroundColor: '#059669' }}
              title="Transfer Stock"
            >
              <Send size={16} /> Transfer Stock
            </button>
          )}
        </div>
      </div>

      {/* Status toasts */}
      {successMsg && (
        <div className="toast toast-success">
          <Package size={16} /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="toast toast-error">
          <Package size={16} /> {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-line)] mb-4">
        <button
          onClick={() => { setActiveTab('billable'); setSearch(''); }}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'billable' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}
        >
          Billable Stock
        </button>
        <button
          onClick={() => { setActiveTab('non-billable'); setSearch(''); }}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'non-billable' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}
        >
          Non-Billable Stock
        </button>
        {misMode && (
          <button
            onClick={() => { setActiveTab('corporate'); setSearch(''); }}
            className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'corporate' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}
          >
            Corporate Stock
          </button>
        )}
        <button
          onClick={() => { setActiveTab('history'); setSearch(''); setHistoryProductFilter(null); setHistoryBranchFilter(''); setHistoryDateFrom(''); setHistoryDateTo(''); fetchHistory(); }}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'history' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}
        >
          Transaction History
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
          <div className="search-box flex-1" style={{ minWidth: 180 }}>
            <Search size={15} />
            <input
              placeholder={activeTab === 'history' ? 'Search history...' : 'Search products...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* History filters: Branch (MIS only) + Date Range */}
          {activeTab === 'history' && (
            <>
              {misMode && (
                <select
                  value={historyBranchFilter}
                  onChange={(e) => setHistoryBranchFilter(e.target.value)}
                  className="form-input"
                  style={{ width: 160, padding: '8px 10px', fontSize: 13 }}
                >
                  <option value="">All Branches</option>
                  {(branches || []).map((b) => (
                    <option key={b.id} value={String(b.id)}>{b.branch_name}</option>
                  ))}
                </select>
              )}
              <input
                type="date"
                value={historyDateFrom}
                onChange={(e) => setHistoryDateFrom(e.target.value)}
                className="form-input"
                style={{ width: 150, padding: '8px 10px', fontSize: 13 }}
                title="From Date"
              />
              <input
                type="date"
                value={historyDateTo}
                onChange={(e) => setHistoryDateTo(e.target.value)}
                className="form-input"
                style={{ width: 150, padding: '8px 10px', fontSize: 13 }}
                title="To Date"
              />
              <button
                onClick={() => fetchHistory(historyProductFilter)}
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
                title="Apply filters"
              >
                Apply
              </button>
              {(historyBranchFilter || historyDateFrom || historyDateTo) && (
                <button
                  onClick={clearHistoryFilters}
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
                  title="Clear all filters"
                >
                  Clear Filters
                </button>
              )}
            </>
          )}

          {/* Product filter indicator (History tab only) */}
          {activeTab === 'history' && historyProductFilter && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-primary)', fontWeight: 500, flexShrink: 0 }}>
              <Package size={14} />
              <span>Showing: {historyProductFilter.name || `Product #${historyProductFilter.id}`}</span>
              <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>({filteredHistory.length} records)</span>
              <button
                onClick={() => {
                  setHistoryProductFilter(null);
                  setSearch('');
                  fetchHistory();
                }}
                className="hover:text-[var(--color-ink)]"
                style={{ fontSize: 11, padding: '2px 8px', border: '1px solid var(--color-line)', borderRadius: 4 }}
                title="Show all transactions"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Corporate Stock Tab */}
      {activeTab === 'corporate' && (
        <div className="table-container">
          <table className="rpt-table">
            <thead>
              <tr>
                <th className="rpt-c-service">Product Name</th>
                <th className="rpt-c-service">Type</th>
                <th className="rpt-c-units">Available Units</th>
                <th className="rpt-c-units">Minimum Units</th>
                <th className="rpt-c-date">Last Updated</th>
                <th className="rpt-c-actions sticky" style={{ background: 'var(--color-tint-2)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCorporateStock.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted" style={{ padding: 40 }}>
                    {loading ? 'Loading...' : 'No corporate stock records found'}
                  </td>
                </tr>
              )}
              {filteredCorporateStock.map((item) => {
                const product = products.find(p => p.id === item.product_id && p.type === item.stock_type);
                return (
                  <tr key={item.id}>
                    <td className="rpt-wrap font-medium">{item.product_name || product?.product_name || `Product ${item.product_id}`}</td>
                    <td className="rpt-nowrap">
                      <span className={`sbadge ${item.stock_type === 'Billable' ? 'active' : 'inactive'}`}>
                        <span className={`status-dot ${item.stock_type === 'Billable' ? 'green' : 'orange'}`} />
                        {item.stock_type}
                      </span>
                    </td>
                    <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                       <span className={`font-semibold ${item.available_units <= (item.minimum_units || 10) && item.available_units !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {item.available_units}
                      </span>
                    </td>
                    <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                      <span className="font-medium">{item.minimum_units || 10}</span>
                    </td>
                    <td className="rpt-nowrap">
                      <span className="rpt-date">{item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-'}</span>
                    </td>
                    <td className="rpt-actions-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setCorporateForm({
                              product_id: item.product_id,
                              product_type: item.stock_type,
                              available_units: item.available_units,
                              minimum_units: item.minimum_units,
                              remarks: ''
                            });
                            setEditingCorporateId(item.id);
                            setShowCorporateModal(true);
                          }}
                          className="rpt-act-icon edit"
                          title="Adjust Corporate Stock"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleViewHistory({ id: item.product_id, type: item.stock_type, name: item.product_name || product?.product_name || `Product ${item.product_id}` })}
                          className="rpt-act-icon"
                          title="View History"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          <History size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Current Stock Tab (Billable / Non-Billable) */}
      {activeTab !== 'history' && activeTab !== 'corporate' && (
        <div className="table-container">
          <table className="rpt-table">
            <thead>
              <tr>
                <th className="rpt-c-service">Product Name</th>
                <th className="rpt-c-service">Type</th>
                <th className="rpt-c-units">Available Units</th>
                <th className="rpt-c-units">Minimum Units</th>
                <th className="rpt-c-date">Last Updated</th>
                <th className="rpt-c-actions sticky" style={{ background: 'var(--color-tint-2)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted" style={{ padding: 40 }}>
                    {loading ? 'Loading...' : `No ${activeTab === 'billable' ? 'billable' : 'non-billable'} stock records found`}
                  </td>
                </tr>
              )}
              {filteredStock.map((item) => {
                const product = products.find(p => p.id === item.consumable_id && p.type === item.product_type);
                const isLowStock = (item.current_stock || 0) < (product?.minimum_stock || 10);
                return (
                  <tr key={item.id}>
                    <td className="rpt-wrap font-medium">{product?.product_name || `Product ${item.consumable_id}`}</td>
                    <td className="rpt-nowrap">
                      <span className={`sbadge ${item.product_type === 'Billable' ? 'active' : 'inactive'}`}>
                        <span className={`status-dot ${item.product_type === 'Billable' ? 'green' : 'orange'}`} />
                        {item.product_type}
                      </span>
                    </td>
                    <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                      <span className={`font-semibold ${isLowStock ? 'text-red-600' : 'text-green-600'}`}>
                        {item.current_stock}
                      </span>
                    </td>
                    <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                      <span className="font-medium">{product?.minimum_stock || 10}</span>
                    </td>
                    <td className="rpt-nowrap">
                      <span className="rpt-date">{item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-'}</span>
                    </td>
                    <td className="rpt-actions-cell">
                      <div className="flex items-center justify-center gap-1.5">
                        {misMode && (
                          <button
                            onClick={() => {
                              setAdjustForm({
                                product_id: item.consumable_id,
                                product_type: item.product_type,
                                current_stock: item.current_stock,
                                add_units: '',
                                reduce_units: '',
                                remarks: ''
                              });
                              setShowAdjustModal(true);
                            }}
                            className="rpt-act-icon edit"
                            title="Adjust Stock"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleViewHistory({ id: item.consumable_id, type: item.product_type, name: product?.product_name || `Product ${item.consumable_id}` })}
                          className="rpt-act-icon"
                          title="View History"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          <History size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* History Tab — split into Stock Transfers / Consumed Usage sub-tabs */}
      {activeTab === 'history' && (
        <>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => setHistorySubTab('transfers')}
              style={{
                flex: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                border: historySubTab === 'transfers' ? '2px solid var(--color-primary)' : '1px solid var(--color-line)',
                background: historySubTab === 'transfers' ? 'var(--color-tint)' : 'var(--color-surface)',
                color: historySubTab === 'transfers' ? 'var(--color-primary)' : 'var(--color-muted)',
                cursor: 'pointer',
              }}
            >
              <ArrowLeftRight size={16} />
              Stock Transfers
              <span style={{ marginLeft: 2, fontSize: 12, fontWeight: 700, background: historySubTab === 'transfers' ? 'var(--color-primary)' : 'var(--color-line)', color: historySubTab === 'transfers' ? '#fff' : 'var(--color-muted)', borderRadius: 999, padding: '2px 9px' }}>
                {transferHistory.length} records
              </span>
            </button>
            <button
              onClick={() => setHistorySubTab('consumed')}
              style={{
                flex: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                border: historySubTab === 'consumed' ? '2px solid var(--color-primary)' : '1px solid var(--color-line)',
                background: historySubTab === 'consumed' ? 'var(--color-tint)' : 'var(--color-surface)',
                color: historySubTab === 'consumed' ? 'var(--color-primary)' : 'var(--color-muted)',
                cursor: 'pointer',
              }}
            >
              <TrendingDown size={16} />
              Consumed / Usage History
              <span style={{ marginLeft: 2, fontSize: 12, fontWeight: 700, background: historySubTab === 'consumed' ? 'var(--color-primary)' : 'var(--color-line)', color: historySubTab === 'consumed' ? '#fff' : 'var(--color-muted)', borderRadius: 999, padding: '2px 9px' }}>
                {consumedHistory.length} records
              </span>
            </button>
          </div>

          {/* Sub-tab active-count badge in the filter bar (dynamic) */}
          <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
            {historySubTab === 'transfers' ? 'Transfers: ' : 'Consumed: '}
            <strong style={{ color: 'var(--color-ink)' }}>{historySubTab === 'transfers' ? transferHistory.length : consumedHistory.length} records</strong>
            {historyProductFilter && (
              <>
                {' '}— Showing: <strong style={{ color: 'var(--color-primary)' }}>{historyProductFilter.name || `Product #${historyProductFilter.id}`}</strong>
              </>
            )}
          </div>

          <div className="table-container">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th className="rpt-c-date">Date</th>
                  <th className="rpt-c-service">Product</th>
                  <th className="rpt-c-units">{historySubTab === 'consumed' ? 'Qty Consumed' : 'Qty'}</th>
                  <th className="rpt-c-units">{historySubTab === 'consumed' ? 'Branch' : 'From Location'}</th>
                  <th className="rpt-c-units">{historySubTab === 'consumed' ? 'Reference / Status' : 'To Location'}</th>
                  {historySubTab === 'transfers' && <th className="rpt-c-service">Status</th>}
                  {historySubTab === 'transfers' && !misMode && <th className="rpt-c-actions">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={historySubTab === 'transfers' ? (!misMode ? 7 : 6) : 5} className="text-center text-muted" style={{ padding: 40 }}>
                      {loading ? 'Loading...' : historySubTab === 'transfers' ? 'No stock transfers found' : 'No consumed usage records found'}
                    </td>
                  </tr>
                )}
                {filteredHistory.map((item) => {
                  const t = (item.transaction_type || '').toLowerCase();
                  const statusColor = item.status === 'Received' ? 'text-green-600' : item.status === 'Pending' ? 'text-amber-600' : 'text-gray-600';
                  const canReceive = !misMode && branchId && String(item.to_branch_id) === String(branchId) && item.status === 'Pending';

                  if (historySubTab === 'transfers') {
                    return (
                      <tr key={item.id}>
                        <td className="rpt-nowrap">
                          <span className="rpt-date">
                            {item.transferred_at ? new Date(item.transferred_at).toLocaleString('en-GB') : '-'}
                          </span>
                        </td>
                        <td className="rpt-wrap font-medium">{item.product_name || `Product ${item.product_id || ''}`}</td>
                        <td className="rpt-nowrap" style={{ textAlign: 'center' }}><span className="font-semibold">{item.quantity}</span></td>
                        <td className="rpt-nowrap">
                          {item.fromLabel || (item.transaction_type === 'Inward' ? 'Stock Added' : item.transaction_type === 'Adjustment' ? 'Manual Correction' : branchNameById(item.from_branch_id))}
                        </td>
                        <td className="rpt-nowrap">
                          {item.toLabel || (item.transaction_type === 'Outward' ? 'Consumed' : branchNameById(item.to_branch_id))}
                        </td>
                        <td className="rpt-nowrap">
                          <span className={`font-medium ${statusColor}`}>{item.status || '-'}</span>
                        </td>
                        {!misMode && (
                          <td className="rpt-actions-cell">
                            {canReceive ? (
                              <button onClick={() => handleReceive(item)} disabled={loading} className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}>
                                Receive
                              </button>
                            ) : (
                              <span className="text-xs text-muted" style={{ opacity: 0.5 }}>-</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  }

                  // Consumed / Usage tab
                  return (
                    <tr key={item.id}>
                      <td className="rpt-nowrap">
                        <span className="rpt-date">
                          {item.transferred_at ? new Date(item.transferred_at).toLocaleString('en-GB') : '-'}
                        </span>
                      </td>
                      <td className="rpt-wrap font-medium">{item.product_name || `Product ${item.product_id || ''}`}</td>
                      <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                        <span className="font-semibold text-red-600">-{Math.abs(Number(item.quantity) || 0)}</span>
                      </td>
                      <td className="rpt-nowrap">
                        {item.toLabel === 'Consumed' ? (item.fromLabel || branchNameById(item.branch_id)) : branchNameById(item.branch_id)}
                      </td>
                      <td className="rpt-nowrap">
                        <span className={`font-medium ${statusColor}`}>
                          {item.toLabel === 'Consumed' ? 'Consumed' : (item.status || 'Completed')}
                        </span>
                        {item.remarks && (
                          <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                            {item.remarks}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Adjust Stock Modal - MIS Only */}
      {misMode && showAdjustModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Adjust Stock</h3>
              <button onClick={() => setShowAdjustModal(false)} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product Type</label>
                <div className="form-input bg-gray-100 cursor-not-allowed opacity-50">
                  {adjustForm.product_type}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product</label>
                <SearchableDropdown
                  value={adjustForm.product_id}
                  onChange={(val) => {
                    const currentStock = stock.find(s => s.consumable_id === Number(val) && s.product_type === adjustForm.product_type);
                    setAdjustForm({
                      ...adjustForm,
                      product_id: val,
                      current_stock: currentStock?.current_stock || 0,
                      add_units: '',
                      reduce_units: ''
                    });
                  }}
                  options={products.filter(p => p.type === adjustForm.product_type).map(p => ({ value: String(p.id), label: p.product_name }))}
                  placeholder="Select product"
                  displayKey="label"
                  valueKey="value"
                />
              </div>

              {adjustForm.product_id && (
                <>
                  <div className="p-3 rounded-lg" style={{ background: 'var(--color-tint-2)', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                      Current Units
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {adjustForm.current_stock}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted block">Add Units</label>
                      <input
                        type="number"
                        className="form-input"
                        value={adjustForm.add_units}
                        onChange={(e) => setAdjustForm({ ...adjustForm, add_units: e.target.value, reduce_units: '' })}
                        placeholder="Enter units to add"
                        min="0"
                        style={{ borderColor: adjustForm.add_units ? '#059669' : undefined }}
                      />
                      {adjustForm.add_units && Number(adjustForm.add_units) > 0 && (
                        <div style={{ fontSize: 11, color: '#059669', marginTop: 4 }}>
                          New total: {adjustForm.current_stock + Number(adjustForm.add_units)}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted block">Reduce Units</label>
                      <input
                        type="number"
                        className="form-input"
                        value={adjustForm.reduce_units}
                        onChange={(e) => setAdjustForm({ ...adjustForm, reduce_units: e.target.value, add_units: '' })}
                        placeholder="Enter units to reduce"
                        min="0"
                        max={adjustForm.current_stock}
                        style={{ borderColor: adjustForm.reduce_units ? '#DC2626' : undefined }}
                      />
                      {adjustForm.reduce_units && Number(adjustForm.reduce_units) > 0 && (
                        <div style={{ fontSize: 11, color: adjustForm.reduce_units > adjustForm.current_stock ? '#DC2626' : '#6366f1', marginTop: 4 }}>
                          New total: {Math.max(0, adjustForm.current_stock - Number(adjustForm.reduce_units))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Remarks</label>
                    <textarea
                      className="form-input"
                      value={adjustForm.remarks}
                      onChange={(e) => setAdjustForm({ ...adjustForm, remarks: e.target.value })}
                      placeholder="Reason for adjustment"
                      rows="3"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 mt-2">
                <button onClick={() => setShowAdjustModal(false)} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={handleAdjustStock}
                  disabled={loading || !adjustForm.product_id || ((!adjustForm.add_units || Number(adjustForm.add_units) <= 0) && (!adjustForm.reduce_units || Number(adjustForm.reduce_units) <= 0))}
                  className="btn btn-primary"
                >
                  {loading ? 'Adjusting...' : 'Adjust Stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Corporate Add Product Modal (create/update corporate_stock row) */}
      {showCorporateModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{editingCorporateId ? 'Edit Corporate Stock' : 'Add Product to Corporate Stock'}</h3>
              <button onClick={() => { setShowCorporateModal(false); setEditingCorporateId(null); }} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Stock Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCorporateForm({ ...corporateForm, product_type: 'Billable', product_id: '' })}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${corporateForm.product_type === 'Billable' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'}`}
                  >
                    Billable
                  </button>
                  <button
                    onClick={() => setCorporateForm({ ...corporateForm, product_type: 'Non-Billable', product_id: '' })}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${corporateForm.product_type === 'Non-Billable' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'}`}
                  >
                    Non-Billable
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product <span style={{ color: '#EF4444' }}>*</span></label>
                <SearchableDropdown
                  value={corporateForm.product_id}
                  onChange={(val) => { const product = products.find(p => String(p.id) === val); setCorporateForm({ ...corporateForm, product_id: val, product_name: product?.product_name || '' }); }}
                  options={products.filter(p => p.type === corporateForm.product_type).map(p => ({ value: String(p.id), label: p.product_name }))}
                  placeholder="Select product"
                  displayKey="label"
                  valueKey="value"
                />
              </div>
              {corporateForm.product_id && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Available Units <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="number" className="form-input" value={corporateForm.available_units} onChange={(e) => setCorporateForm({ ...corporateForm, available_units: e.target.value })} placeholder="Enter units" min="0" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Minimum Units</label>
                    <input type="number" className="form-input" value={corporateForm.minimum_units} onChange={(e) => setCorporateForm({ ...corporateForm, minimum_units: e.target.value })} placeholder="Minimum stock level" min="0" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Remarks</label>
                    <textarea className="form-input" value={corporateForm.remarks} onChange={(e) => setCorporateForm({ ...corporateForm, remarks: e.target.value })} placeholder="Reason for adjustment" rows="3" />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: '1px solid var(--color-line)' }}>
                <button onClick={() => { setShowCorporateModal(false); setEditingCorporateId(null); }} className="btn btn-secondary">Cancel</button>
                <button onClick={handleSaveCorporateStock} disabled={loading} className="btn btn-primary">{loading ? 'Saving...' : editingCorporateId ? 'Update Stock' : 'Add Stock'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Corporate Add Stock Modal (inward increment) */}
      {showCorpAddStockModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Add Stock to Corporate Warehouse</h3>
              <button onClick={() => { setShowCorpAddStockModal(false); setCorpAddStockForm({ product_id: '', quantity: '', remarks: '' }); }} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product <span style={{ color: '#EF4444' }}>*</span></label>
                <SearchableDropdown
                  value={corpAddStockForm.product_id}
                  onChange={(val) => setCorpAddStockForm({ ...corpAddStockForm, product_id: val })}
                  options={corporateStock.map(x => ({ value: String(x.id), label: `${x.product_name || 'Product ' + x.product_id} [${x.stock_type}] • Avail: ${x.available_units}` }))}
                  placeholder="Select corporate product"
                  displayKey="label"
                  valueKey="value"
                />
              </div>
              {corpAddStockForm.product_id && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Quantity to Add <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="number" className="form-input" value={corpAddStockForm.quantity} onChange={(e) => setCorpAddStockForm({ ...corpAddStockForm, quantity: e.target.value })} placeholder="Enter units to add" min="1" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Remarks</label>
                    <textarea className="form-input" value={corpAddStockForm.remarks} onChange={(e) => setCorpAddStockForm({ ...corpAddStockForm, remarks: e.target.value })} placeholder="Reason for stock addition" rows="3" />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: '1px solid var(--color-line)' }}>
                <button onClick={() => { setShowCorpAddStockModal(false); setCorpAddStockForm({ product_id: '', quantity: '', remarks: '' }); }} className="btn btn-secondary">Cancel</button>
                <button onClick={handleCorpAddStock} disabled={loading || !corpAddStockForm.product_id || !corpAddStockForm.quantity} className="btn btn-primary" style={{ backgroundColor: '#059669' }}>{loading ? 'Adding...' : 'Add Stock'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branch Add Product Modal (inward stock) */}
      {showAddInwardModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Add Product - {currentTabType}</h3>
              <button onClick={() => { setShowAddInwardModal(false); setAddInwardForm({ product_id: '', quantity: '', remarks: '' }); }} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product <span style={{ color: '#EF4444' }}>*</span></label>
                <SearchableDropdown
                  value={addInwardForm.product_id}
                  onChange={(val) => setAddInwardForm({ ...addInwardForm, product_id: val })}
                  options={products.filter(p => p.type === currentTabType).map(p => ({ value: String(p.id), label: p.product_name }))}
                  placeholder="Select product"
                  displayKey="label"
                  valueKey="value"
                />
              </div>
              {addInwardForm.product_id && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Quantity <span style={{ color: '#EF4444' }}>*</span></label>
                    <input type="number" className="form-input" value={addInwardForm.quantity} onChange={(e) => setAddInwardForm({ ...addInwardForm, quantity: e.target.value })} placeholder="Enter quantity to add" min="1" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted block">Remarks</label>
                    <textarea className="form-input" value={addInwardForm.remarks} onChange={(e) => setAddInwardForm({ ...addInwardForm, remarks: e.target.value })} placeholder="Reason for stock addition" rows="3" />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: '1px solid var(--color-line)' }}>
                <button onClick={() => { setShowAddInwardModal(false); setAddInwardForm({ product_id: '', quantity: '', remarks: '' }); }} className="btn btn-secondary">Cancel</button>
                <button onClick={handleAddInwardStock} disabled={loading || !addInwardForm.product_id || !addInwardForm.quantity} className="btn btn-primary">{loading ? 'Adding...' : 'Add Stock'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Transfer Modal */}
      {showTransferModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '640px', width: '95%' }}>
            <div className="modal-header">
              <h3>Transfer Stock</h3>
              <button onClick={() => setShowTransferModal(false)} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              {/* Transfer Type */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Transfer Type</label>
                <div className="flex gap-2">
                  {misMode ? (
                    <>
                      <button
                        onClick={() => handleTransferTypeChange('Corporate→Branch')}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${transferForm.transfer_type === 'Corporate→Branch' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'}`}
                      >
                        Corporate → Branch
                      </button>
                      <button
                        onClick={() => handleTransferTypeChange('Branch→Branch')}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${transferForm.transfer_type === 'Branch→Branch' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'}`}
                      >
                        Branch → Branch
                      </button>
                      <button
                        onClick={() => handleTransferTypeChange('Branch→Corporate')}
                        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${transferForm.transfer_type === 'Branch→Corporate' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'}`}
                      >
                        Branch → Corporate
                      </button>
                    </>
                  ) : (
                    <button
                      disabled
                      className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-[var(--color-tint-2)] text-muted cursor-not-allowed opacity-60"
                    >
                      {transferForm.transfer_type}
                    </button>
                  )}
                </div>
              </div>

              {/* Source / Destination */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted block">From Location <span style={{ color: '#EF4444' }}>*</span></label>
                  <SearchableDropdown
                    value={transferForm.from_branch_id}
                    onChange={(val) => {
                      setTransferForm({ ...transferForm, from_branch_id: val });
                      setTransferRows(initTransferRows(transferForm.product_type, val));
                    }}
                    options={getAvailableLocations(transferForm.transfer_type, branchId).map(l => ({ value: l.id, label: l.name }))}
                    placeholder="Select source"
                    displayKey="label"
                    valueKey="value"
                    disabled={!misMode && !!branchId}
                  />
                  {!misMode && !!branchId && (
                    <div className="text-xs text-muted" style={{ marginTop: 4 }}>Source is locked to your branch</div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted block">To Location <span style={{ color: '#EF4444' }}>*</span></label>
                  <SearchableDropdown
                    value={transferForm.to_branch_id}
                    onChange={(val) => setTransferForm({ ...transferForm, to_branch_id: val })}
                    options={getAvailableLocations(transferForm.transfer_type, branchId)
                      .filter(l => l.id !== transferForm.from_branch_id)
                      .map(l => ({ value: l.id, label: l.name }))}
                    placeholder="Select destination"
                    displayKey="label"
                    valueKey="value"
                  />
                </div>
              </div>

              {/* Product Type toggle */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setTransferForm({ ...transferForm, product_type: 'Billable' }); setTransferRows(initTransferRows('Billable', transferForm.from_branch_id)); }}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${transferForm.product_type === 'Billable' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'}`}
                  >
                    Billable
                  </button>
                  <button
                    onClick={() => { setTransferForm({ ...transferForm, product_type: 'Non-Billable' }); setTransferRows(initTransferRows('Non-Billable', transferForm.from_branch_id)); }}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${transferForm.product_type === 'Non-Billable' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'}`}
                  >
                    Non-Billable
                  </button>
                </div>
              </div>

              {/* Product list with checkboxes */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Products</label>
                <div className="search-box">
                  <Search size={15} />
                  <input
                    placeholder="Search products..."
                    value={transferSearch}
                    onChange={(e) => setTransferSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1" style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--color-line)', borderRadius: 8, padding: 4, background: 'var(--color-surface)' }}>
                {transferRows.filter(r => {
                  const s = (transferSearch || '').toLowerCase().trim();
                  if (!s) return true;
                  const name = (r.product_name || `Product ${r.product_id}`).toLowerCase();
                  return name.includes(s);
                }).map((r, idx) => {
                  const isOut = r.available === 0;
                  const qtyExceeds = r.selected && Number(r.qty) > r.available;
                  return (
                    <div key={r.id || r.product_id} className="flex items-center gap-3 p-2 rounded" style={{ background: r.selected ? 'var(--color-tint)' : 'transparent', minHeight: 48 }}>
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => toggleTransferRow(r.product_id || r.id)}
                        disabled={loading || isOut}
                        style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div className="flex-1" style={{ minWidth: 0 }}>
                        <div className="font-medium text-sm" style={{ lineHeight: 1.4 }}>{r.product_name || `Product ${r.product_id}`}</div>
                        <div className="text-xs text-muted">Available: {r.available} units</div>
                      </div>
                      {r.selected && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <input
                            type="number"
                            min="0"
                            max={r.available}
                            value={r.qty}
                            onChange={(e) => updateTransferRow(idx, { qty: e.target.value })}
                            className="form-input"
                            style={{ width: 90, padding: '6px 10px', fontSize: 13 }}
                            disabled={loading || isOut}
                            placeholder="Qty"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {qtyExceeds && (
                            <span className="text-red-600 text-xs" style={{ whiteSpace: 'nowrap' }}>Available stock is only {r.available} units.</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {transferRows.length === 0 && (
                  <div className="text-center text-muted" style={{ padding: 24 }}>
                    No {transferForm.product_type.toLowerCase()} products available
                  </div>
                )}
              </div>

              {/* Summary of selected items */}
              {transferRows.some(r => r.selected) && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--color-tint-2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
                    Selected Items
                  </div>
                  <table className="rpt-table" style={{ fontSize: 12.5, marginBottom: 8 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Product</th>
                        <th style={{ textAlign: 'center', padding: '4px 8px' }}>Available</th>
                        <th style={{ textAlign: 'center', padding: '4px 8px' }}>Transfer Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transferRows.filter(r => r.selected).map((r) => {
                        const exceeds = Number(r.qty) > r.available;
                        return (
                          <tr key={r.id || r.product_id}>
                            <td className="rpt-wrap" style={{ padding: '4px 8px' }}>{r.product_name || `Product ${r.product_id}`}</td>
                            <td style={{ textAlign: 'center', padding: '4px 8px' }}>{r.available}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <input
                                type="number"
                                min="0"
                                max={r.available}
                                value={r.qty}
                                onChange={(e) => updateTransferRow(transferRows.findIndex(rr => (rr.id || rr.product_id) === (r.id || r.product_id)), { qty: e.target.value })}
                                className="form-input"
                                style={{ width: 80, padding: '2px 6px', fontSize: 12, textAlign: 'center' }}
                              />
                              {exceeds && <div className="text-red-600" style={{ fontSize: 10, marginTop: 2 }}>Available stock is only {r.available} units.</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Remarks</label>
                <textarea
                  className="form-input"
                  value={transferForm.remarks}
                  onChange={(e) => setTransferForm({ ...transferForm, remarks: e.target.value })}
                  placeholder="Reason for transfer (optional)"
                  rows="3"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: '1px solid var(--color-line)', marginTop: 8 }}>
                <button onClick={() => setShowTransferModal(false)} className="btn btn-secondary" style={{ minWidth: 100 }}>Cancel</button>
                <button
                  onClick={handleTransferAll}
                  disabled={
                    loading ||
                    !transferForm.from_branch_id ||
                    !transferForm.to_branch_id ||
                    transferForm.from_branch_id === transferForm.to_branch_id ||
                    transferRows.filter(r => r.selected && Number(r.qty) > 0).length === 0 ||
                    transferRows.some(r => r.selected && Number(r.qty) > 0 && Number(r.qty) > r.available)
                  }
                  className="btn btn-primary"
                  style={{ backgroundColor: '#059669', minWidth: 140 }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><span className="animate-pulse">Transferring...</span></span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}><Send size={16} /> Transfer</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagement;