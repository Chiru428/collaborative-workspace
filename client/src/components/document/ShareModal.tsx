"use client";

import { API_URL } from "@/lib/config";
import { getErrorMessage } from "@/lib/errors";
import React, { useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { UserPlus, Loader2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, Role } from "@/components/ui/Badge";

interface Collaborator {
  userId: string;
  role: "editor" | "viewer";
  email: string;
  addedAt: string;
}

interface ShareModalProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  collaborators: Collaborator[];
  onCollaboratorsChange: (newCollaborators: Collaborator[]) => void;
}

export default function ShareModal({ documentId, isOpen, onClose, collaborators, onCollaboratorsChange }: ShareModalProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !user?.token) return;

    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(
        `${API_URL}/api/documents/${documentId}/share`,
        { email: email.trim(), role },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      
      onCollaboratorsChange([...collaborators, res.data.newCollaborator]);
      setEmail("");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to share document."));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!user?.token) return;
    setProcessingId(userId);
    setError(null);
    try {
      await axios.delete(
        `${API_URL}/api/documents/${documentId}/share/${userId}`,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      onCollaboratorsChange(collaborators.filter(c => c.userId !== userId));
    } catch (err) {
      setError(getErrorMessage(err, "Failed to remove collaborator."));
    } finally {
      setProcessingId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: "editor" | "viewer") => {
    if (!user?.token) return;
    setProcessingId(userId);
    setError(null);
    try {
      await axios.put(
        `${API_URL}/api/documents/${documentId}/share/${userId}`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      onCollaboratorsChange(
        collaborators.map(c => c.userId === userId ? { ...c, role: newRole } : c)
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update role."));
    } finally {
      setProcessingId(null);
    }
  };

  const titleNode = (
    <>
      <UserPlus className="w-5 h-5 text-primary" />
      Share Document
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titleNode}>
      {/* Add form */}
      <form onSubmit={handleShare} className="mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address..."
              required
              className="flex-1 bg-slate-800/80 text-base text-white placeholder-slate-400 border border-slate-700 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="bg-slate-800/80 text-base text-white border border-slate-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            disabled={!email.trim()}
            className="w-full"
          >
            Invite Collaborator
          </Button>
        </div>
        {error && <p className="text-rose-400 text-sm mt-3 bg-rose-500/10 p-2 rounded-md border border-rose-500/20">{error}</p>}
      </form>

      {/* Collaborators list */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-700 pb-2">
          People with access
        </h3>
        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
          {collaborators.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">No collaborators yet.</p>
          ) : (
            collaborators.map(c => (
              <div key={c.userId} className="flex items-center justify-between p-3 rounded-md bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar name={c.email} size="md" />
                  <div className="overflow-hidden">
                    <p className="text-sm font-semibold text-white truncate" title={c.email}>{c.email}</p>
                    <Badge role={c.role as Role} className="mt-1" />
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {processingId === c.userId ? (
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                  ) : (
                    <>
                      <select
                        value={c.role}
                        onChange={(e) => handleRoleChange(c.userId, e.target.value as "editor" | "viewer")}
                        className="bg-transparent text-sm text-slate-300 border-none cursor-pointer focus:outline-none focus:ring-0"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemove(c.userId)}
                        title="Remove access"
                        className="p-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
