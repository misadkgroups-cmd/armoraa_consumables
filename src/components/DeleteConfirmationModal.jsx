import React from 'react';

export default function DeleteConfirmationModal({ open, onClose, onConfirm, item }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold">Confirm Delete</h3>
        <p className="mt-2 text-sm text-gray-600">Are you sure you want to delete <strong>{item?.name}</strong>? This action cannot be undone.</p>
        <div className="mt-4 flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
          <button onClick={() => onConfirm(item)} className="px-4 py-2 bg-red-600 text-white rounded">Delete</button>
        </div>
      </div>
    </div>
  );
}
