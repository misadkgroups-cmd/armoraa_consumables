import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Mock data fallback for development/demo
let mockConsumables = [
  {
    id: '1',
    name: 'Syringe 5ml',
    category: 'Supplies',
    type: 'Single-use',
    description: 'Sterile disposable syringe',
    unitPrice: 0.5,
    stock: 120,
    service: 'General',
    status: 'active',
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Gloves (M)',
    category: 'Apparel',
    type: 'Disposable',
    description: 'Medical examination gloves',
    unitPrice: 0.2,
    stock: 0,
    service: 'Surgery',
    status: 'out_of_stock',
    createdBy: 'procurement',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function handleError(e) {
  if (e.response) throw e.response.data || e.response;
  throw e;
}

export async function getConsumables(params = {}) {
  try {
    const res = await api.get('/billable-consumables', { params });
    return res.data;
  } catch (e) {
    // fallback to mock
    return {
      data: mockConsumables,
      total: mockConsumables.length,
    };
  }
}

export async function getConsumable(id) {
  try {
    const res = await api.get(`/billable-consumables/${id}`);
    return res.data;
  } catch (e) {
    const found = mockConsumables.find((c) => c.id === String(id));
    if (!found) throw handleError(e);
    return found;
  }
}

export async function createConsumable(payload) {
  try {
    const res = await api.post('/billable-consumables', payload);
    return res.data;
  } catch (e) {
    const item = { ...payload, id: String(Date.now()), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mockConsumables.unshift(item);
    return item;
  }
}

export async function updateConsumable(id, payload) {
  try {
    const res = await api.put(`/billable-consumables/${id}`, payload);
    return res.data;
  } catch (e) {
    const idx = mockConsumables.findIndex((c) => c.id === String(id));
    if (idx === -1) throw handleError(e);
    mockConsumables[idx] = { ...mockConsumables[idx], ...payload, updatedAt: new Date().toISOString() };
    return mockConsumables[idx];
  }
}

export async function deleteConsumable(id) {
  try {
    const res = await api.delete(`/billable-consumables/${id}`);
    return res.data;
  } catch (e) {
    mockConsumables = mockConsumables.filter((c) => c.id !== String(id));
    return { success: true };
  }
}

export function getMockConsumables() {
  return mockConsumables.slice();
}
