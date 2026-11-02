"use client";

import { API_URL } from "@/lib/config";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import ShareModal from "@/components/document/ShareModal";
import { ArrowLeft, Users, Loader2, Edit3, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NotificationBell } from "@/components/ui/NotificationBell";
import axios from "axios";

// The editor (Tiptap, Yjs, etc.) is large and browser-only: load it on demand, not in the initial bundle.
const TiptapEditor = dynamic(() => import("@/components/editor/TiptapEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[70vh] w-full items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  ),
});

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("Loading...");
  const [role, setRole] = useState<string>("viewer"); // read-only until the server confirms the real role
  const [collaborators, setCollaborators] = useState<{ userId: string; email: string; role: "editor" | "viewer"; addedAt: string }[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user === null) {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) {
        router.push("/login");
      }
    }
  }, [user, router]);

  useEffect(() => {
    if (!user?.token || !id) return;

    const fetchDocument = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/documents/${id}`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        setTitle(res.data.title);
        setRole(res.data.role);
        setCollaborators(res.data.collaborators || []);
      } catch (error) {
        console.error("Failed to fetch document", error);
        setTitle("Untitled Document");
      }
    };

    fetchDocument();
  }, [user, id]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleSubmit = async () => {
    setIsEditingTitle(false);
    if (!user?.token || role === 'viewer') return;
    
    setIsSavingTitle(true);
    try {
      await axios.put(`${API_URL}/api/documents/${id}`, 
        { title: title.trim() || "Untitled Document" },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      if (!title.trim()) setTitle("Untitled Document");
    } catch (error) {
      console.error("Failed to update title", error);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  const canEditTitle = role !== 'viewer';

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 flex flex-col">
      {/* Document Header */}
      <header className="sticky top-0 z-50 px-4 py-3 bg-(--glass-bg) backdrop-blur-md border-b border-(--glass-border) shadow-md animate-fade-in">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              title="Back to Dashboard"
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="h-6 w-px bg-slate-700/50"></div>
            <div className="flex items-center gap-2 group">
              {isEditingTitle && canEditTitle ? (
                <div className="relative flex items-center">
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={handleTitleSubmit}
                    onKeyDown={handleKeyDown}
                    className="bg-slate-800 text-white font-heading font-semibold text-lg px-3 py-1 rounded-md border-2 border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 w-64 shadow-inner"
                  />
                </div>
              ) : (
                <div 
                  onClick={() => canEditTitle && setIsEditingTitle(true)}
                  className={`flex items-center gap-2 px-3 py-1 rounded-md transition-colors border border-transparent ${canEditTitle ? 'cursor-pointer hover:bg-slate-800/60 hover:border-slate-700' : ''}`}
                >
                  <h1 className="font-heading font-semibold text-lg text-white max-w-50 sm:max-w-md truncate">
                    {title}
                  </h1>
                  {canEditTitle && (
                    <Edit3 className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                  {isSavingTitle && <Loader2 className="w-3 h-3 text-primary animate-spin" />}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            {role === 'owner' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsShareModalOpen(true)}
                className="gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            )}
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-md">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></div>
              <span className="text-xs font-bold text-emerald-400 tracking-wider">LIVE</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-slate-400 ml-2">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Collaborating</span>
            </div>
          </div>
        </div>
      </header>

      {/* Editor Content */}
      <main className="grow max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8 animate-slide-up">
        <div className="bg-(--glass-bg) backdrop-blur-sm border border-(--glass-border) rounded-lg shadow-2xl h-[calc(100vh-8rem)] overflow-hidden">
          <TiptapEditor documentId={id} role={role} collaborators={collaborators} />
        </div>
      </main>

      <ShareModal
        documentId={id}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        collaborators={collaborators}
        onCollaboratorsChange={setCollaborators}
      />
    </div>
  );
}
