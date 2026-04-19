'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@shared/lib/supabase';

interface PendingItem {
  engagementId:  string;
  croName:       string;
  croEmail:      string;
  briefTitle:    string | null;
  draftId:       string;
  draftSubject:  string | null;
  draftPreview:  string;
  receivedAt:    string;
  inboundBody:   string;
}

function timeAgo(iso: string): string {
  const ms   = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  const hrs  = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ActionsNeededPage() {
  const router = useRouter();
  const [items, setItems]   = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Fetch all engagements belonging to this user (no stage filter — drafts can exist at any stage)
      const { data: engagements } = await supabase
        .from('cro_engagements')
        .select('id, cro_name, cro_email, capture_mode, rfp_internal_briefs(title)')
        .eq('user_id', user.id);

      if (!engagements?.length) { setLoading(false); return; }

      const engagementIds = engagements.map(e => e.id);

      // Fetch the most recent AI-generated outbound message per engagement (all statuses).
      // We check the LATEST one — if it's still 'draft', the engagement needs action.
      // If the latest was already sent/approved/superseded, the item is resolved and should
      // not appear, even if an older stale draft technically still has status='draft'.
      const { data: allAiMsgs } = await supabase
        .from('engagement_messages')
        .select('id, engagement_id, subject, body, status, created_at')
        .in('engagement_id', engagementIds)
        .eq('direction', 'outbound')
        .eq('ai_generated', true)
        .order('created_at', { ascending: false });

      // Map: engagementId → most-recent AI message (first entry per engagement, since ordered desc)
      const latestAiMap = new Map<string, { id: string; subject: string | null; body: string | null; status: string; created_at: string }>();
      for (const m of allAiMsgs ?? []) {
        if (!latestAiMap.has(m.engagement_id)) {
          latestAiMap.set(m.engagement_id, m);
        }
      }

      // Only surface engagements where the most recent AI draft is still pending
      const pendingEngagementIds = [...latestAiMap.entries()]
        .filter(([, m]) => m.status === 'draft')
        .map(([id]) => id);

      if (!pendingEngagementIds.length) { setLoading(false); return; }

      // Fetch the inbound messages that triggered these drafts (most recent inbound per engagement)
      const { data: inbounds } = await supabase
        .from('engagement_messages')
        .select('engagement_id, body, created_at')
        .in('engagement_id', pendingEngagementIds)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false });

      // Map: engagementId → latest inbound
      const inboundMap = new Map<string, { body: string; created_at: string }>();
      for (const m of inbounds ?? []) {
        if (!inboundMap.has(m.engagement_id)) {
          inboundMap.set(m.engagement_id, { body: m.body ?? '', created_at: m.created_at });
        }
      }

      // Map: engagementId → engagement
      const engMap = new Map(engagements.map(e => [e.id, e]));

      // Build result: one item per engagement that has a pending latest draft
      const result: PendingItem[] = [];
      for (const engagementId of pendingEngagementIds) {
        const eng   = engMap.get(engagementId);
        const draft = latestAiMap.get(engagementId);
        if (!eng || !draft) continue;
        const inbound = inboundMap.get(engagementId);
        result.push({
          engagementId,
          croName:      eng.cro_name,
          croEmail:     eng.cro_email,
          briefTitle:   (eng as unknown as { rfp_internal_briefs?: { title: string | null } }).rfp_internal_briefs?.title ?? null,
          draftId:      draft.id,
          draftSubject: draft.subject,
          draftPreview: (draft.body ?? '').slice(0, 160).replace(/\n/g, ' '),
          receivedAt:   inbound?.created_at ?? draft.created_at,
          inboundBody:  (inbound?.body ?? '').slice(0, 200).replace(/\n/g, ' '),
        });
      }

      // Sort by receivedAt descending (most recent first)
      result.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

      // Mark notifications read now that user is on this page
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      setItems(result);
      setLoading(false);
    }
    void load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-3xl px-5 py-10 space-y-6">

        <header>
          <nav className="mb-1.5 text-xs text-gray-500">
            <a href="/biotech/dashboard" className="hover:text-gray-700 transition-colors">Dashboard</a>
            <span className="mx-1.5">/</span>
            <span className="text-gray-700">Actions Needed</span>
          </nav>
          <h1 className="text-2xl font-semibold text-gray-900">Actions Needed</h1>
          <p className="mt-1 text-sm text-gray-500">
            CRO replies with AI-drafted responses waiting for your approval.
          </p>
        </header>

        {items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
              <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">All clear</p>
            <p className="text-xs text-gray-400 mt-1">No pending draft approvals right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div
                key={item.engagementId}
                onClick={() => router.push(`/biotech/engagements/${item.engagementId}`)}
                className="cursor-pointer rounded-xl border border-blue-100 bg-white shadow-sm hover:border-blue-300 hover:shadow-md transition-all overflow-hidden"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">
                      AI
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.croName}</p>
                      <p className="text-xs text-gray-400 truncate">{item.croEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.briefTitle && (
                      <span className="text-[11px] text-gray-400 hidden sm:block max-w-[140px] truncate">
                        {item.briefTitle}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{timeAgo(item.receivedAt)}</span>
                    <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      Reply received
                    </span>
                  </div>
                </div>

                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Inbound snippet */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                      Their reply
                    </p>
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                      {item.inboundBody || '(no preview)'}
                    </p>
                  </div>

                  {/* AI draft snippet */}
                  <div className="border-t sm:border-t-0 sm:border-l border-gray-100 sm:pl-4 pt-3 sm:pt-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-500 mb-1.5">
                      AI draft reply
                    </p>
                    {item.draftSubject && (
                      <p className="text-[11px] font-medium text-gray-500 mb-1 truncate">
                        {item.draftSubject}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
                      {item.draftPreview || '(generating…)'}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Click to review, edit &amp; approve</span>
                  <span className="text-xs font-medium text-blue-600">Review draft →</span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
