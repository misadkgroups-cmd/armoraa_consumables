import React, { useState } from 'react';
import SearchableDropdown from './SearchableDropdown';

export default function AddConsumableModal({ open, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', category: '', type: '', description: '', unitPrice: '', stock: '', service: '', status: 'active' });
  const [errors, setErrors] = useState({});

  if (!open) return null;

  function change(name, value) {
    setForm((s) => ({ ...s, [name]: value }));
  }

  function validate() {
    const e = {};
    if (!form.name) e.name = 'Name is required';
    if (!form.unitPrice || isNaN(Number(form.unitPrice))) e.unitPrice = 'Price must be numeric';
    if (form.stock === '' || Number(form.stock) < 0) e.stock = 'Stock cannot be negative';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    const payload = { ...form, unitPrice: Number(form.unitPrice), stock: Number(form.stock) };
    await onSave(payload);
    setForm({ name: '', category: '', type: '', description: '', unitPrice: '', stock: '', service: '', status: 'active' });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl p-6">
        <h3 className="text-lg font-semibold">Add Consumable</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <input name="name" value={form.name} onChange={change} placeholder="Consumable Name" className="border p-2 rounded" />
          <input name="category" value={form.category} onChange={change} placeholder="Category" className="border p-2 rounded" />
          <input name="type" value={form.type} onChange={change} placeholder="Type" className="border p-2 rounded" />
          <input name="service" value={form.service} onChange={change} placeholder="Service" className="border p-2 rounded" />
          <input name="unitPrice" value={form.unitPrice} onChange={change} placeholder="Unit Price" className="border p-2 rounded" />
          <input name="stock" value={form.stock} onChange={change} placeholder="Stock Quantity" className="border p-2 rounded" />
          <SearchableDropdown value={form.status} onChange={(val) => change('status', val)} options={[{value:'active',label:'Active'},{value:'out_of_stock',label:'Out Of Stock'}]} placeholder="Select status" displayKey="label" valueKey="value" />
          <textarea name="description" value={form.description} onChange={change} placeholder="Description" className="border p-2 rounded md:col-span-2" />
        </div>
        <div className="flex justify-end space-x-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
          <button onClick={submit} className="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
        </div>
      </div>
    </div>
  );
}
