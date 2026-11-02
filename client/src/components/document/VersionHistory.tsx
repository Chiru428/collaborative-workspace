"use client";

import { API_URL } from "@/lib/config";
import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { X, Clock, History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface Version {
  _id: string;
  label?: string;
  createdAt: string;
  createdBy: { email: string };
}

interface VersionHistoryProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  role: string;
}

function timeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  return date.toLocaleDateString();
}

export function VersionHistory({ documentId, isOpen, onClose, role }: VersionHistoryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user?.token) {
      const fetchVersions = async () => {
        setLoading(true);
        try {
          const res = await axios.get(`${API_URL}/api/documents/${documentId}/versions`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          setVersions(res.data);
        } catch (error) {
          console.error("Failed to fetch versions", error);
          toast("Failed to load version history", "error");
        } finally {
          setLoading(false);
        }
      };
      fetchVersions();
    }
  }, [isOpen, documentId, user?.token, toast]);

  if (!isOpen) return null;

  const handleRestore = async (version: Version) => {
    if (role !== "owner") return;
    
    if (!window.confirm("This will restore the document to this version. Continue?")) {
      return;
    }

    setRestoringId(version._id);
    try {
      await axios.post(
        `${API_URL}/api/documents/${documentId}/versions/${version._id}/restore`,
        {},
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      toast("Version restored successfully", "success");
      onClose();
    } catch (error) {
      console.error("Failed to restore version", error);
      toast("Failed to restore version", "error");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-150 flex justify-end bg-black/40 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-sm h-full bg-(--glass-bg) border-l border-(--glass-border) shadow-2xl flex flex-col transform transition-transform duration-300 translate-x-0"
      >
        <div className="flex items-center justify-between p-4 border-b border-(--glass-border) bg-slate-900/50">
          <div className="flex items-center gap-2 text-white">
            <History className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-bold text-lg">Version History</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center text-slate-400 p-8">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No versions available.</p>
            </div>
          ) : (
            versions.map((version) => (
              <div 
                key={version._id} 
                className="bg-slate-800/40 border border-slate-700/50 rounded-md p-4 hover:border-primary/50 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-white text-md">
                      {version.label || "Auto-saved snapshot"}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(version.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-500 bg-slate-800 px-2 py-1 rounded">
                    {timeAgo(version.createdAt)}
                  </span>
                </div>
                
                <p className="text-sm text-slate-400 mb-4">
                  By {version.createdBy?.email || "System"}
                </p>
                
                {role === "owner" && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="w-full gap-2"
                    onClick={() => handleRestore(version)}
                    isLoading={restoringId === version._id}
                    disabled={restoringId !== null}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore this version
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
