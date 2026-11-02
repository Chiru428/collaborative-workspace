import { API_URL } from "@/lib/config";
import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Plus, Users, Loader2 } from "lucide-react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";

interface DocumentType {
  _id: string;
  title: string;
  role: string;
}

interface CommandPaletteProps {
  documents: DocumentType[];
  onCreateDocument: () => void;
  onGoToShared: () => void;
}

export function CommandPalette({ documents, onCreateDocument, onGoToShared }: CommandPaletteProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DocumentType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Reset the palette whenever it is toggled so it always opens clean.
        setQuery("");
        setSearchResults([]);
        setActiveIndex(0);
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!query || !user?.token) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get(`${API_URL}/api/documents/search?q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
        setSearchResults(res.data);
        setActiveIndex(0);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setIsSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query, user?.token]);

  if (!isOpen) return null;

  const filteredDocs = query ? searchResults : documents.slice(0, 5);

  const handleAction = (index: number) => {
    if (query === "") {
      // Base actions when no query
      if (index === 0) {
        setIsOpen(false);
        onCreateDocument();
      } else if (index === 1) {
        setIsOpen(false);
        onGoToShared();
      } else {
        const doc = filteredDocs[index - 2];
        if (doc) {
          setIsOpen(false);
          router.push(`/document/${doc._id}`);
        }
      }
    } else {
      // Only docs when queried
      const doc = filteredDocs[index];
      if (doc) {
        setIsOpen(false);
        router.push(`/document/${doc._id}`);
      }
    }
  };

  const totalItems = query ? filteredDocs.length : 2 + filteredDocs.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleAction(activeIndex);
    }
  };

  return (
    <div className="fixed inset-0 z-200 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={() => setIsOpen(false)} />
      
      <div 
        className="relative bg-(--glass-bg) border border-(--glass-border) rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center px-4 py-3 border-b border-(--glass-border)">
          <Search className="w-5 h-5 text-slate-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-white placeholder-slate-400 focus:outline-none text-lg"
            placeholder="Search documents or jump to..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <div className="text-[10px] text-slate-500 font-mono bg-slate-800 px-2 py-1 rounded border border-slate-700">ESC</div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!query && (
            <div className="mb-4">
              <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Actions
              </div>
              <button
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-colors ${
                  activeIndex === 0 ? "bg-primary text-on-primary" : "text-slate-300 hover:bg-slate-800/50"
                }`}
                onClick={() => handleAction(0)}
                onMouseEnter={() => setActiveIndex(0)}
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium">Create New Document</span>
              </button>
              <button
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-colors ${
                  activeIndex === 1 ? "bg-primary text-on-primary" : "text-slate-300 hover:bg-slate-800/50"
                }`}
                onClick={() => handleAction(1)}
                onMouseEnter={() => setActiveIndex(1)}
              >
                <Users className="w-5 h-5" />
                <span className="font-medium">Go to Shared with me</span>
              </button>
            </div>
          )}

          {filteredDocs.length > 0 ? (
            <div>
              <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {query ? "Search Results" : "Recent Documents"}
              </div>
              {filteredDocs.map((doc, idx) => {
                const itemIndex = query ? idx : idx + 2;
                return (
                  <button
                    key={doc._id}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-colors ${
                      activeIndex === itemIndex ? "bg-primary text-on-primary" : "text-slate-300 hover:bg-slate-800/50"
                    }`}
                    onClick={() => handleAction(itemIndex)}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                  >
                    <FileText className="w-5 h-5 opacity-70" />
                    <span className="font-medium truncate flex-1">{doc.title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            query && (
              <div className="py-8 text-center text-slate-400">
                {isSearching ? (
                  <Loader2 className="w-6 h-6 animate-spin mx-auto opacity-50" />
                ) : (
                  <p>No documents found matching &quot;{query}&quot;</p>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
