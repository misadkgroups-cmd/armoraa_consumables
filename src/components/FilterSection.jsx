import React, { useState, useEffect } from 'react';
import SearchableDropdown from './SearchableDropdown';

export default function FilterSection({ filters, setFilters, searchTerm, setSearchTerm, onApply, onReset }) {
  const [local, setLocal] = useState({ ...filters });

  useEffect(() => setLocal({ ...filters }), [filters]);

  function handleChange(name, value) {
    setLocal((s) => ({ ...s, [name]: value }));
  }

  function apply() {
    setFilters(local);
    onApply && onApply();
  }

  function reset() {
    const empty = { category: '', type: '', status: '', service: '' };
    setLocal(empty);
    setSearchTerm('');
    setFilters(empty);
    onReset && onReset();
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search consumables" className="border rounded p-2" />
        <SearchableDropdown value={local.category} onChange={(val) => handleChange('category', val)} options={[{value:'',label:'All Categories'},{value:'Supplies',label:'Supplies'},{value:'Apparel',label:'Apparel'}]} placeholder="All Categories" displayKey="label" valueKey="value" />
        <SearchableDropdown value={local.type} onChange={(val) => handleChange('type', val)} options={[{value:'',label:'All Types'},{value:'Disposable',label:'Disposable'},{value:'Single-use',label:'Single-use'}]} placeholder="All Types" displayKey="label" valueKey="value" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
        <SearchableDropdown value={local.status} onChange={(val) => handleChange('status', val)} options={[{value:'',label:'Any Status'},{value:'active',label:'Active'},{value:'out_of_stock',label:'Out Of Stock'}]} placeholder="Any Status" displayKey="label" valueKey="value" />
        <SearchableDropdown value={local.service} onChange={(val) => handleChange('service', val)} options={[{value:'',label:'All Services'},{value:'General',label:'General'},{value:'Surgery',label:'Surgery'}]} placeholder="All Services" displayKey="label" valueKey="value" />
        <div className="flex items-center space-x-2">
          <button onClick={apply} className="px-4 py-2 bg-indigo-600 text-white rounded">Apply Filters</button>
          <button onClick={reset} className="px-4 py-2 border rounded">Reset</button>
        </div>
      </div>
    </div>
  );
}
