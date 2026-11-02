"use client";

import { API_URL } from "@/lib/config";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { Bell, Check } from "lucide-react";
import { useRouter } from "next/navigation";

interface Notification {
  _id: string;
  type: "mention" | "comment" | "share";
  read: boolean;
  documentId: { _id: string; title: string };
  fromUserId: { _id: string; email: string };
  createdAt: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const token = user?.token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const fetchNotifications = async () => {
      if (document.hidden) return; // don't poll from background tabs
      try {
        const res = await axios.get(`${API_URL}/api/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setNotifications(res.data);
      } catch (error) {
        console.error("Failed to fetch notifications", error);
      }
    };

    void fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    const onVisible = () => void fetchNotifications();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await axios.patch(
        `${API_URL}/api/notifications/${id}/read`,
        {},
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      setNotifications(notifications.map(n => n._id === id ? { ...n, read: true } : n));
    } catch (error) {
      console.error("Failed to mark as read", error);
    }
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.patch(
        `${API_URL}/api/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error("Failed to mark all as read", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      handleMarkAsRead(notification._id);
    }
    setIsOpen(false);
    if (notification.documentId) {
      router.push(`/document/${notification.documentId._id}`);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-md transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-(--glass-bg)"></span>
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-(--glass-bg) border border-(--glass-border) rounded-lg shadow-2xl z-50 animate-slide-up backdrop-blur-xl">
            <div className="p-3 border-b border-(--glass-border) flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-xl">
              <h3 className="font-bold text-white text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-primary-400 hover:text-primary transition-colors flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Mark all as read
                </button>
              )}
            </div>
            <div className="flex flex-col">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n._id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 border-b border-(--glass-border) last:border-0 cursor-pointer transition-colors flex items-start gap-3 hover:bg-slate-800/40 ${
                      n.read ? "opacity-70" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200">
                        <span className="font-semibold text-white">{n.fromUserId?.email.split('@')[0]}</span>{" "}
                        {n.type === "mention" && "mentioned you in"}
                        {n.type === "comment" && "commented on"}
                        {n.type === "share" && "shared"}
                        {" "}
                        <span className="font-semibold text-white truncate">{n.documentId?.title}</span>
                      </p>
                      <span className="text-xs text-slate-500 mt-1 block">
                        {new Date(n.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
