import React from 'react';
import { FiBox, FiActivity, FiAlertCircle, FiDollarSign } from 'react-icons/fi';

export default function StatisticsCards({ stats = {} }) {
  const cards = [
    { key: 'total', title: 'Total Consumables', icon: <FiBox className="text-2xl" />, value: stats.total || 0 },
    { key: 'active', title: 'Active Consumables', icon: <FiActivity className="text-2xl" />, value: stats.active || 0 },
    { key: 'outOfStock', title: 'Out Of Stock', icon: <FiAlertCircle className="text-2xl" />, value: stats.outOfStock || 0 },
    { key: 'revenue', title: 'Monthly Revenue', icon: <FiDollarSign className="text-2xl" />, value: stats.monthlyRevenue ? `$${stats.monthlyRevenue}` : '$0' },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.key} className="bg-white rounded-lg shadow hover:shadow-md transition p-4 flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 rounded-md text-indigo-600">{c.icon}</div>
          <div>
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-sm text-gray-500">{c.title}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
