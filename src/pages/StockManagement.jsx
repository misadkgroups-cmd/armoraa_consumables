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

  // Transaction History now lists stock_transfers.
  // MIS Admin -> ALL transfers. Branch user -> only to_branch / from_branch = me.
  const fetchHistory = useCallback(async () => {
    if (!misMode && !branchId) return;
    setLoading(true);
    try {
      const data = await stockApi.getTransfers(branchId, misMode, 500);
      setHistory(data || []);
      setErrorMsg('');
    } catch (e) {
      console.error('Error fetching transfer history:', e);
      setErrorMsg('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  }, [misMode, branchId]);

  // Branch user confirms receipt -> stock moves into the destination branch
  const handleReceive = async (transfer) => {
    if (!window.confirm(`Confirm receipt of ${transfer.quantity} ${transfer.product_name || 'units'}?`)) return;
    setLoading(true);
    try {
      const result = await stockApi.receiveTransfer(transfer.id, CURRENT_USER);
      if (result.success) {
        setSuccessMsg('Transfer received. Branch stock updated.');
        fetchHistory();
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
    fetchHistory();
    setActiveTab('history');
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
    console.log('initTransferRows called:', { productType, sourceBranchId, stockLength: stock.length, corporateStockLength: corporateStock.length });
    
    if (sourceBranchId === 'corporate') {
      const rows = corporateStock
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
      console.log('Corporate rows:', rows.length);
      return rows;
    }
    
    // Branch-to-Branch or Branch-to-Corporate: use current branch stock as source
    const filteredStock = stock.filter(x => x.product_type === productType);
    console.log('Branch stock filtered:', filteredStock.length, 'products:', filteredStock.map(x => x.consumable_id));
    
    const rows = filteredStock.map(x => {
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
    
    console.log('Branch rows:', rows.length, 'products:', rows.map(r => r.product_name));
    return rows;
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
    
    console.log('Transfer modal opened:', { 
      transferType, 
      fromBranchId, 
      branchId,
      productCount: rows.length, 
      selectedCount: rows.filter(r => r.selected).length,
      products: rows.filter(r => r.selected).map(r => r.product_name)
    });
  };

  const getAvailableLocations = (transferType, currentBranchId) => {
    console.log('getAvailableLocations called:', { transferType, currentBranchId, branchesCount: branches.length, branchIds: branches.map(b => b.id) });
    
    // Ensure branches are loaded before filtering
    if (!branches || branches.length === 0) {
      console.log('No branches loaded, returning default');
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
        console.log('Branch→Branch locations:', { currentBranch, otherBranchesCount: otherBranches.length });
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
      console.log('Transfer rows synced:', {
        transfer_type: transferForm.transfer_type,
        from_branch_id: transferForm.from_branch_id,
        product_type: transferForm.product_type,
        count: rows.length,
        selected: rows.filter(r => r.selected).length
      });
    }
  }, [showTransferModal, transferForm.from_branch_id, transferForm.product_type]);

  const handleTransferTypeChange = (newType) => {
    console.log('handleTransferTypeChange called:', { newType, currentBranchId: branchId });
    
    let fromId = 'corporate';
    let toId = '';
    
    // Set correct from_branch_id based on transfer type
    if (newType === 'Corporate→Branch') {
      fromId = 'corporate';
    } else if ((newType === 'Branch→Corporate' || newType === 'Branch→Branch') && branchId) {
      fromId = String(branchId);
    }
    
    console.log('Setting from_branch_id to:', fromId, 'branchId:', branchId);
    
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
    
    console.log('Transfer type changed:', {
      newType,
      fromId,
      toId,
      productType: transferForm.product_type,
      productsLoaded: newRows.length
    });
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
    console.log('Toggling product:', idStr, 'Current rows:', transferRows.map(r => ({ id: r.id, product_id: r.product_id, name: r.product_name })));
    
    setTransferRows(prev => {
      const newRows = prev.map(r => 
        (String(r.product_id) === idStr || String(r.id) === idStr) 
          ? { ...r, selected: !r.selected, qty: '' }
          : r
      );
      console.log('After toggle:', newRows.filter(r => r.selected).map(r => r.product_name));
      return newRows;
    });
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

  const getQuantityColor = (quantity) => {
    if (quantity > 0) return 'text-green-600';
    if (quantity < 0) return 'text-red-600';
    return 'text-gray-600';
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

  const filteredHistory = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    if (!s) return history;
    return history.filter(item => {
      const productName = (item.product_name || '').toLowerCase();
      const type = (item.stock_type || '').toLowerCase();
      const fromBranch = branchNameById(item.from_branch_id).toLowerCase();
      const toBranch = branchNameById(item.to_branch_id).toLowerCase();
      const status = (item.status || '').toLowerCase();
      return productName.includes(s) || type.includes(s) || fromBranch.includes(s) || toBranch.includes(s) || status.includes(s);
    });
  }, [history, search, branches]);

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
      const rows = filteredHistory.map(item => ({
        'Date': item.transferred_at ? new Date(item.transferred_at).toLocaleString('en-GB') : '-',
        'Product': item.product_name || `Product ${item.product_id || ''}`,
        'Qty': item.quantity,
        'From': branchNameById(item.from_branch_id),
        'To': branchNameById(item.to_branch_id),
        'Status': item.status || '-',
      }));
      return { title: 'Transaction History Report', headers: ['Date', 'Product', 'Qty', 'From', 'To', 'Status'], rows };
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
          onClick={() => { setActiveTab('history'); setSearch(''); fetchHistory(); }}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'history' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}
        >
          Transaction History
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex items-center gap-4">
          <div className="search-box flex-1">
            <Search size={15} />
            <input
              placeholder={activeTab === 'history' ? 'Search history...' : 'Search products...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
                          onClick={() => handleViewHistory({ id: item.product_id, type: item.stock_type })}
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
                          onClick={() => handleViewHistory({ id: item.consumable_id, type: item.product_type })}
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

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="table-container">
          <table className="rpt-table">
            <thead>
              <tr>
                <th className="rpt-c-date">Date</th>
                <th className="rpt-c-service">Product</th>
                <th className="rpt-c-units">Qty</th>
                <th className="rpt-c-units">From</th>
                <th className="rpt-c-units">To</th>
                <th className="rpt-c-service">Status</th>
                {!misMode && <th className="rpt-c-actions">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={!misMode ? 7 : 6} className="text-center text-muted" style={{ padding: 40 }}>
                    {loading ? 'Loading...' : 'No transaction history found'}
                  </td>
                </tr>
              )}
              {filteredHistory.map((item) => {
                const statusColor = item.status === 'Received' ? 'text-green-600' : item.status === 'Pending' ? 'text-amber-600' : 'text-gray-600';
                const canReceive = !misMode && branchId && String(item.to_branch_id) === String(branchId) && item.status === 'Pending';
                return (
                  <tr key={item.id}>
                    <td className="rpt-nowrap">
                      <span className="rpt-date">
                        {item.transferred_at ? new Date(item.transferred_at).toLocaleString('en-GB') : '-'}
                      </span>
                    </td>
                    <td className="rpt-wrap font-medium">{item.product_name || `Product ${item.product_id || ''}`}</td>
                    <td className="rpt-nowrap" style={{ textAlign: 'center' }}><span className="font-semibold">{item.quantity}</span></td>
                    <td className="rpt-nowrap">{branchNameById(item.from_branch_id)}</td>
                    <td className="rpt-nowrap">{branchNameById(item.to_branch_id)}</td>
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
              })}
            </tbody>
          </table>
        </div>
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