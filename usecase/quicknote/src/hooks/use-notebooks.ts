import { useState, useEffect, useCallback } from 'react';
import { getClient } from '../lib/client';
import type { Notebook } from '../types';

export function useNotebooks(userId: string | undefined) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await getClient().tables.rows('notebooks').query<Notebook>({
        filter: `user_id.eq=${userId}`,
        order: 'is_default:desc,title:asc',
      });
      setNotebooks(result.rows);
    } catch (e) {
      console.error('Failed to load notebooks:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (data: { title: string; color?: string }) => {
    if (!userId) return;
    const optimistic: Notebook = {
      id: crypto.randomUUID(),
      user_id: userId,
      title: data.title,
      color: data.color || '#6366f1',
      icon: 'notebook',
      is_default: false,
      description: null,
      note_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setNotebooks((prev) => [...prev, optimistic]);
    try {
      await getClient().tables.rows('notebooks').insert({
        user_id: userId,
        title: data.title,
        color: data.color || '#6366f1',
        icon: 'notebook',
        is_default: false,
      });
      refresh(); // background sync
    } catch {
      setNotebooks((prev) => prev.filter((n) => n.id !== optimistic.id));
    }
  }, [userId, refresh]);

  const update = useCallback(async (id: string, data: { title?: string; color?: string }) => {
    setNotebooks((prev) => prev.map((n) => n.id === id ? { ...n, ...data } : n));
    try {
      await getClient().tables.rows('notebooks').update(id, {
        ...data,
        updated_at: new Date().toISOString(),
      });
    } catch {
      refresh();
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const prev = notebooks;
    setNotebooks((n) => n.filter((nb) => nb.id !== id));
    try {
      await getClient().tables.rows('notebooks').delete(id);
    } catch {
      setNotebooks(prev);
    }
  }, [notebooks, refresh]);

  return { notebooks, loading, refresh, create, update, remove };
}
