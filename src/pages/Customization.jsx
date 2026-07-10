import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const Customization = () => {
  const { branchId } = useBranch();
  const [activeTab, setActiveTab] = useState('general');
  const [services, setServices] = useState([]);
  const [machinery, setMachinery] = useState([]);
  const [billableConsumables, setBillableConsumables] = useState([]);
  const [nonBillableConsumables, setNonBillableConsumables] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [generalSettings, setGeneralSettings] = useState({
    organizationName: 'Main Branch',
    dateFormat: 'DD-MM-YYYY',
    timeZone: 'Asia/Kolkata',
    currency: 'INR',
    language: 'en',
    itemsPerPage: '10',
    enableNotifications: true,
  });

  useEffect(() => {
    if (branchId) {
      fetchServices();
      fetchMachinery();
      fetchBillableConsumables();
      fetchNonBillableConsumables();
    }
  }, [branchId]);

  const fetchServices = async () => {
    try {
      const { data } = await supabase.from('master_services').select('*').eq('branch_id', branchId).order('service_name');
      if (data) setServices(data || []);
    } catch (error) { console.error('Error fetching services:', error); }
  };

  const fetchMachinery = async () => {
    try {
      const { data, error } = await supabase
        .from('master_machinery')
        .select('*, master_services(service_name)')
        .eq('branch_id', branchId);
      
      if (error) {
        console.error('Error fetching machinery:', error);
        setMachinery([]);
        return;
      }
      
      const machineryWithService = data.map(item => ({
        ...item,
        service_name: item.master_services?.service_name || 'Unknown'
      }));
      
      setMachinery(machineryWithService || []);
    } catch (error) { 
      console.error('Error fetching machinery:', error); 
    }
  };

  const fetchBillableConsumables = async () => {
    try {
      const { data } = await supabase.from('master_consumables').select('*').eq('branch_id', branchId).order('consumable_name');
      if (data) setBillableConsumables(data || []);
    } catch (error) { console.error('Error fetching billable consumables:', error); }
  };

  const fetchNonBillableConsumables = async () => {
    try {
      const { data } = await supabase.from('bulk_consumables_registry').select('*').eq('branch_id', branchId).order('product_name');
      if (data) setNonBillableConsumables(data || []);
    } catch (error) { console.error('Error fetching non-billable consumables:', error); }
  };

  // Service management
  const addService = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.serviceName.value;
    if (!name) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_services').insert({ branch_id: branchId, service_name: name });
      if (!error) { form.reset(); fetchServices(); }
    } catch (error) { console.error('Error adding service:', error); }
    setLoading(false);
  };

  const deleteService = async (id) => {
    if (!window.confirm('Delete this service?')) return;
    try {
      const { error } = await supabase.from('master_services').delete().eq('id', id);
      if (!error) fetchServices();
    } catch (error) { console.error('Error deleting service:', error); }
  };

  // Machinery management
  const addMachinery = async (e) => {
    e.preventDefault();
    const form = e.target;
    const machineName = form.machineName.value;
    const serviceId = parseInt(form.serviceId.value);
    if (!machineName || !serviceId) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_machinery').insert({ branch_id: branchId, machine_name: machineName, service_id: serviceId });
      if (!error) { form.reset(); fetchMachinery(); }
    } catch (error) { console.error('Error adding machinery:', error); }
    setLoading(false);
  };

  const deleteMachinery = async (id) => {
    if (!window.confirm('Delete this machine?')) return;
    try {
      const { error } = await supabase.from('master_machinery').delete().eq('id', id);
      if (!error) fetchMachinery();
    } catch (error) { console.error('Error deleting machinery:', error); }
  };

  // Billable consumable management
  const addBillableConsumable = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value;
    const unit = form.unit.value;
    const cost = form.cost.value;
    if (!name || !unit) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_consumables').insert({ branch_id: branchId, consumable_name: name, default_unit: unit, cost_unit: cost || 0 });
      if (!error) { form.reset(); fetchBillableConsumables(); }
    } catch (error) { console.error('Error adding consumable:', error); }
    setLoading(false);
  };

  const updateBillableConsumable = async (id, updates) => {
    try {
      const { error } = await supabase.from('master_consumables').update(updates).eq('id', id);
      if (!error) fetchBillableConsumables();
    } catch (error) { console.error('Error updating consumable:', error); }
  };

  const deleteBillableConsumable = async (id) => {
    if (!window.confirm('Delete this consumable?')) return;
    try {
      const { error } = await supabase.from('master_consumables').delete().eq('id', id);
      if (!error) fetchBillableConsumables();
    } catch (error) { console.error('Error deleting consumable:', error); }
  };

  // Non-billable consumable management
  const addNonBillableConsumable = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value;
    const cost = form.cost.value;
    if (!name) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('bulk_consumables_registry').insert({ branch_id: branchId, product_name: name, cost_unit: cost || 0 });
      if (!error) { form.reset(); fetchNonBillableConsumables(); }
    } catch (error) { console.error('Error adding non-billable consumable:', error); }
    setLoading(false);
  };

  const updateNonBillableConsumable = async (id, updates) => {
    try {
      const { error } = await supabase.from('bulk_consumables_registry').update(updates).eq('id', id);
      if (!error) fetchNonBillableConsumables();
    } catch (error) { console.error('Error updating non-billable consumable:', error); }
  };

  const deleteNonBillableConsumable = async (id) => {
    if (!window.confirm('Delete this non-billable consumable?')) return;
    try {
      const { error } = await supabase.from('bulk_consumables_registry').delete().eq('id', id);
      if (!error) fetchNonBillableConsumables();
    } catch (error) { console.error('Error deleting non-billable consumable:', error); }
  };

  const saveGeneralSettings = () => {
    alert('Settings saved successfully!');
  };

  const tabs = [
    { id: 'general', label: 'General Settings', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { id: 'billable', label: 'Billable Consumables', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    { id: 'non-billable', label: 'Non-Billable Consumables', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: 'service', label: 'Service Configuration', icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
    { id: 'machinery', label: 'Machinery Mapping', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
  ];

  return (
    <div className="space-y-6">
      {/* Horizontal Sub-Navbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex border-b border-slate-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-200 relative ${
                activeTab === tab.id
                  ? 'text-sky-600 border-b-2 border-sky-600 bg-sky-50/30'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {/* General Settings Tab */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900">General Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Organization Name</label>
                <input type="text" value={generalSettings.organizationName} onChange={(e) => setGeneralSettings({ ...generalSettings, organizationName: e.target.value })} className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm" />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Date Format</label>
                <select value={generalSettings.dateFormat} onChange={(e) => setGeneralSettings({ ...generalSettings, dateFormat: e.target.value })} className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm">
                  <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                  <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">System Time Zone</label>
                <select value={generalSettings.timeZone} onChange={(e) => setGeneralSettings({ ...generalSettings, timeZone: e.target.value })} className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm">
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">System Base Currency</label>
                <select value={generalSettings.currency} onChange={(e) => setGeneralSettings({ ...generalSettings, currency: e.target.value })} className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm">
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <div className="text-sm font-semibold text-slate-900">Enable System Notifications</div>
                <div className="text-xs text-slate-500 mt-0.5">Receive alerts for important system events</div>
              </div>
              <button onClick={() => setGeneralSettings({ ...generalSettings, enableNotifications: !generalSettings.enableNotifications })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${generalSettings.enableNotifications ? 'bg-sky-600' : 'bg-slate-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${generalSettings.enableNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
        )}

        {/* Billable Consumables Tab */}
        {activeTab === 'billable' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900">Billable Consumables Master</h3>
            <form onSubmit={addBillableConsumable} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Consumable Name</label>
                <input name="name" placeholder="e.g., Glenmark Momate F Cream" className="w-full h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required />
              </div>
              <div className="w-32">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Unit</label>
                <input name="unit" placeholder="e.g., g, ml" className="w-full h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required />
              </div>
              <div className="w-32">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cost (₹)</label>
                <input name="cost" type="number" step="0.01" placeholder="0.00" className="w-full h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" />
              </div>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-semibold shadow-sm disabled:bg-slate-400">Add Consumable</button>
            </form>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Name</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Unit</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Cost</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billableConsumables.map(c => (
                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{c.consumable_name}</td>
                      <td className="px-4 py-3 text-slate-600">{c.default_unit}</td>
                      <td className="px-4 py-3 text-slate-600">₹{c.cost_unit || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteBillableConsumable(c.id)} className="text-red-600 hover:text-red-700 text-xs font-semibold">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {billableConsumables.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">No billable consumables configured</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Non-Billable Consumables Tab */}
        {activeTab === 'non-billable' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900">Non-Billable Consumables Master</h3>
            <form onSubmit={addNonBillableConsumable} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Product Name</label>
                <input name="name" placeholder="e.g., Glenmark Momate F Cream" className="w-full h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required />
              </div>
              <div className="w-32">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cost (₹)</label>
                <input name="cost" type="number" step="0.01" placeholder="0.00" className="w-full h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" />
              </div>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-semibold shadow-sm disabled:bg-slate-400">Add Product</button>
            </form>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Product Name</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Cost</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nonBillableConsumables.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{item.product_name}</td>
                      <td className="px-4 py-3 text-slate-600">₹{item.cost_unit || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => deleteNonBillableConsumable(item.id)} className="text-red-600 hover:text-red-700 text-xs font-semibold">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {nonBillableConsumables.length === 0 && <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">No non-billable consumables configured</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Service Configuration Tab */}
        {activeTab === 'service' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900">Service Configuration</h3>
            <form onSubmit={addService} className="flex gap-3">
              <input name="serviceName" placeholder="New service name" className="flex-1 h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required />
              <button type="submit" disabled={loading} className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-semibold shadow-sm disabled:bg-slate-400">Add Service</button>
            </form>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {services.map(s => (
                <div key={s.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-sky-300 transition-all">
                  <span className="text-sm font-medium text-slate-900">{s.service_name}</span>
                  <button onClick={() => deleteService(s.id)} className="text-red-600 hover:text-red-700 text-xs font-semibold px-3 py-1.5 rounded hover:bg-red-50 transition-all">Delete</button>
                </div>
              ))}
              {services.length === 0 && <div className="text-center py-8 text-slate-500 text-sm">No services configured</div>}
            </div>
          </div>
        )}

        {/* Machinery Mapping Tab */}
        {activeTab === 'machinery' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900">Machinery Mapping</h3>
            <form onSubmit={addMachinery} className="flex gap-3">
              <input name="machineName" placeholder="Machine name" className="flex-1 h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required />
              <select name="serviceId" className="h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required>
                <option value="">Assign to Service</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.service_name}</option>)}
              </select>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-semibold shadow-sm disabled:bg-slate-400">Add Machinery</button>
            </form>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {machinery.map(m => (
                <div key={m.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-sky-300 transition-all">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{m.machine_name}</div>
                    <div className="text-xs text-slate-500">{m.master_services?.service_name}</div>
                  </div>
                  <button onClick={() => deleteMachinery(m.id)} className="text-red-600 hover:text-red-700 text-xs font-semibold px-3 py-1.5 rounded hover:bg-red-50 transition-all">Delete</button>
                </div>
              ))}
              {machinery.length === 0 && <div className="text-center py-8 text-slate-500 text-sm">No machinery configured</div>}
            </div>
          </div>
        )}
      </div>

      {/* Action Confirmation Buttons */}
      <div className="flex justify-end gap-3">
        <button className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all">Cancel</button>
        <button onClick={saveGeneralSettings} className="px-6 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-semibold shadow-sm transition-all">Save Changes</button>
      </div>
    </div>
  );
};

export default Customization;