'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudyWinRate {
  study_type: string;
  win_rate: number;   // 0–100
  total: number;
}

export interface AssayWinRate {
  assay_type: string;
  win_rate: number;
  total: number;
}

export interface LossReasonItem {
  name: string;
  value: number;
}

export interface MonthlyTrend {
  month: string; // "Jan 25"
  created: number;
  won: number;
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const LOSS_COLORS = ['#ef4444','#f97316','#eab308','#8b5cf6','#06b6d4','#10b981','#6b7280'];

// ─── Win Rate by Study Type ───────────────────────────────────────────────────

export function StudyWinRateChart({ data }: { data: StudyWinRate[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Not enough data yet — needs proposals with at least 2 per study type.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="study_type"
          tick={{ fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip formatter={(v) => [`${v}%`, 'Win rate']} />
        <Bar dataKey="win_rate" fill="#16a34a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Win Rate by Assay Type ───────────────────────────────────────────────────

export function AssayWinRateChart({ data }: { data: AssayWinRate[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Not enough data yet — needs proposals with at least 2 per assay type.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="assay_type"
          tick={{ fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
        <Tooltip formatter={(v) => [`${v}%`, 'Win rate']} />
        <Bar dataKey="win_rate" fill="#2563eb" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Loss Reasons Donut ───────────────────────────────────────────────────────

export function LossReasonsChart({ data }: { data: LossReasonItem[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Needs at least 3 lost proposals to display.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={LOSS_COLORS[i % LOSS_COLORS.length]} />
          ))}
        </Pie>
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => [v, 'Proposals']} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Monthly Trend ────────────────────────────────────────────────────────────

export function MonthlyTrendChart({ data }: { data: MonthlyTrend[] }) {
  if (data.every(d => d.created === 0)) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No proposals recorded yet in the last 12 months.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="created" name="Created" stroke="#6b7280" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="won"     name="Won"     stroke="#16a34a" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
