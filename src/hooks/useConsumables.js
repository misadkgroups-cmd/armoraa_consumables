import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../services/consumablesApi';

export default function useConsumables() {
  const [loading, setLoading] = useState(false);
  const [consumables, setConsumables] = useState([]);
  const [selectedConsumable, setSelectedConsumable] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ category: '', type: '', status: '', service: '' });
  const [pagination, setPagination] = useState({ page: 1, perPage: 10 });
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' });

  const fetchConsumables = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getConsumables();
      const data = res.data || res;
      setConsumables(data);
    } catch (e) {
      console.error('Failed to load consumables', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsumables();
  }, [fetchConsumables]);

  const filteredConsumables = useMemo(() => {
    let data = consumables.slice();
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      data = data.filter((c) => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
    }
    Object.keys(filters).forEach((k) => {
      if (filters[k]) data = data.filter((c) => String(c[k] || '').toLowerCase() === String(filters[k]).toLowerCase());
    });
    if (sort?.key) {
      data.sort((a, b) => {
        const A = a[sort.key];
        const B = b[sort.key];
        if (A == null) return 1;
        if (B == null) return -1;
        if (typeof A === 'number') return sort.dir === 'asc' ? A - B : B - A;
        return sort.dir === 'asc' ? String(A).localeCompare(String(B)) : String(B).localeCompare(String(A));
      });
    }
    return data;
  }, [consumables, searchTerm, filters, sort]);

  const total = filteredConsumables.length;
  const totalPages = Math.max(1, Math.ceil(total / pagination.perPage));

  const paginated = useMemo(() => {
    const start = (pagination.page - 1) * pagination.perPage;
    return filteredConsumables.slice(start, start + pagination.perPage);
  }, [filteredConsumables, pagination]);

  const create = useCallback(async (payload) => {
    setLoading(true);
    try {
      const created = await api.createConsumable(payload);
      setConsumables((s) => [created, ...s]);
      return created;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (id, payload) => {
    setLoading(true);
    try {
      const updated = await api.updateConsumable(id, payload);
      setConsumables((s) => s.map((it) => (it.id === updated.id ? updated : it)));
      return updated;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id) => {
    setLoading(true);
    try {
      await api.deleteConsumable(id);
      setConsumables((s) => s.filter((it) => it.id !== String(id)));
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => fetchConsumables(), [fetchConsumables]);

  return {
    loading,
    consumables,
    filteredConsumables,
    paginated,
    total,
    totalPages,
    pagination,
    setPagination,
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    selectedConsumable,
    setSelectedConsumable,
    sort,
    setSort,
    fetchConsumables,
    create,
    update,
    remove,
    refresh,
  };
}
