import api from './httpClient';

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
  // Already a processed 503 error from httpClient interceptor
  if (e.status === 503) throw e;
  if (e.response) throw e.response.data || e.response;
  throw e;
}

export async function getConsumables(params = {}) {
  try {
    const res = await api.get('/billable-consumables', { params });
    return res.data;
  } catch (e) {
    // Fallback to mock data when server is unreachable (including 503 after retries exhausted)
    if (e.status === 503) {
      console.warn('getConsumables: Server 503 — using mock data');
    }
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
    if (e.status === 503) {
      console.warn('getConsumable: Server 503 — falling back to mock');
    }
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
    if (e.status === 503) {
      console.warn('createConsumable: Server 503 — saving locally as mock');
    }
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
    if (e.status === 503) {
      console.warn('updateConsumable: Server 503 — updating mock instead');
    }
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
    if (e.status === 503) {
      console.warn('deleteConsumable: Server 503 — removing from mock only');
    }
    mockConsumables = mockConsumables.filter((c) => c.id !== String(id));
    return { success: true };
  }
}

export function getMockConsumables() {
  return mockConsumables.slice();
}
