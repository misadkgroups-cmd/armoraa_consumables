import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import {
  Search,
  Send,
  ArrowLeftRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Trash2,
  Filter,
  RefreshCw,
} from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';
import TransactionDetailsModal from '../components/TransactionDetailsModal';
import * as stockApi from '../services/stockApi';
import { formatDateTimeDisplay } from '../utils/dateUtils';
import { fmtQty1, fmtQty2, round2 } from '../utils/numUtils';
import { fmtMoney } from '../utils/currency';
import { generateTransactionId, parseTxnDetails } from '../utils/stockUtils';

const CURRENT_USER = 'Admin';

const StockTransfer = () => {
  const { branchId, misMode } = useBranch();

  // Active Model Tab: 'new-transfer' | 'transactions' | 'history'
  const [activeModel, setActiveModel] = useState('transactions');

  // Data states
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filter states (empty by default; saved in sessionStorage during active session)
  const [search, setSearch] = useState(() => sessionStorage.getItem('transfer_search') || '');
  const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem('transfer_status') || 'All');
  const [branchFilter, setBranchFilter] = useState(() => sessionStorage.getItem('transfer_branch') || '');
  const [dateFrom, setDateFrom] = useState(() => sessionStorage.getItem('transfer_dateFrom') || '');
  const [dateTo, setDateTo] = useState(() => sessionStorage.getItem('transfer_dateTo') || '');

  useEffect(() => {
    sessionStorage.setItem('transfer_search', search);
  }, [search]);
  useEffect(() => {
    sessionStorage.setItem('transfer_status', statusFilter);
  }, [statusFilter]);
  useEffect(() => {
    sessionStorage.setItem('transfer_branch', branchFilter);
  }, [branchFilter]);
  useEffect(() => {
    sessionStorage.setItem('transfer_dateFrom', dateFrom);
  }, [dateFrom]);
  useEffect(() => {
    sessionStorage.setItem('transfer_dateTo', dateTo);
  }, [dateTo]);

  // Transaction details modal state (Popup when Transaction row/ID is clicked)
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [showTxnModal, setShowTxnModal] = useState(false);

  // New Transfer Model Form state
  const [currentTxnId, setCurrentTxnId] = useState('');
  const [transferFilterType, setTransferFilterType] = useState('All');
  const [transferForm, setTransferForm] = useState({
    from_branch_id: 'corporate',
    to_branch_id: '',
    remarks: '',
  });
  const [transferRows, setTransferRows] = useState([]);
  const [transferSearch, setTransferSearch] = useState('');
  const [sourceStockData, setSourceStockData] = useState([]);
  const [loadingSourceStock, setLoadingSourceStock] = useState(false);

  // Auto-clear toasts
  useEffect(() => {
    if (successMsg) {
      const t = setTimeout(() => setSuccessMsg(''), 3500);
      return () => clearTimeout(t);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const t = setTimeout(() => setErrorMsg(''), 4500);
      return () => clearTimeout(t);
    }
  }, [errorMsg]);

  // Fetch branches
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

  // Fetch products catalog with unit costs
  const fetchProducts = useCallback(async () => {
    try {
      const [billable, nonBillable] = await Promise.all([
        supabase.from('master_billable_consumables').select('id, product_name, unit, minimum_stock, cost_unit').order('product_name'),
        supabase.from('master_non_billable_consumables').select('id, product_name, minimum_stock, cost, status').order('product_name'),
      ]);

      const billableProducts = (billable.data || []).map(p => ({
        ...p,
        type: 'Billable',
        price: Number(p.cost_unit || 0),
      }));

      const nonBillableProducts = (nonBillable.data || [])
        .filter(p => !p.status || p.status === 'Active')
        .map(p => ({
          ...p,
          type: 'Non-Billable',
          price: Number(p.cost || 0),
        }));

      setProducts([...billableProducts, ...nonBillableProducts]);
    } catch (e) {
      console.error('Error fetching products:', e);
    }
  }, []);

  // Fetch transfer records
  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const dFrom = dateFrom ? new Date(dateFrom).toISOString() : null;
      const dTo = dateTo ? new Date(dateTo + 'T23:59:59').toISOString() : null;
      const activeBranchFilter = misMode ? (branchFilter || null) : null;

      const data = await stockApi.getTransfers(
        branchId,
        misMode,
        1000,
        null,
        null,
        activeBranchFilter,
        dFrom,
        dTo
      );

      setTransfers(data || []);
      setErrorMsg('');
    } catch (e) {
      console.error('Error fetching transfers:', e);
      setErrorMsg('Failed to load stock transfers');
    } finally {
      setLoading(false);
    }
  }, [branchId, misMode, branchFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchBranches();
    fetchProducts();
  }, [fetchBranches, fetchProducts]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Lookup branch name
  const branchNameById = useCallback((id) => {
    if (id === null || id === undefined || id === '' || Number(id) === 0 || id === 'corporate') {
      return 'Corporate Warehouse';
    }
    const b = branches.find(x => String(x.id) === String(id));
    return b ? b.branch_name : `Branch ${id}`;
  }, [branches]);

  // Load source stock when initiating a transfer
  const loadSourceStock = useCallback(async (sourceId) => {
    if (!sourceId) {
      setSourceStockData([]);
      return;
    }
    setLoadingSourceStock(true);
    try {
      if (sourceId === 'corporate') {
        const { data } = await supabase.from('corporate_stock').select('*').order('product_name');
        if (data) {
          setSourceStockData(data.map(c => ({
            product_id: c.product_id,
            product_name: c.product_name,
            stock_type: c.stock_type,
            available: Number(c.available_units) || 0,
          })));
        }
      } else {
        const data = await stockApi.getBranchStock(sourceId);
        setSourceStockData((data || []).map(b => ({
          product_id: b.consumable_id,
          product_name: b.product_name,
          stock_type: b.product_type,
          available: Number(b.current_stock || b.available_stock) || 0,
        })));
      }
    } catch (e) {
      console.error('Error loading source stock:', e);
      setSourceStockData([]);
    } finally {
      setLoadingSourceStock(false);
    }
  }, []);

  // Reset all selected items in New Transfer
  const resetTransferSelection = useCallback(() => {
    setTransferRows(prev => (prev || []).map(r => ({
      ...r,
      selected: false,
      qty: '',
    })));
  }, []);

  // Initialize/Reset New Transfer Form
  const initNewTransfer = useCallback(() => {
    const txnId = generateTransactionId();
    setCurrentTxnId(txnId);

    let fromId = 'corporate';
    if (!misMode && branchId) {
      fromId = String(branchId);
    }

    const otherLoc = (branches || []).find(b => String(b.id) !== String(fromId));
    const toId = otherLoc ? String(otherLoc.id) : '';

    setTransferForm({
      from_branch_id: fromId,
      to_branch_id: toId,
      remarks: '',
    });
    setTransferFilterType('All');
    setTransferSearch('');

    // Clear selections and quantities completely
    setTransferRows(prev => (prev || []).map(r => ({
      ...r,
      selected: false,
      qty: '',
    })));

    loadSourceStock(fromId);
  }, [branches, branchId, misMode, loadSourceStock]);

  // Generate initial transaction ID on mount or when branches load
  useEffect(() => {
    if (!currentTxnId) {
      initNewTransfer();
    }
  }, [currentTxnId, initNewTransfer]);

  const handleFromBranchChange = (newFromId) => {
    let newToId = transferForm.to_branch_id;
    if (String(newToId) === String(newFromId)) {
      const other = (branches || []).find(b => String(b.id) !== String(newFromId));
      newToId = other ? String(other.id) : '';
    }

    setTransferForm(prev => ({
      ...prev,
      from_branch_id: newFromId,
      to_branch_id: newToId,
    }));

    // Clear selections when switching source location
    setTransferRows(prev => (prev || []).map(r => ({
      ...r,
      selected: false,
      qty: '',
    })));

    loadSourceStock(newFromId);
  };

  // Sync rows for New Transfer model
  useEffect(() => {
    setTransferRows(prevRows => {
      const prevMap = {};
      (prevRows || []).forEach(r => {
        if (r.selected || r.qty) {
          prevMap[r.id] = { selected: r.selected, qty: r.qty };
        }
      });

      return (products || []).map(p => {
        const key = `${p.type}-${p.id}`;
        const match = sourceStockData.find(s => Number(s.product_id) === Number(p.id) && s.stock_type === p.type);
        const available = match ? Number(match.available) || 0 : 0;
        const prev = prevMap[key];
        const isSelected = prev?.selected && available > 0;
        let qtyVal = '';
        if (isSelected) {
          const num = Number(prev.qty);
          qtyVal = (num > available ? String(available) : prev.qty) || (available >= 1 ? '1' : String(available));
        }

        return {
          id: key,
          product_id: p.id,
          product_name: p.product_name,
          stock_type: p.type,
          price: Number(p.price || 0),
          unit: p.unit || '',
          available,
          qty: qtyVal,
          selected: isSelected,
        };
      });
    });
  }, [products, sourceStockData]);

  const updateTransferRow = (id, patch) => {
    setTransferRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const toggleTransferRow = (id) => {
    setTransferRows(prev => prev.map(r => {
      if (r.id === id) {
        if (r.available <= 0) return r;
        const nextSel = !r.selected;
        return {
          ...r,
          selected: nextSel,
          qty: nextSel ? (r.qty || (r.available >= 1 ? '1' : String(r.available))) : '',
        };
      }
      return r;
    }));
  };

  // Filtered available products for selection in New Transfer
  const filteredAvailableProducts = useMemo(() => {
    return transferRows.filter(r => {
      if (transferFilterType !== 'All' && r.stock_type !== transferFilterType) {
        return false;
      }
      if (transferSearch) {
        const q = transferSearch.toLowerCase().trim();
        return (r.product_name || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [transferRows, transferFilterType, transferSearch]);

  const selectedTransferItems = useMemo(() => {
    return transferRows.filter(r => r.selected);
  }, [transferRows]);

  const totalTransferQty = useMemo(() => {
    return selectedTransferItems.reduce((acc, r) => acc + (Number(r.qty) || 0), 0);
  }, [selectedTransferItems]);

  const totalTransferValue = useMemo(() => {
    return selectedTransferItems.reduce((acc, r) => acc + ((r.price || 0) * (Number(r.qty) || 0)), 0);
  }, [selectedTransferItems]);

  // Execute Transfer from New Transfer Model
  const handleTransferAll = async () => {
    const { from_branch_id, to_branch_id, remarks } = transferForm;

    if (!from_branch_id || !to_branch_id) {
      setErrorMsg('Please select both source and destination locations');
      return;
    }
    if (String(from_branch_id) === String(to_branch_id)) {
      setErrorMsg('Source and destination cannot be the same');
      return;
    }

    const toTransfer = transferRows.filter(r => r.selected && Number(r.qty) > 0);
    if (toTransfer.length === 0) {
      setErrorMsg('Please select at least one consumable and enter quantity');
      return;
    }

    for (const item of toTransfer) {
      const q = Number(item.qty);
      if (q > item.available) {
        setErrorMsg(`Cannot transfer ${q} units of "${item.product_name}". Only ${item.available} available.`);
        return;
      }
    }

    setLoading(true);
    try {
      const isFromCorp = from_branch_id === 'corporate';
      const isToCorp = to_branch_id === 'corporate';

      const transferType = (isFromCorp && isToCorp)
        ? 'Corporate→Corporate'
        : isFromCorp
        ? 'Corporate→Branch'
        : isToCorp
        ? 'Branch→Corporate'
        : 'Branch→Branch';

      const transfersPayload = toTransfer.map(r => ({
        product_id: r.product_id,
        product_name: r.product_name,
        stock_type: r.stock_type,
        quantity: Number(r.qty),
      }));

      const results = await stockApi.createMultiLocationTransferRequest(
        transfersPayload,
        transferType,
        from_branch_id,
        to_branch_id,
        remarks,
        CURRENT_USER,
        currentTxnId
      );

      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        setErrorMsg(`Some transfers failed: ${failed.map(f => f.message).join(', ')}`);
      } else {
        setSuccessMsg('Transfer created successfully!');

        // 1. Immediately wipe all selected transfer rows & quantities in state
        setTransferRows(prev => (prev || []).map(r => ({
          ...r,
          selected: false,
          qty: '',
        })));

        // 2. Clear remarks and reset to fresh transaction ID
        const freshTxnId = generateTransactionId();
        setCurrentTxnId(freshTxnId);
        setTransferForm(prev => ({
          ...prev,
          remarks: '',
        }));
        setTransferSearch('');
        setTransferFilterType('All');

        // 3. Immediately reload live source stock from Supabase
        await loadSourceStock(from_branch_id);

        // 4. Refresh transfer records list
        await fetchTransfers();

        // 5. Notify the rest of the application
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('stock-transfer-updated'));
          window.dispatchEvent(new Event('stock-updated'));
        }

        // 6. Switch to Transactions model to view the recorded transaction
        setActiveModel('transactions');
      }
    } catch (e) {
      console.error('Error transferring stock:', e);
      setErrorMsg('Error transferring stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Branch user confirms receipt (single or batch)
  const handleReceive = async (itemOrTxn) => {
    const itemsToReceive = (itemOrTxn.items || [itemOrTxn]).filter(it => it.status === 'Pending' && it.id);
    if (itemsToReceive.length === 0) {
      setErrorMsg('No pending items to receive');
      return;
    }

    const confirmMsg = itemsToReceive.length === 1
      ? `Confirm receipt of ${round2(itemsToReceive[0].quantity)} ${itemsToReceive[0].product_name || 'units'}?`
      : `Confirm receipt of ${itemsToReceive.length} items in transaction ${itemOrTxn.txnId}?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      let successCount = 0;
      let lastErrMsg = '';

      for (const it of itemsToReceive) {
        const result = await stockApi.receiveTransfer(it.id, CURRENT_USER);
        if (result.success) {
          successCount++;
        } else {
          lastErrMsg = result.message;
        }
      }

      if (successCount > 0) {
        setSuccessMsg(`Received ${successCount} item(s) successfully!`);
        fetchTransfers();
        if (showTxnModal) {
          setShowTxnModal(false);
        }
      } else {
        setErrorMsg('Failed to receive stock: ' + lastErrMsg);
      }
    } catch (e) {
      setErrorMsg('Error receiving stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Parse transfer items with transaction details
  const parsedTransfers = useMemo(() => {
    return (transfers || []).map(item => {
      const { txnId, user, comment } = parseTxnDetails(item);
      return {
        ...item,
        txnId,
        txnUser: user,
        txnComment: comment,
        fromName: branchNameById(item.from_branch_id),
        toName: branchNameById(item.to_branch_id),
      };
    });
  }, [transfers, branchNameById]);

  // Grouped by Transaction ID for Model 2 (Transactions)
  const groupedTransactions = useMemo(() => {
    const map = new Map();

    parsedTransfers.forEach(item => {
      const key = item.txnId || `TRX-#${item.id}`;
      if (!map.has(key)) {
        map.set(key, {
          txnId: key,
          date: item.transferred_at,
          from_branch_id: item.from_branch_id,
          to_branch_id: item.to_branch_id,
          fromName: item.fromName,
          toName: item.toName,
          user: item.txnUser,
          comment: item.txnComment || '',
          items: [],
        });
      }
      const group = map.get(key);
      group.items.push(item);
      if (!group.comment && item.txnComment) {
        group.comment = item.txnComment;
      }
    });

    return Array.from(map.values()).map(group => {
      const totalQty = group.items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
      const allReceived = group.items.every(it => it.status === 'Received');
      const allPending = group.items.every(it => it.status === 'Pending');
      const status = allReceived ? 'Received' : allPending ? 'Pending' : 'Partial';

      return {
        ...group,
        totalQty,
        status,
        productCount: group.items.length,
      };
    });
  }, [parsedTransfers]);

  // Filtered Grouped Transactions (Model 2)
  const filteredGroupedTransactions = useMemo(() => {
    return groupedTransactions.filter(group => {
      // Status filter
      if (statusFilter !== 'All') {
        if (statusFilter === 'Pending' && group.status !== 'Pending') return false;
        if (statusFilter === 'Received' && group.status !== 'Received') return false;
        if (statusFilter === 'Partial' && group.status !== 'Partial') return false;
      }

      // Search (matches Transaction ID, locations, comment, or any product name inside)
      const q = (search || '').toLowerCase().trim();
      if (q) {
        const matchTxn = (group.txnId || '').toLowerCase().includes(q);
        const matchFrom = (group.fromName || '').toLowerCase().includes(q);
        const matchTo = (group.toName || '').toLowerCase().includes(q);
        const matchComment = (group.comment || '').toLowerCase().includes(q);
        const matchProd = group.items.some(it => (it.product_name || '').toLowerCase().includes(q));
        if (!matchTxn && !matchFrom && !matchTo && !matchComment && !matchProd) {
          return false;
        }
      }

      return true;
    });
  }, [groupedTransactions, statusFilter, search]);

  // Filtered Itemized Transfers (Model 3 - Transaction History)
  const filteredTransfers = useMemo(() => {
    return parsedTransfers.filter(item => {
      // Status filter
      if (statusFilter !== 'All') {
        if (statusFilter === 'Pending' && item.status !== 'Pending') return false;
        if (statusFilter === 'Received' && item.status !== 'Received') return false;
      }

      // Search
      const q = (search || '').toLowerCase().trim();
      if (q) {
        const matchesTxn = (item.txnId || '').toLowerCase().includes(q);
        const matchesProd = (item.product_name || '').toLowerCase().includes(q);
        const matchesComment = (item.txnComment || '').toLowerCase().includes(q);
        const matchesFrom = (item.fromName || '').toLowerCase().includes(q);
        const matchesTo = (item.toName || '').toLowerCase().includes(q);
        if (!matchesTxn && !matchesProd && !matchesComment && !matchesFrom && !matchesTo) {
          return false;
        }
      }

      return true;
    });
  }, [parsedTransfers, statusFilter, search]);

  // Open Transaction Details popup for a specific Transaction ID / Record
  const openTxnDetails = (record) => {
    const targetTxnId = record.txnId;
    const matchingItems = parsedTransfers.filter(t => t.txnId === targetTxnId);
    const primaryItem = matchingItems[0] || record;

    setSelectedTxn({
      txnId: targetTxnId,
      date: primaryItem.transferred_at || record.date,
      fromLocation: primaryItem.fromName || record.fromName,
      toLocation: primaryItem.toName || record.toName,
      status: record.status || primaryItem.status,
      user: primaryItem.txnUser || record.user,
      comment: record.comment || primaryItem.txnComment,
      items: matchingItems.length > 0 ? matchingItems : (record.items || [record]),
      id: primaryItem.id,
      product_id: primaryItem.product_id,
      stock_type: primaryItem.stock_type,
      quantity: primaryItem.quantity,
      to_branch_id: primaryItem.to_branch_id || record.to_branch_id,
    });
    setShowTxnModal(true);
  };

  // Access control: Restricted to MIS Admin login only
  if (!misMode) {
    return (
      <div className="page-container" style={{ padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ maxWidth: 460, margin: '60px auto', background: 'var(--color-surface)', padding: 32, borderRadius: 16, border: '1px solid var(--color-line)' }}>
          <AlertCircle size={48} style={{ color: '#EF4444', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-ink)', marginBottom: 8 }}>Access Restricted</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>
            The Stock Transfer module is accessible from MIS Admin login only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#10B981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 12px rgba(16,185,129,0.25)' }}>
            <ArrowLeftRight size={18} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>Stock Transfer</h1>
        </div>
      </div>

      {/* Toasts */}
      {successMsg && (
        <div className="toast toast-success" style={{ marginBottom: 16 }}>
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="toast toast-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* 3 MODELS SEGMENTED TABS */}
      <div className="seg-tabs" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`seg-tab ${activeModel === 'new-transfer' ? 'active' : ''}`}
          onClick={() => setActiveModel('new-transfer')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Send size={15} />
          <span>New Transfer</span>
        </button>

        <button
          type="button"
          className={`seg-tab ${activeModel === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveModel('transactions')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <ArrowLeftRight size={15} />
          <span>Transactions</span>
        </button>

        <button
          type="button"
          className={`seg-tab ${activeModel === 'history' ? 'active' : ''}`}
          onClick={() => setActiveModel('history')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Clock size={15} />
          <span>Transaction History</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* MODEL 1: NEW TRANSFER (INDIVIDUAL WORKSPACE/VIEW)                         */}
      {/* ========================================================================= */}
      {activeModel === 'new-transfer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Step 1: Locations */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: 20,
              border: '1px solid var(--color-line)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
              1. Select Locations (From & To)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">
                  Source Location (Where to Send From) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <SearchableDropdown
                  value={transferForm.from_branch_id}
                  onChange={handleFromBranchChange}
                  options={(branches || []).map(b => ({ value: String(b.id), label: b.branch_name }))}
                  placeholder="Select source location"
                  displayKey="label"
                  valueKey="value"
                  disabled={!misMode && !!branchId}
                />
                {!misMode && !!branchId && (
                  <div className="text-[11px] text-muted">Source locked to your current branch</div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">
                  Receiver Location (Where to Send To) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <SearchableDropdown
                  value={transferForm.to_branch_id}
                  onChange={(val) => setTransferForm(prev => ({ ...prev, to_branch_id: val }))}
                  options={(branches || [])
                    .filter(b => String(b.id) !== String(transferForm.from_branch_id))
                    .map(b => ({ value: String(b.id), label: b.branch_name }))}
                  placeholder="Select receiver location"
                  displayKey="label"
                  valueKey="value"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Pick Consumables */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: 20,
              border: '1px solid var(--color-line)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                2. Select Products to Transfer (Available in {branchNameById(transferForm.from_branch_id)})
              </div>
              <div style={{ display: 'inline-flex', background: 'var(--color-tint-2)', borderRadius: 8, padding: 2, border: '1px solid var(--color-line)' }}>
                {['All', 'Billable', 'Non-Billable'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTransferFilterType(type)}
                    style={{
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      background: transferFilterType === type ? 'var(--color-primary)' : 'transparent',
                      color: transferFilterType === type ? '#fff' : 'var(--color-muted)',
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="search-box" style={{ marginBottom: 12 }}>
              <Search size={15} />
              <input
                placeholder="Search consumable name..."
                value={transferSearch}
                onChange={(e) => setTransferSearch(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--color-line)', borderRadius: 10, padding: 8, background: 'var(--color-tint-2)' }}>
              {loadingSourceStock ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)', fontSize: 13 }}>
                  Loading available inventory at {branchNameById(transferForm.from_branch_id)}...
                </div>
              ) : filteredAvailableProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)', fontSize: 13 }}>
                  No matching consumables found in {branchNameById(transferForm.from_branch_id)}.
                </div>
              ) : (
                filteredAvailableProducts.map(r => {
                  const isOut = r.available <= 0;
                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        if (!isOut) toggleTransferRow(r.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        borderRadius: 8,
                        marginBottom: 6,
                        background: r.selected ? '#F5F3FF' : 'var(--color-surface)',
                        border: r.selected ? '1px solid #C4B5FD' : '1px solid var(--color-line)',
                        cursor: isOut ? 'not-allowed' : 'pointer',
                        opacity: isOut ? 0.5 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => {}}
                        disabled={isOut}
                        style={{ width: 18, height: 18, cursor: isOut ? 'not-allowed' : 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-ink)' }}>{r.product_name}</span>
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: 999,
                            background: r.stock_type === 'Billable' ? '#F3E8FF' : '#E0E7FF',
                            color: r.stock_type === 'Billable' ? '#7E22CE' : '#3730A3',
                            border: r.stock_type === 'Billable' ? '1px solid #D8B4FE' : '1px solid #C7D2FE',
                          }}>
                            {r.stock_type}
                          </span>
                          <span style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: '#047857',
                            background: '#ECFDF5',
                            padding: '1px 8px',
                            borderRadius: 4,
                            border: '1px solid #A7F3D0',
                          }}>
                            {fmtMoney(r.price)}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: isOut ? '#DC2626' : 'var(--color-muted)', marginTop: 3 }}>
                          {isOut ? 'Out of stock (0 available)' : `Available in stock: ${fmtQty2(r.available)} ${r.unit || 'units'}`}
                        </div>
                      </div>

                      {r.selected && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted)' }}>Qty:</span>
                          <input
                            type="number"
                            min="0.1"
                            max={r.available}
                            step="any"
                            value={r.qty}
                            onChange={(e) => updateTransferRow(r.id, { qty: e.target.value })}
                            className="form-input"
                            style={{ width: 90, padding: '5px 8px', fontSize: 13, textAlign: 'center', fontWeight: 600 }}
                            placeholder="0"
                          />
                          <button
                            type="button"
                            onClick={() => updateTransferRow(r.id, { qty: String(r.available) })}
                            style={{
                              fontSize: 11.5,
                              padding: '4px 8px',
                              borderRadius: 6,
                              border: '1px solid var(--color-line)',
                              background: 'var(--color-surface)',
                              cursor: 'pointer',
                              fontWeight: 600,
                            }}
                            title="Transfer maximum available"
                          >
                            Max
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Step 3: Selected Summary Table */}
          {selectedTransferItems.length > 0 && (
            <div
              style={{
                background: 'var(--color-surface)',
                borderRadius: 14,
                padding: 20,
                border: '1px solid var(--color-line)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Selected Consumables Summary ({selectedTransferItems.length})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                    Total Transfer Value: <strong style={{ color: '#047857', fontSize: 14 }}>{fmtMoney(totalTransferValue)}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={resetTransferSelection}
                    className="btn btn-secondary"
                    style={{ fontSize: 11.5, padding: '3px 10px', color: '#DC2626', borderColor: '#FECACA' }}
                    title="Clear all selected items"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="rpt-table" style={{ fontSize: 13, width: '100%', minWidth: 800 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 12px' }}>Product</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', width: 120 }}>Type</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 110 }}>Unit Price</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', width: 90 }}>In Stock</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', width: 110 }}>Transfer Qty</th>
                      <th style={{ textAlign: 'right', padding: '8px 12px', width: 120 }}>Subtotal</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', width: 70 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransferItems.map(r => {
                      const qtyNum = Number(r.qty) || 0;
                      const exceeds = qtyNum > r.available;
                      const subtotal = (r.price || 0) * qtyNum;
                      return (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600, padding: '8px 12px' }}>{r.product_name}</td>
                          <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: r.stock_type === 'Billable' ? '#F3E8FF' : '#E0E7FF',
                              color: r.stock_type === 'Billable' ? '#7E22CE' : '#3730A3',
                            }}>
                              {r.stock_type}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 12px' }}>{fmtMoney(r.price)}</td>
                          <td style={{ textAlign: 'center', padding: '8px 12px', color: 'var(--color-muted)' }}>{r.available}</td>
                          <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                            <input
                              type="number"
                              min="0.1"
                              max={r.available}
                              step="any"
                              value={r.qty}
                              onChange={(e) => updateTransferRow(r.id, { qty: e.target.value })}
                              className="form-input"
                              style={{ width: 85, padding: '4px 8px', fontSize: 12.5, textAlign: 'center', fontWeight: 600, borderColor: exceeds ? '#EF4444' : undefined }}
                            />
                            {exceeds && (
                              <div style={{ color: '#EF4444', fontSize: 10, marginTop: 2 }}>Max: {r.available}</div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, padding: '8px 12px', color: '#047857' }}>
                            {fmtMoney(subtotal)}
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                            <button
                              type="button"
                              onClick={() => toggleTransferRow(r.id)}
                              className="ia danger"
                              title="Remove"
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#EF4444' }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-line)', fontSize: 13 }}>
                <span className="text-muted">Total Transfer Quantity: <strong>{fmtQty2(totalTransferQty)} units</strong></span>
                <span className="text-muted">Total Estimated Value: <strong style={{ color: '#047857', fontSize: 15 }}>{fmtMoney(totalTransferValue)}</strong></span>
              </div>
            </div>
          )}

          {/* Step 4: Comments & Remarks */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: 20,
              border: '1px solid var(--color-line)',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              3. Comments & Remarks
            </div>
            <textarea
              className="form-input"
              value={transferForm.remarks}
              onChange={(e) => setTransferForm(prev => ({ ...prev, remarks: e.target.value }))}
              placeholder="Enter reason or transfer notes for this transaction..."
              rows="3"
              style={{ width: '100%', fontSize: 13 }}
            />
          </div>

          {/* Submit Action Bar */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: 18,
              border: '1px solid var(--color-line)',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={initNewTransfer}
              disabled={loading}
              className="btn btn-secondary"
              style={{ padding: '11px 20px', fontSize: 13.5 }}
              title="Reset the transfer workspace and clear all selected items"
            >
              Reset Form
            </button>
            <button
              onClick={handleTransferAll}
              disabled={
                loading ||
                !transferForm.from_branch_id ||
                !transferForm.to_branch_id ||
                String(transferForm.from_branch_id) === String(transferForm.to_branch_id) ||
                selectedTransferItems.length === 0 ||
                selectedTransferItems.some(r => !r.qty || Number(r.qty) <= 0 || Number(r.qty) > r.available)
              }
              className="btn btn-primary"
              style={{ backgroundColor: '#059669', minWidth: 200, padding: '11px 24px', fontSize: 14, fontWeight: 600 }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Processing Transfer...</span>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Send size={16} /> Execute Transfer ({selectedTransferItems.length} items)
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODEL 2: TRANSACTIONS (GROUPED BY TRANSACTION ID WITH ROW CLICK POPUP)     */}
      {/* ========================================================================= */}
      {activeModel === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filters Bar */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: 16,
              border: '1px solid var(--color-line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              <Filter size={14} /> Filter Transactions
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
              {/* Search box */}
              <div className="search-box" style={{ gridColumn: 'span 1' }}>
                <Search size={15} />
                <input
                  placeholder="Search Txn ID, branch, comments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Status filter */}
              <div>
                <select
                  className="form-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ fontSize: 13, height: 40 }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending Receipt</option>
                  <option value="Received">Completed / Received</option>
                  <option value="Partial">Partial</option>
                </select>
              </div>

              {/* Branch filter (MIS only) */}
              {misMode && (
                <div>
                  <SearchableDropdown
                    value={branchFilter}
                    onChange={(val) => setBranchFilter(val)}
                    options={[
                      { value: '', label: 'All Branches' },
                      ...(branches || []).map(b => ({ value: String(b.id), label: b.branch_name })),
                    ]}
                    placeholder="Filter by Location"
                    displayKey="label"
                    valueKey="value"
                  />
                </div>
              )}

              {/* Date From */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>From:</span>
                <input
                  type="date"
                  className="form-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ fontSize: 12.5, height: 40 }}
                />
              </div>

              {/* Date To */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>To:</span>
                <input
                  type="date"
                  className="form-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ fontSize: 12.5, height: 40 }}
                />
              </div>
            </div>
          </div>

          {/* Transactions Grouped Table */}
          <div className="table-container" style={{ background: 'var(--color-surface)', borderRadius: 14, border: '1px solid var(--color-line)', overflowX: 'auto' }}>
            <table className="rpt-table" style={{ width: '100%', minWidth: 1200, margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 170, minWidth: 160 }}>Transaction ID</th>
                  <th style={{ width: 170, minWidth: 165 }}>Date & Time</th>
                  <th style={{ width: 180, minWidth: 170 }}>From Location</th>
                  <th style={{ width: 180, minWidth: 170 }}>To Location</th>
                  <th style={{ width: 130, minWidth: 120, textAlign: 'center' }}>Products / Items</th>
                  <th style={{ width: 95, minWidth: 90, textAlign: 'center' }}>Total Qty</th>
                  <th style={{ width: 110, minWidth: 105, textAlign: 'center' }}>Status</th>
                  <th style={{ minWidth: 200 }}>Comments / Remarks</th>
                  <th className="rpt-c-actions" style={{ width: 80, minWidth: 80, textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredGroupedTransactions.length === 0 && (
                  <tr>
                    <td colSpan="9" className="text-center text-muted" style={{ padding: 48 }}>
                      {loading ? 'Loading transactions...' : 'No transactions found matching filters.'}
                    </td>
                  </tr>
                )}
                {filteredGroupedTransactions.map((group) => {
                  const isPending = group.status === 'Pending';
                  const isReceived = group.status === 'Received';

                  return (
                    <tr
                      key={group.txnId}
                      onClick={() => openTxnDetails(group)}
                      title="Click anywhere on this row to view products, quantities, status, and comments"
                      style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--color-tint-2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '';
                      }}
                    >
                      {/* Transaction ID */}
                      <td className="rpt-nowrap">
                        <span
                          style={{
                            border: '1px solid #DDD6FE',
                            background: '#F5F3FF',
                            color: '#6D28D9',
                            fontFamily: 'monospace',
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <span>{group.txnId}</span>
                          <Eye size={12} style={{ opacity: 0.7 }} />
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="rpt-nowrap">
                        <span className="rpt-date">
                          {formatDateTimeDisplay(group.date)}
                        </span>
                      </td>

                      {/* From Location */}
                      <td className="rpt-nowrap font-medium">
                        {group.fromName}
                      </td>

                      {/* To Location */}
                      <td className="rpt-nowrap font-medium" style={{ color: '#047857' }}>
                        {group.toName}
                      </td>

                      {/* Products Summary */}
                      <td className="rpt-nowrap">
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'var(--color-tint-2)',
                            color: 'var(--color-ink)',
                            border: '1px solid var(--color-line)',
                          }}
                        >
                          {group.productCount} Product{group.productCount === 1 ? '' : 's'}
                        </span>
                      </td>

                      {/* Total Qty */}
                      <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                        <span className="font-semibold">{fmtQty1(group.totalQty)}</span>
                      </td>

                      {/* Status */}
                      <td className="rpt-nowrap">
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: isReceived ? '#ECFDF5' : isPending ? '#FEF3C7' : 'var(--color-tint-2)',
                            color: isReceived ? '#047857' : isPending ? '#B45309' : 'var(--color-ink)',
                            border: isReceived ? '1px solid #A7F3D0' : isPending ? '1px solid #FDE68A' : '1px solid var(--color-line)',
                          }}
                        >
                          {group.status}
                        </span>
                      </td>

                      {/* Comments Preview */}
                      <td className="rpt-wrap" style={{ fontSize: 12, color: group.comment ? 'var(--color-ink)' : 'var(--color-muted)' }}>
                        {group.comment ? (
                          <span
                            title={group.comment}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: 1.3,
                            }}
                          >
                            {group.comment}
                          </span>
                        ) : (
                          <span style={{ fontStyle: 'italic', opacity: 0.6 }}>No comments</span>
                        )}
                      </td>

                      {/* Details View Action */}
                      <td className="rpt-actions-cell" style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          title="Open Details Popup"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTxnDetails(group);
                          }}
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODEL 3: TRANSACTION HISTORY (ITEMIZED LINE-BY-LINE HISTORY)              */}
      {/* ========================================================================= */}
      {activeModel === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filters Bar */}
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: 16,
              border: '1px solid var(--color-line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
              <Filter size={14} /> Filter Line-Item History
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
              {/* Search box */}
              <div className="search-box" style={{ gridColumn: 'span 1' }}>
                <Search size={15} />
                <input
                  placeholder="Search product, Txn ID, notes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Status filter */}
              <div>
                <select
                  className="form-input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ fontSize: 13, height: 40 }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending Receipt</option>
                  <option value="Received">Completed / Received</option>
                </select>
              </div>

              {/* Branch filter (MIS only) */}
              {misMode && (
                <div>
                  <SearchableDropdown
                    value={branchFilter}
                    onChange={(val) => setBranchFilter(val)}
                    options={[
                      { value: '', label: 'All Branches' },
                      ...(branches || []).map(b => ({ value: String(b.id), label: b.branch_name })),
                    ]}
                    placeholder="Filter by Location"
                    displayKey="label"
                    valueKey="value"
                  />
                </div>
              )}

              {/* Date From */}
              <div style={{ display: 'center', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>From:</span>
                <input
                  type="date"
                  className="form-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ fontSize: 12.5, height: 40 }}
                />
              </div>

              {/* Date To */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>To:</span>
                <input
                  type="date"
                  className="form-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ fontSize: 12.5, height: 40 }}
                />
              </div>
            </div>
          </div>

          {/* Line Item History Table */}
          <div className="table-container" style={{ background: 'var(--color-surface)', borderRadius: 14, border: '1px solid var(--color-line)', overflowX: 'auto' }}>
            <table className="rpt-table" style={{ width: '100%', minWidth: 1200, margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 170, minWidth: 165 }}>Date & Time</th>
                  <th style={{ width: 180, minWidth: 170 }}>From Location</th>
                  <th style={{ width: 180, minWidth: 170 }}>To Location</th>
                  <th style={{ minWidth: 220 }}>Product Name</th>
                  <th style={{ width: 105, minWidth: 100, textAlign: 'center' }}>Type</th>
                  <th style={{ width: 90, minWidth: 85, textAlign: 'center' }}>Qty</th>
                  <th style={{ width: 110, minWidth: 105, textAlign: 'center' }}>Status</th>
                  <th style={{ width: 165, minWidth: 160 }}>Transaction ID</th>
                  <th className="rpt-c-actions" style={{ width: 90, minWidth: 85, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.length === 0 && (
                  <tr>
                    <td colSpan="9" className="text-center text-muted" style={{ padding: 48 }}>
                      {loading ? 'Loading transfer records...' : 'No transfer history found matching filters.'}
                    </td>
                  </tr>
                )}
                {filteredTransfers.map((item) => {
                  const isPending = item.status === 'Pending';
                  const isReceived = item.status === 'Received';
                  const canReceive = !misMode && branchId && String(item.to_branch_id) === String(branchId) && isPending;

                  return (
                    <tr key={item.id}>
                      {/* Date & Time */}
                      <td className="rpt-nowrap">
                        <span className="rpt-date">
                          {formatDateTimeDisplay(item.transferred_at)}
                        </span>
                      </td>

                      {/* From Location */}
                      <td className="rpt-nowrap font-medium">
                        {item.fromName}
                      </td>

                      {/* To Location */}
                      <td className="rpt-nowrap font-medium" style={{ color: '#047857' }}>
                        {item.toName}
                      </td>

                      {/* Product */}
                      <td className="rpt-wrap font-medium">
                        {item.product_name || `Product #${item.product_id}`}
                      </td>

                      {/* Type */}
                      <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: 4,
                            background: item.stock_type === 'Non-Billable' ? '#E0E7FF' : '#F3E8FF',
                            color: item.stock_type === 'Non-Billable' ? '#3730A3' : '#7E22CE',
                          }}
                        >
                          {item.stock_type || 'Billable'}
                        </span>
                      </td>

                      {/* Qty */}
                      <td className="rpt-nowrap" style={{ textAlign: 'center' }}>
                        <span className="font-semibold">{fmtQty1(item.quantity)}</span>
                      </td>

                      {/* Status */}
                      <td className="rpt-nowrap">
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: isReceived ? '#ECFDF5' : isPending ? '#FEF3C7' : 'var(--color-tint-2)',
                            color: isReceived ? '#047857' : isPending ? '#B45309' : 'var(--color-ink)',
                            border: isReceived ? '1px solid #A7F3D0' : isPending ? '1px solid #FDE68A' : '1px solid var(--color-line)',
                          }}
                        >
                          {item.status || '-'}
                        </span>
                      </td>

                      {/* Clickable Transaction ID Badge */}
                      <td className="rpt-nowrap">
                        <button
                          type="button"
                          onClick={() => openTxnDetails(item)}
                          title="Click to view full transaction popup"
                          style={{
                            border: '1px solid #DDD6FE',
                            background: '#F5F3FF',
                            color: '#6D28D9',
                            fontFamily: 'monospace',
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#EDE9FE';
                            e.currentTarget.style.borderColor = '#C4B5FD';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#F5F3FF';
                            e.currentTarget.style.borderColor = '#DDD6FE';
                          }}
                        >
                          <span>{item.txnId}</span>
                          <Eye size={12} style={{ opacity: 0.7 }} />
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="rpt-actions-cell" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => openTxnDetails(item)}
                            className="btn btn-ghost btn-icon"
                            title="View Details & Comments"
                            style={{ padding: 4 }}
                          >
                            <Eye size={15} />
                          </button>

                          {canReceive && (
                            <button
                              onClick={() => handleReceive(item)}
                              disabled={loading}
                              className="btn btn-primary"
                              style={{ fontSize: 11.5, padding: '3px 9px', backgroundColor: '#059669' }}
                            >
                              Receive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TRANSACTION DETAILS MODAL (POPUP SHOWING PRODUCTS, QTY, STATUS, COMMENTS) */}
      {/* ========================================================================= */}
      <TransactionDetailsModal
        open={showTxnModal}
        onClose={() => setShowTxnModal(false)}
        transaction={selectedTxn}
        canReceive={!misMode && branchId && String(selectedTxn?.to_branch_id) === String(branchId)}
        onReceive={handleReceive}
        loading={loading}
      />
    </div>
  );
};

export default StockTransfer;
