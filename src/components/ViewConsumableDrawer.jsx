import React from 'react';

export default function ViewConsumableDrawer({ open, onClose, consumable }) {
  if (!open || !consumable) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{consumable.name}</h3>
          <button onClick={onClose} className="text-gray-500">Close</button>
        </div>
        <div className="mt-4 space-y-2">
          <div><strong>Category:</strong> {consumable.category}</div>
          <div><strong>Type:</strong> {consumable.type}</div>
          <div><strong>Unit Price:</strong> ${Number(consumable.unitPrice).toFixed(2)}</div>
          <div><strong>Stock:</strong> {consumable.stock}</div>
          <div><strong>Service:</strong> {consumable.service}</div>
          <div><strong>Status:</strong> {consumable.status}</div>
          <div><strong>Description:</strong> {consumable.description}</div>
          <div><strong>Created By:</strong> {consumable.createdBy}</div>
          <div><strong>Created At:</strong> {new Date(consumable.createdAt).toLocaleString()}</div>
          <div><strong>Updated At:</strong> {new Date(consumable.updatedAt).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
