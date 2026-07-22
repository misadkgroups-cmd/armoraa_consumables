import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';
import { Search, Plus, Edit2, Trash2, X, Package, TrendingUp, TrendingDown, ArrowLeftRight, History, Download, FileText, FileSpreadsheet, Send } from 'lucide-react';
import SearchableDropdown from '../components/SearchableDropdown';
import * as XLSX from 'xlsx';
import * as stockApi from '../services/stockApi';

const StockManagement = () => {
  const { branchId } = useBranch();
  const [activeTab, setActiveTab] = useState('billable');
  const [stock, setStock] = useState([]);
  const [history, setHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Adjustment form
  const [adjustForm, setAdjustForm] = useState({ product_id: '', product_type: 'Billable', current_stock: 0, add_units: '', reduce_units: '', remarks: '' });
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  
  // Transfer form
  const [transferForm, setTransferForm] = useState({ 
    product_id: '', 
    product_type: 'Billable', 
    from_branch_id: '', 
    to_branch_id: '', 
    quantity: '', 
    remarks: '' 
  });
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [sourceStock, setSourceStock] = useState(0);
  
  // Fetch all branches for transfer dropdown
  const fetchBranches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, branch_name')
        .order('branch_name');
      
      if (!error && data) {
        // Add Corporate as a virtual option
        setBranches([{ id: 'corporate', branch_name: 'Corporate', is_corporate: true }, ...data]);
      }
    } catch (e) {
      console.error('Error fetching branches:', e);
    }
  }, []);
  
  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);
  
  // Get source branch stock when product is selected
  useEffect(() => {
    if (transferForm.product_id && transferForm.product_type && transferForm.from_branch_id) {
      getSourceStock();
    }
  }, [transferForm.product_id, transferForm.product_type, transferForm.from_branch_id]);
  
  const getSourceStock = async () => {
    if (!transferForm.product_id || !transferForm.from_branch_id) {
      setSourceStock(0);
      return;
    }
    try {
      const data = await stockApi.getStock(transferForm.product_type, transferForm.product_id, transferForm.from_branch_id);
      setSourceStock(data?.current_stock || 0);
    } catch (e) {
      console.error('Error fetching source stock:', e);
      setSourceStock(0);
    }
  };

  useEffect(() => {
    if (branchId) {
      fetchStock();
      fetchProducts();
    }
  }, [branchId, activeTab]);

  const fetchStock = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const data = await stockApi.getBranchStock(branchId);
      setStock(data || []);
    } catch (e) {
      console.error('Error fetching stock:', e);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  const fetchProducts = async () => {
    try {
      const [billable, nonBillable] = await Promise.all([
        supabase.from('master_billable_consumables').select('id, product_name, unit, minimum_stock').eq('status', 'Active').order('product_name'),
        supabase.from('master_non_billable_consumables').select('id, product_name, minimum_stock').eq('status', 'Active').order('product_name')
      ]);
      
      const billableProducts = (billable.data || []).map(p => ({ ...p, type: 'Billable' }));
      const nonBillableProducts = (nonBillable.data || []).map(p => ({ ...p, type: 'Non-Billable' }));
      setProducts([...billableProducts, ...nonBillableProducts]);
    } catch (e) {
      console.error('Error fetching products:', e);
    }
  };

  const fetchHistory = async (productType, consumableId) => {
    if (!branchId) return;
    setLoading(true);
    try {
      const data = await stockApi.getStockHistory(productType, consumableId, branchId, 100);
      setHistory(data || []);
    } catch (e) {
      console.error('Error fetching history:', e);
    } finally {
      setLoading(false);
    }
  };

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
    
    const newStock = addUnits > 0 
      ? currentStock + addUnits 
      : currentStock - reduceUnits;
    
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
        'Admin'
      );

      if (result.success) {
        alert(`Stock adjusted successfully. New stock: ${newStock}`);
        setShowAdjustModal(false);
        setAdjustForm({ product_id: '', product_type: 'Billable', current_stock: 0, add_units: '', reduce_units: '', remarks: '' });
        fetchStock();
      } else {
        alert(result.message || 'Failed to adjust stock');
      }
    } catch (e) {
      alert('Error adjusting stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewHistory = (product) => {
    fetchHistory(product.type, product.id);
    setActiveTab('history');
  };

  // Get consumables used from billable_report
  const getConsumablesUsed = async (consumableId) => {
    if (!branchId || !consumableId) return 0;
    try {
      let query = supabase
        .from('billable_report')
        .select('*')
        .eq('branch_id', branchId);
      
      let total = 0;
      for (let i = 1; i <= 14; i++) {
        const { data } = await supabase
          .from('billable_report')
          .select(`consumable_${i}_id, consumable_${i}_units`)
          .eq('branch_id', branchId);
        
        if (data) {
          data.forEach(row => {
            if (row[`consumable_${i}_id`] == consumableId) {
              total += Number(row[`consumable_${i}_units`]) || 0;
            }
          });
        }
      }
      return total;
    } catch (e) {
      console.error('Error fetching consumables used:', e);
      return 0;
    }
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

  // Filter stock by type based on activeTab
  const filteredStock = useMemo(() => {
    return stock.filter(item => {
      const product = products.find(p => p.id === item.consumable_id && p.type === item.product_type);
      const productName = product?.product_name || '';
      const matchesSearch = productName.toLowerCase().includes(search.toLowerCase());
      
      // Filter by active tab (Billable or Non-Billable)
      if (activeTab === 'billable') {
        return matchesSearch && item.product_type === 'Billable';
      } else if (activeTab === 'non-billable') {
        return matchesSearch && item.product_type === 'Non-Billable';
      }
      return matchesSearch;
    });
  }, [stock, products, search, activeTab]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const product = products.find(p => p.id === item.consumable_id && p.type === item.product_type);
      const productName = product?.product_name || '';
      return productName.toLowerCase().includes(search.toLowerCase());
    });
  }, [history, products, search]);

  // Export functions
  const downloadCSV = () => {
    if (filteredStock.length === 0) return;
    
    const rows = filteredStock.map(item => {
      const product = products.find(p => p.id === item.consumable_id && p.type === item.product_type);
      return [
        product?.product_name || `Product ${item.consumable_id}`,
        item.product_type,
        item.current_stock,
        item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-'
      ];
    });
    
    const headers = ['Product Name', 'Type', 'Current Stock', 'Last Updated'];
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
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
    if (filteredStock.length === 0) return;
    
    const rows = filteredStock.map(item => {
      const product = products.find(p => p.id === item.consumable_id && p.type === item.product_type);
      return {
        'Product Name': product?.product_name || `Product ${item.consumable_id}`,
        'Type': item.product_type,
        'Current Stock': item.current_stock,
        'Last Updated': item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-'
      };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Stock`);
    XLSX.writeFile(workbook, `stock-${activeTab}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleTransferStock = async () => {
    if (!transferForm.product_id || !transferForm.from_branch_id || !transferForm.to_branch_id || !transferForm.quantity) {
      alert('Please fill in all required fields');
      return;
    }

    const quantity = Number(transferForm.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    if (transferForm.from_branch_id === transferForm.to_branch_id) {
      alert('Source and destination cannot be the same');
      return;
    }

    setLoading(true);
    try {
      const result = await stockApi.transferStock({
        productType: transferForm.product_type,
        consumableId: Number(transferForm.product_id),
        fromBranchId: transferForm.from_branch_id === 'corporate' ? 'corporate' : Number(transferForm.from_branch_id),
        toBranchId: transferForm.to_branch_id === 'corporate' ? 'corporate' : Number(transferForm.to_branch_id),
        quantity,
        remarks: transferForm.remarks || 'Stock transfer',
        createdBy: 'Admin'
      });

      if (result.success) {
        alert('Stock transferred successfully');
        setShowTransferModal(false);
        setTransferForm({ product_id: '', product_type: 'Billable', from_branch_id: '', to_branch_id: '', quantity: '', remarks: '' });
        fetchStock();
      } else {
        alert(result.message || 'Failed to transfer stock');
      }
    } catch (e) {
      alert('Error transferring stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Stock Management</h1>
          <p>Track and manage consumable inventory</p>
        </div>
        <div className="page-header-actions">
          {activeTab !== 'history' && (
            <>
              <button onClick={downloadCSV} disabled={filteredStock.length === 0} className="btn btn-secondary">
                <FileText size={16} />
                Export CSV
              </button>
              <button onClick={downloadExcel} disabled={filteredStock.length === 0} className="btn btn-secondary">
                <FileSpreadsheet size={16} />
                Export Excel
              </button>
            </>
          )}
          <button onClick={() => {
            setAdjustForm({ product_id: '', product_type: activeTab === 'non-billable' ? 'Non-Billable' : 'Billable', current_stock: 0, add_units: '', reduce_units: '', remarks: '' });
            setShowAdjustModal(true);
          }} className="btn btn-primary">
            <Plus size={16} /> Adjust Stock
          </button>
          <button onClick={() => {
            setTransferForm({ product_id: '', product_type: activeTab === 'non-billable' ? 'Non-Billable' : 'Billable', from_branch_id: '', to_branch_id: '', quantity: '', remarks: '' });
            setShowTransferModal(true);
          }} className="btn btn-primary" style={{ backgroundColor: '#059669' }}>
            <Send size={16} /> Transfer Stock
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--color-line)] mb-4">
        <button 
          onClick={() => { setActiveTab('billable'); fetchStock(); }}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'billable' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}
        >
          Billable Stock
        </button>
        <button 
          onClick={() => { setActiveTab('non-billable'); fetchStock(); }}
          className={`flex-1 px-6 py-3 text-sm font-medium transition-all relative ${activeTab === 'non-billable' ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-muted hover:text-text'}`}
        >
          Non-Billable Stock
        </button>
        <button 
          onClick={() => { setActiveTab('history'); }}
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

      {/* Current Stock Tab */}
      {activeTab !== 'history' && (
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
              {filteredStock.map((item, index) => {
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
                <th className="rpt-c-service">Product</th>
                <th className="rpt-c-service">Type</th>
                <th className="rpt-c-units">Transaction</th>
                <th className="rpt-c-units">Quantity</th>
                <th className="rpt-c-date">Date & Time</th>
                <th className="rpt-c-service">Remarks</th>
                <th className="rpt-c-service">Created By</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted" style={{ padding: 40 }}>
                    {loading ? 'Loading...' : 'No transaction history found'}
                  </td>
                </tr>
              )}
              {filteredHistory.map((item, index) => {
                const product = products.find(p => p.id === item.consumable_id && p.type === item.product_type);
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
                      <div className="flex items-center justify-center gap-2">
                        {getTransactionIcon(item.transaction_type)}
                        <span className="text-sm">{item.transaction_type}</span>
                      </div>
                    </td>
                    <td className={`rpt-nowrap font-semibold ${getQuantityColor(item.quantity)}`} style={{ textAlign: 'center' }}>
                      {item.quantity > 0 ? '+' : ''}{item.quantity}
                    </td>
                    <td className="rpt-nowrap">
                      <span className="rpt-date">
                        {item.created_at ? new Date(item.created_at).toLocaleString('en-GB') : '-'}
                      </span>
                    </td>
                    <td className="rpt-wrap">{item.remarks || '-'}</td>
                    <td className="rpt-nowrap">{item.created_by || 'System'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && (
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
                    const product = products.find(p => String(p.id) === val);
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
                <button onClick={handleAdjustStock} disabled={loading || !adjustForm.product_id || ((!adjustForm.add_units || Number(adjustForm.add_units) <= 0) && (!adjustForm.reduce_units || Number(adjustForm.reduce_units) <= 0))} className="btn btn-primary">
                  {loading ? 'Adjusting...' : 'Adjust Stock'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Stock Modal */}
      {showTransferModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '620px', width: '95%' }}>
            <div className="modal-header">
              <h3>Transfer Stock</h3>
              <button onClick={() => setShowTransferModal(false)} className="btn btn-ghost btn-icon">×</button>
            </div>
            <div className="modal-body space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTransferForm({ ...transferForm, product_type: 'Billable', product_id: '' })}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      transferForm.product_type === 'Billable' 
                        ? 'bg-[var(--color-primary)] text-white shadow-md' 
                        : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'
                    }`}
                  >
                    Billable
                  </button>
                  <button
                    onClick={() => setTransferForm({ ...transferForm, product_type: 'Non-Billable', product_id: '' })}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
                      transferForm.product_type === 'Non-Billable' 
                        ? 'bg-[var(--color-primary)] text-white shadow-md' 
                        : 'bg-[var(--color-tint-2)] text-muted hover:bg-[var(--color-line)]'
                    }`}
                  >
                    Non-Billable
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">Product <span style={{ color: '#EF4444' }}>*</span></label>
                <SearchableDropdown
                  value={transferForm.product_id}
                  onChange={(val) => setTransferForm({ ...transferForm, product_id: val })}
                  options={products.filter(p => p.type === transferForm.product_type).map(p => ({ value: String(p.id), label: p.product_name }))}
                  placeholder="Select product"
                  displayKey="label"
                  valueKey="value"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted block">From Branch <span style={{ color: '#EF4444' }}>*</span></label>
                  <SearchableDropdown
                    value={transferForm.from_branch_id}
                    onChange={async (val) => {
                      setTransferForm({ ...transferForm, from_branch_id: val });
                      // Reset and refetch source stock when branch changes
                      setSourceStock(0);
                      if (val && transferForm.product_id && transferForm.product_type) {
                        // Small delay to let state update
                        setTimeout(async () => {
                          const data = await stockApi.getStock(transferForm.product_type, Number(transferForm.product_id), val);
                          setSourceStock(data?.current_stock || 0);
                        }, 100);
                      }
                    }}
                    options={branches.map(b => ({ value: b.id, label: b.branch_name }))}
                    placeholder="Source branch"
                    displayKey="label"
                    valueKey="value"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted block">To Branch <span style={{ color: '#EF4444' }}>*</span></label>
                  <SearchableDropdown
                    value={transferForm.to_branch_id}
                    onChange={(val) => setTransferForm({ ...transferForm, to_branch_id: val })}
                    options={branches.map(b => ({ value: b.id, label: b.branch_name }))}
                    placeholder="Destination branch"
                    displayKey="label"
                    valueKey="value"
                    disabled={transferForm.from_branch_id === 'corporate'}
                  />
                </div>
              </div>

              {transferForm.product_id && transferForm.from_branch_id && (
                <div className="p-4 rounded-lg" style={{ background: 'var(--color-tint-2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
                    Available at {branches.find(b => b.id === transferForm.from_branch_id)?.branch_name}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-primary)' }}>
                    {sourceStock} {transferForm.product_type === 'Billable' ? 'units' : 'items'}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted block">
                  {transferForm.product_type === 'Billable' ? 'Units' : 'Quantity'} to Transfer <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="number"
                  className="form-input"
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                  placeholder={`Enter ${transferForm.product_type === 'Billable' ? 'units' : 'quantity'}`}
                  min="1"
                  max={sourceStock}
                  style={{ fontSize: 15, padding: '10px 12px' }}
                />
                {transferForm.quantity && Number(transferForm.quantity) > sourceStock && (
                  <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>
                    Cannot transfer more than available stock ({sourceStock})
                  </div>
                )}
              </div>

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

              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: 12, 
                paddingTop: 20, 
                borderTop: '1px solid var(--color-line)',
                marginTop: 8
              }}>
                <button 
                  onClick={() => setShowTransferModal(false)} 
                  className="btn btn-secondary"
                  style={{ minWidth: 100 }}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleTransferStock} 
                  disabled={loading || !transferForm.product_id || !transferForm.quantity || 
                    transferForm.from_branch_id === transferForm.to_branch_id ||
                    (transferForm.quantity && Number(transferForm.quantity) > sourceStock)} 
                  className="btn btn-primary"
                  style={{ 
                    backgroundColor: '#059669',
                    minWidth: 140 
                  }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="animate-pulse">Transferring...</span>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Send size={16} />
                      Transfer Stock
                    </span>
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