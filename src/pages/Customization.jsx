import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { useBranch } from '../context/BranchContext';

const Customization = () => {
  const { branchId } = useBranch();
  const [activeTab, setActiveTab] = useState('general');
  const [services, setServices] = useState([]);
  const [machinery, setMachinery] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [users, setUsers] = useState([]);
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
      fetchConsumables();
      fetchUsers();
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
      const { data } = await supabase.from('master_machinery').select('*, master_services(service_name)').eq('branch_id', branchId);
      if (data) setMachinery(data || []);
    } catch (error) { console.error('Error fetching machinery:', error); }
  };

  const fetchConsumables = async () => {
    try {
      const { data } = await supabase.from('master_consumables').select('*').eq('branch_id', branchId);
      if (data) setConsumables(data || []);
    } catch (error) { console.error('Error fetching consumables:', error); }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('branch_id', branchId);
      if (data) setUsers(data || []);
    } catch (error) { console.error('Error fetching users:', error); }
  };

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

  const addConsumable = async (e) => {
    e.preventDefault();
    const form = e.target;
    const consumableName = form.consumableName.value;
    const defaultUnit = form.defaultUnit.value;
    if (!consumableName || !defaultUnit) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('master_consumables').insert({ branch_id: branchId, consumable_name: consumableName, default_unit: defaultUnit });
      if (!error) { form.reset(); fetchConsumables(); }
    } catch (error) { console.error('Error adding consumable:', error); }
    setLoading(false);
  };

  const deleteConsumable = async (id) => {
    if (!window.confirm('Delete this consumable?')) return;
    try {
      const { error } = await supabase.from('master_consumables').delete().eq('id', id);
      if (!error) fetchConsumables();
    } catch (error) { console.error('Error deleting consumable:', error); }
  };

  const addUser = async (e) => {
    e.preventDefault();
    const form = e.target;
    const email = form.email.value;
    const fullName = form.fullName.value;
    const role = form.role.value;
    if (!email || !fullName) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').insert({ branch_id: branchId, email, full_name: fullName, role });
      if (!error) { form.reset(); fetchUsers(); }
    } catch (error) { console.error('Error adding user:', error); }
    setLoading(false);
  };

  const deleteUser = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (!error) fetchUsers();
    } catch (error) { console.error('Error deleting user:', error); }
  };

  const saveGeneralSettings = () => {
    alert('Settings saved successfully!');
  };

  const tabs = [
    { id: 'general', label: 'General Settings' },
    { id: 'service', label: 'Service Configuration' },
    { id: 'machinery', label: 'Machinery Mapping' },
    { id: 'users', label: 'User Permissions' },
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
        {activeTab === 'general' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900">General Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Organization Name</label>
                <input
                  type="text"
                  value={generalSettings.organizationName}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, organizationName: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Date Format</label>
                <select
                  value={generalSettings.dateFormat}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, dateFormat: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm"
                >
                  <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                  <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">System Time Zone</label>
                <select
                  value={generalSettings.timeZone}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, timeZone: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">System Base Currency</label>
                <select
                  value={generalSettings.currency}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, currency: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm"
                >
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Default Language</label>
                <select
                  value={generalSettings.language}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, language: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-slate-500">Default Items Per Page</label>
                <input
                  type="number"
                  value={generalSettings.itemsPerPage}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, itemsPerPage: e.target.value })}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <div className="text-sm font-semibold text-slate-900">Enable System Notifications</div>
                <div className="text-xs text-slate-500 mt-0.5">Receive alerts for important system events</div>
              </div>
              <button
                onClick={() => setGeneralSettings({ ...generalSettings, enableNotifications: !generalSettings.enableNotifications })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  generalSettings.enableNotifications ? 'bg-sky-600' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  generalSettings.enableNotifications ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        )}

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

        {activeTab === 'users' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-900">User Permissions</h3>
            <form onSubmit={addUser} className="flex gap-3">
              <input name="fullName" placeholder="Full name" className="flex-1 h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required />
              <input name="email" type="email" placeholder="Email" className="flex-1 h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm" required />
              <select name="role" className="h-9 px-3 border border-slate-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none text-sm">
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
              </select>
              <button type="submit" disabled={loading} className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-semibold shadow-sm disabled:bg-slate-400">Add User</button>
            </form>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {users.map(u => (
                <div key={u.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-sky-300 transition-all">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{u.full_name}</div>
                    <div className="text-xs text-slate-500">{u.email} · {u.role}</div>
                  </div>
                  <button onClick={() => deleteUser(u.id)} className="text-red-600 hover:text-red-700 text-xs font-semibold px-3 py-1.5 rounded hover:bg-red-50 transition-all">Delete</button>
                </div>
              ))}
              {users.length === 0 && <div className="text-center py-8 text-slate-500 text-sm">No users configured</div>}
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