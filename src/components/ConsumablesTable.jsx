import React from 'react';
import { FiEye, FiEdit, FiTrash2 } from 'react-icons/fi';

function TableHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  const dir = active ? sort.dir : null;
  return (
    <th className="px-4 py-2 text-left cursor-pointer" onClick={() => onSort(sortKey)}>
      <div className="flex items-center space-x-2">
        <span>{label}</span>
        {active && <span className="text-sm text-gray-400">{dir === 'asc' ? '▲' : '▼'}</span>}
      </div>
    </th>
  );
}

export default function ConsumablesTable({ loading, data = [], onView, onEdit, onDelete, pagination, setPagination, total, sort, setSort }) {
  function changeSort(key) {
    if (sort.key === key) setSort({ key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
    else setSort({ key, dir: 'asc' });
  }

  return (
    <div className="bg-white rounded shadow overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <TableHeader label="Consumable Name" sortKey="name" sort={sort} onSort={changeSort} />
            <TableHeader label="Category" sortKey="category" sort={sort} onSort={changeSort} />
            <TableHeader label="Type" sortKey="type" sort={sort} onSort={changeSort} />
            <TableHeader label="Unit Price" sortKey="unitPrice" sort={sort} onSort={changeSort} />
            <TableHeader label="Available Stock" sortKey="stock" sort={sort} onSort={changeSort} />
            <TableHeader label="Service" sortKey="service" sort={sort} onSort={changeSort} />
            <TableHeader label="Status" sortKey="status" sort={sort} onSort={changeSort} />
            <TableHeader label="Created Date" sortKey="createdAt" sort={sort} onSort={changeSort} />
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={9} className="p-8 text-center">Loading...</td>
            </tr>
          )}
          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={9} className="p-8 text-center text-gray-500">No consumables found.</td>
            </tr>
          )}
          {!loading && data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-4 py-2">{row.name}</td>
              <td className="px-4 py-2">{row.category}</td>
              <td className="px-4 py-2">{row.type}</td>
              <td className="px-4 py-2">${Number(row.unitPrice).toFixed(2)}</td>
              <td className="px-4 py-2">{row.stock}</td>
              <td className="px-4 py-2">{row.service}</td>
              <td className="px-4 py-2">{row.status}</td>
              <td className="px-4 py-2">{new Date(row.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-2">
                <div className="flex items-center space-x-2">
                  <button onClick={() => onView(row)} className="p-2 rounded hover:bg-gray-100" title="View"><FiEye /></button>
                  <button onClick={() => onEdit(row)} className="p-2 rounded hover:bg-gray-100" title="Edit"><FiEdit /></button>
                  <button onClick={() => onDelete(row)} className="p-2 rounded hover:bg-red-50 text-red-600" title="Delete"><FiTrash2 /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between p-4 border-t">
        <div className="text-sm text-gray-600">Showing {data.length} of {total}</div>
        <div className="flex items-center space-x-2">
          <button disabled={pagination.page === 1} onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })} className="px-3 py-1 border rounded">Prev</button>
          <div className="px-3 py-1 border rounded">{pagination.page}</div>
          <button disabled={pagination.page * pagination.perPage >= total} onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })} className="px-3 py-1 border rounded">Next</button>
        </div>
      </div>
    </div>
  );
}
