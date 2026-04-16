'use client';

import { useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  user_type: string;
  company_name: string | null;
  plan: string;
  subscription_status: string | null;
  created_at: string;
}

type TypeFilter = 'all' | 'cro' | 'biotech';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [planOverride, setPlanOverride] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    loadUsers();
  }, [typeFilter]);

  async function loadUsers() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error('Failed to load users');
      const json = await res.json();
      setUsers(json.users ?? []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePlan() {
    if (!selectedUser || !planOverride) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUser.id, plan: planOverride }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Failed to update');
      }
      setSaveMsg('Plan updated');
      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === selectedUser.id ? { ...u, plan: planOverride, subscription_status: 'active' } : u
      ));
      setSelectedUser(prev => prev ? { ...prev, plan: planOverride, subscription_status: 'active' } : null);
    } catch (err) {
      setSaveMsg(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  const searchLower = search.trim().toLowerCase();
  const filtered = users.filter(u => {
    if (!searchLower) return true;
    return (u.email ?? '').toLowerCase().includes(searchLower)
      || (u.company_name ?? '').toLowerCase().includes(searchLower);
  });

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">{users.length} registered users</p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['all', 'cro', 'biotech'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              } ${t !== 'all' ? 'border-l border-gray-200' : ''}`}
            >
              {t === 'all' ? 'All' : t === 'cro' ? 'CRO' : 'Biotech'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email or company…"
          className="flex-1 min-w-[200px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-6">
        {/* User table */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500">No users found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Company</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Plan</th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr
                    key={user.id}
                    onClick={() => { setSelectedUser(user); setPlanOverride(user.plan); setSaveMsg(''); }}
                    className={`cursor-pointer transition-colors border-b border-gray-50 ${
                      selectedUser?.id === user.id ? 'bg-red-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-900 font-medium">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        user.user_type === 'biotech'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-green-50 border-green-200 text-green-700'
                      }`}>
                        {user.user_type === 'biotech' ? 'Biotech' : 'CRO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.company_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        user.plan === 'pro' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                        user.plan === 'starter' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                        'bg-gray-100 border-gray-200 text-gray-500'
                      }`}>
                        {user.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selectedUser && (
          <aside className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 p-5 space-y-4 self-start sticky top-6">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">User details</p>
              <p className="text-sm font-semibold text-gray-900 mt-2">{selectedUser.email}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedUser.user_type === 'biotech' ? 'Biotech' : 'CRO'}
                {selectedUser.company_name && ` · ${selectedUser.company_name}`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Joined {new Date(selectedUser.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500 font-medium mb-2">Subscription override</p>
              <select
                value={planOverride}
                onChange={e => { setPlanOverride(e.target.value); setSaveMsg(''); }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                <option value="free">Free</option>
                <option value="starter">Starter ($99/mo)</option>
                <option value="pro">Pro ($249/mo)</option>
              </select>
              <button
                onClick={handleSavePlan}
                disabled={saving || planOverride === selectedUser.plan}
                className="mt-2 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Apply plan change'}
              </button>
              {saveMsg && (
                <p className={`mt-2 text-xs ${saveMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMsg}
                </p>
              )}
              {selectedUser.subscription_status && (
                <p className="mt-2 text-xs text-gray-400">
                  Current status: {selectedUser.subscription_status}
                </p>
              )}
            </div>

            <button
              onClick={() => setSelectedUser(null)}
              className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors pt-2 border-t border-gray-100"
            >
              Close panel
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
