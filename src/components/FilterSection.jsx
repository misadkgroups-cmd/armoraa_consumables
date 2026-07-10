import React, { useState, useEffect } from 'react';

export default function FilterSection({ filters, setFilters, searchTerm, setSearchTerm, onApply, onReset }) {
  const [local, setLocal] = useState({ ...filters });

  useEffect(() => setLocal({ ...filters }), [filters]);

  function handleChange(e) {
    const { name, value } = e.target;
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
        <select name="category" value={local.category} onChange={handleChange} className="border rounded p-2">
          <option value="">All Categories</option>
          <option value="Supplies">Supplies</option>
          <option value="Apparel">Apparel</option>
        </select>
        <select name="type" value={local.type} onChange={handleChange} className="border rounded p-2">
          <option value="">All Types</option>
          <option value="Disposable">Disposable</option>
          <option value="Single-use">Single-use</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
        <select name="status" value={local.status} onChange={handleChange} className="border rounded p-2">
          <option value="">Any Status</option>
          <option value="active">Active</option>
          <option value="out_of_stock">Out Of Stock</option>
        </select>
        <select name="service" value={local.service} onChange={handleChange} className="border rounded p-2">
          <option value="">All Services</option>
          <option value="General">General</option>
          <option value="Surgery">Surgery</option>
        </select>
        <div className="flex items-center space-x-2">
          <button onClick={apply} className="px-4 py-2 bg-indigo-600 text-white rounded">Apply Filters</button>
          <button onClick={reset} className="px-4 py-2 border rounded">Reset</button>
        </div>
      </div>
    </div>
  );
}
