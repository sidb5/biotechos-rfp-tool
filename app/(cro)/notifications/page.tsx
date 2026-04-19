'use client';

// /notifications — CRO in-app notification list (Task 11)
//
// Shows all draft-ready notifications for the logged-in CRO user.
// Clicking a notification marks it read and navigates to the engagement.
// "Mark all read" button clears the badge.

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter }                                from 'next/navigation';
import { supabase }                                 from '@shared/lib/supabase';

interface Notification {
  id:            string;
  engagement_id: string | null;
  draft_id:      string | null;
  type:          string;
  title:         string;
  body_text:     string | null;
  read:          boolean;
  created_at:    string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(true);
  const [markingAll, setMarkingAll]       = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, engagement_id, draft_id, type, title, body_text, read, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setNotifications(data as Notification[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      await load();
    }
    void init();
  }, [load, router]);

  async function handleClick(notif: Notification) {
    // Mark as read
    if (!notif.read) {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    }
    // Navigate to engagement
    if (notif.engagement_id) {
      router.push(`/engagements/${notif.engagement_id}`);
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setMarkingAll(false);
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-5 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            >
              {markingAll ? 'Clearing…' : 'Mark all read'}
            </button>
          )}
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-gray-500 text-sm">No notifications yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              When an AI draft is ready for your review, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(notif => (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left rounded-xl border px-5 py-4 transition-colors ${
                  notif.read
                    ? 'border-gray-200 bg-white hover:bg-gray-50'
                    : 'border-blue-200 bg-blue-50 hover:bg-blue-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Unread dot */}
                  <div className="mt-1.5 shrink-0">
                    {notif.read ? (
                      <div className="h-2 w-2 rounded-full bg-gray-200" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 justify-between">
                      <p className={`text-sm font-medium truncate ${notif.read ? 'text-gray-700' : 'text-blue-900'}`}>
                        {notif.title}
                      </p>
                      <span className="text-[11px] text-gray-400 shrink-0 ml-2">{fmt(notif.created_at)}</span>
                    </div>
                    {notif.body_text && (
                      <p className={`text-xs mt-0.5 ${notif.read ? 'text-gray-500' : 'text-blue-700'}`}>
                        {notif.body_text}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
