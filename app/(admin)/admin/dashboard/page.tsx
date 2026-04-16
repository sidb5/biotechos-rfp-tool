'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  total_users: number;
  cro_users: number;
  biotech_users: number;
  paid_subscriptions: number;
  emails_this_month: number;
  recent_signups: Array<{
    id: string;
    email: string;
    user_type: string;
    created_at: string;
  }>;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) throw new Error('Failed to load stats');
        setStats(await res.json());
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <svg className="h-6 w-6 animate-spin text-red-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  if (!stats) return null;

  const cards = [
    { label: 'Total users',         value: stats.total_users,         color: 'text-gray-900' },
    { label: 'CRO users',           value: stats.cro_users,           color: 'text-green-700' },
    { label: 'Biotech users',       value: stats.biotech_users,       color: 'text-blue-700' },
    { label: 'Paid subscriptions',  value: stats.paid_subscriptions,  color: 'text-purple-700' },
    { label: 'Emails this month',   value: stats.emails_this_month,   color: 'text-amber-700' },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Platform overview</p>
      </header>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-medium">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent signups */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent signups</h2>
          <Link href="/admin/users" className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors">
            View all users →
          </Link>
        </div>
        {stats.recent_signups.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500">No users yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_signups.map(user => (
                <tr key={user.id} className="border-b border-gray-50">
                  <td className="px-5 py-3 text-gray-900">{user.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      user.user_type === 'biotech'
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-green-50 border-green-200 text-green-700'
                    }`}>
                      {user.user_type === 'biotech' ? 'Biotech' : 'CRO'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
