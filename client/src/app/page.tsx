"use client";

import { API_URL } from "@/lib/config";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Plus, Search, FileText, Loader2, Sparkles, Trash2, Users, LayoutGrid, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, Role } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { useToast } from "@/components/ui/Toast";
import { getErrorMessage } from "@/lib/errors";

interface Collaborator {
  userId: string;
  email?: string;
  role: string;
}

interface FolderType { _id: string; name: string; }

interface DocumentType {
  _id: string;
  title: string;
  updatedAt: string;
  role: string;
  collaborators?: Collaborator[];
  folderId?: string;
  tags?: string[];
}

type ViewMode = "all" | "shared";

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentType[] | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (user === null) {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) {
        router.push("/login");
      }
    }
  }, [user, router]);

  useEffect(() => {
    if (!user?.token) return;

    const fetchDocuments = async () => {
      try {
        const [docsRes, foldersRes] = await Promise.all([
          axios.get(`${API_URL}/api/documents`, { headers: { Authorization: `Bearer ${user.token}` } }),
          axios.get(`${API_URL}/api/folders`, { headers: { Authorization: `Bearer ${user.token}` } })
        ]);
        setDocuments(docsRes.data);
        setFolders(foldersRes.data);
        setLoadError(null);
      } catch (error) {
        console.error("Failed to fetch documents", error);
        setLoadError(getErrorMessage(error, "Could not reach the server. Check that the API is running and try again."));
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [user]);

  useEffect(() => {
    if (!searchQuery) return;
    const timer = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_URL}/api/documents/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${user?.token}` }
        });
        setSearchResults(res.data);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, user?.token]);

  const handleCreateFolder = async () => {
    const name = prompt("Folder name:");
    if (!name || !user?.token) return;
    try {
      const res = await axios.post(`${API_URL}/api/folders`, { name }, { headers: { Authorization: `Bearer ${user.token}` } });
      setFolders([...folders, res.data]);
    } catch (e) {
      toast(getErrorMessage(e, "Failed to create folder"), "error");
    }
  };

  const handleMoveToFolder = async (e: React.SyntheticEvent, docId: string, folderId: string | null) => {
    e.stopPropagation();
    try {
      await axios.put(`${API_URL}/api/documents/${docId}/move`, { folderId }, { headers: { Authorization: `Bearer ${user?.token}` } });
      setDocuments(docs => docs.map(d => d._id === docId ? { ...d, folderId: folderId || undefined } : d));
    } catch (e) {
      toast(getErrorMessage(e, "Failed to move document"), "error");
    }
  };

  const handleCreateDocument = async () => {
    if (!user?.token) return;
    setCreating(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/documents`,
        { title: "Untitled Document", folderId: activeFolderId },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      router.push(`/document/${res.data._id}`);
    } catch (error) {
      toast(getErrorMessage(error, "Failed to create document"), "error");
      setCreating(false);
    }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    if (!user?.token) return;
    
    if (!window.confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/api/documents/${id}`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setDocuments(docs => docs.filter(doc => doc._id !== id));
    } catch (error) {
      toast(getErrorMessage(error, "Failed to delete document"), "error");
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  const baseDocs = searchQuery && searchResults !== null ? searchResults : documents;
  const displayedDocs = baseDocs.filter((doc) => {
    if (activeTag && !(doc.tags || []).includes(activeTag)) return false;
    if (activeFolderId && doc.folderId !== activeFolderId) return false;
    if (!activeFolderId && doc.folderId && view === "all") return false;
    if (view === "shared") return doc.role !== "owner";
    return true; // all
  });

  return (
    <div className="min-h-screen bg-background flex overflow-hidden">
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden animate-fade-in"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-(--glass-bg) backdrop-blur-xl border-r border-(--glass-border) transform transition-transform duration-300 ease-in-out flex flex-col ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:static md:w-64 md:shrink-0"
        }`}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-linear-to-br from-primary to-primary-700 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading font-bold text-lg text-white">CollabSpace</span>
          </div>
          <button 
            className="md:hidden text-slate-400 hover:text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => { setView("all"); setActiveFolderId(null); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              view === "all" ? "bg-primary/10 text-primary-400" : "text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            All Docs
          </button>
          <button
            onClick={() => { setView("shared"); setActiveFolderId(null); setIsSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              view === "shared" ? "bg-primary/10 text-primary-400" : "text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            <Users className="w-4 h-4" />
            Shared with me
          </button>
          <div className="mt-6 mb-2 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider flex justify-between items-center">
            Folders
            <button onClick={handleCreateFolder} className="hover:text-white p-1 rounded hover:bg-slate-800">
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {folders.map(f => (
            <button
              key={f._id}
              onClick={() => { setView("all"); setActiveFolderId(f._id); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                activeFolderId === f._id ? "bg-primary/10 text-primary-400" : "text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              <div className="w-4 h-4 text-slate-400">📁</div>
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-(--glass-border)">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar name={user.email} size="sm" />
            <div className="flex-1 truncate">
              <p className="text-sm font-medium text-white truncate">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" onClick={logout}>
            Log out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-(--glass-border) px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <button
              className="md:hidden text-slate-300 hover:text-white p-1"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative max-w-md w-full hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-md pl-10 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NotificationBell />
            <Button onClick={handleCreateDocument} isLoading={creating} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Document</span>
            </Button>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full flex-1">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-2xl font-bold font-heading text-white capitalize">
              {searchQuery ? "Search Results" : activeFolderId ? folders.find(f => f._id === activeFolderId)?.name : view === "shared" ? "Shared With Me" : "All Documents"}
            </h2>
          </div>
          
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <button 
              onClick={() => setActiveTag(null)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${!activeTag ? 'bg-primary/20 border-primary text-primary-400' : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              All Tags
            </button>
            {Array.from(new Set(documents.flatMap(d => d.tags || []))).map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${activeTag === tag ? 'bg-primary/20 border-primary text-primary-400' : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                {tag}
              </button>
            ))}
          </div>

          {loadError && (
            <div role="alert" className="mb-6 rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
              {loadError}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : displayedDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
              <div className="w-24 h-24 mb-6 rounded-lg bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
                <FileText className="w-10 h-10 text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No documents yet</h3>
              <p className="text-slate-400 max-w-sm mb-6">
                {view === "shared" 
                  ? "Nobody has shared any documents with you yet."
                  : "Create your first document to get started."}
              </p>
              {view === "all" && (
                <Button onClick={handleCreateDocument} isLoading={creating}>
                  Create Document
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedDocs.map((doc, index) => (
                <div
                  key={doc._id}
                  onClick={() => router.push(`/document/${doc._id}`)}
                  className="group bg-(--glass-bg) border border-(--glass-border) hover:border-(--glass-border-hover) rounded-lg p-5 flex flex-col h-48 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 animate-slide-up"
                  style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-md bg-slate-800 flex items-center justify-center text-primary border border-slate-700/50 group-hover:bg-primary/10 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    
                    {doc.role === 'owner' && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <select 
                          className="text-xs bg-slate-800 text-slate-300 rounded border border-slate-700 px-1 py-1 cursor-pointer outline-none"
                          onChange={e => handleMoveToFolder(e, doc._id, e.target.value || null)}
                          value={doc.folderId || ""}
                        >
                          <option value="">Root</option>
                          {folders.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                        </select>
                        <button
                          onClick={(e) => handleDeleteDocument(e, doc._id, doc.title)}
                          disabled={deletingId === doc._id}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                        >
                          {deletingId === doc._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-md font-bold text-slate-100 line-clamp-2 mb-1 group-hover:text-primary-400 transition-colors">
                    {doc.title}
                  </h3>
                  <div className="flex gap-1 mb-auto flex-wrap">
                    {(doc.tags || []).map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700 uppercase tracking-wider">{t}</span>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-(--glass-border)">
                    <div className="flex items-center gap-2">
                      <Badge role={doc.role as Role} />
                      <span className="text-xs text-slate-500">{timeAgo(doc.updatedAt)}</span>
                    </div>
                    
                    {/* Collaborators Avatar Stack */}
                    <div className="flex -space-x-2">
                      {doc.collaborators?.slice(0, 3).map((collab) => {
                        const userEmail = collab.email || 'Unknown';
                        return (
                          <div key={collab.userId} className="relative ring-2 ring-background rounded-full">
                            <Avatar name={userEmail} size="sm" className="ring-0" />
                          </div>
                        );
                      })}
                      {(doc.collaborators?.length || 0) > 3 && (
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-background">
                          +{(doc.collaborators?.length || 0) - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <CommandPalette 
        documents={documents} 
        onCreateDocument={handleCreateDocument} 
        onGoToShared={() => setView("shared")} 
      />
    </div>
  );
}
