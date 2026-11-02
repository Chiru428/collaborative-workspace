"use client";

import { API_URL } from "@/lib/config";
import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { X, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface CommentType {
  _id: string;
  content: string;
  resolved: boolean;
  createdAt: string;
  authorId: { _id: string; email: string };
}

interface CommentsPanelProps {
  documentId: string;
  isOpen: boolean;
  /** Bump to force a refetch while the panel is open (e.g. after adding a comment). */
  refreshKey?: number;
  onClose: () => void;
  role: string;
  onScrollToComment: (commentId: string) => void;
  onCommentResolved: (commentId: string) => void;
}

export function CommentsPanel({ documentId, isOpen, refreshKey = 0, onClose, role, onScrollToComment, onCommentResolved }: CommentsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<CommentType[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user?.token) {
      const fetchComments = async () => {
        setLoading(true);
        try {
          const res = await axios.get(`${API_URL}/api/documents/${documentId}/comments`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          setComments(res.data);
        } catch (error) {
          console.error("Failed to fetch comments", error);
          toast("Failed to load comments", "error");
        } finally {
          setLoading(false);
        }
      };
      fetchComments();
    }
  }, [isOpen, refreshKey, documentId, user?.token, toast]);

  if (!isOpen) return null;

  const handleResolve = async (e: React.MouseEvent, comment: CommentType) => {
    e.stopPropagation();
    // Only owner or original author can resolve
    if (role !== "owner" && comment.authorId._id !== user?._id) return;
    
    setResolvingId(comment._id);
    try {
      await axios.patch(
        `${API_URL}/api/comments/${comment._id}/resolve`,
        {},
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      toast("Comment resolved", "success");
      setComments(comments.filter(c => c._id !== comment._id));
      onCommentResolved(comment._id);
    } catch (error) {
      console.error("Failed to resolve comment", error);
      toast("Failed to resolve comment", "error");
    } finally {
      setResolvingId(null);
    }
  };

  const activeComments = comments.filter(c => !c.resolved);

  return (
    <div className="fixed inset-0 z-150 flex justify-end bg-black/40 backdrop-blur-sm animate-fade-in pointer-events-auto">
      <div 
        className="w-full max-w-sm h-full bg-(--glass-bg) border-l border-(--glass-border) shadow-2xl flex flex-col transform transition-transform duration-300 translate-x-0"
      >
        <div className="flex items-center justify-between p-4 border-b border-(--glass-border) bg-slate-900/50">
          <div className="flex items-center gap-2 text-white">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-bold text-lg">Comments</h2>
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
          ) : activeComments.length === 0 ? (
            <div className="text-center text-slate-400 p-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active comments.</p>
            </div>
          ) : (
            activeComments.map((comment) => {
              const canResolve = role === "owner" || comment.authorId._id === user?._id;
              
              return (
                <div 
                  key={comment._id} 
                  onClick={() => onScrollToComment(comment._id)}
                  className="bg-slate-800/40 border border-slate-700/50 rounded-md p-4 hover:border-primary/50 transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-white text-sm">
                      {comment.authorId.email.split('@')[0]}
                    </h3>
                    <span className="text-xs text-slate-500">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <p className="text-sm text-slate-300 mb-4 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                  
                  {canResolve && (
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="w-full gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleResolve(e, comment)}
                      isLoading={resolvingId === comment._id}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Resolve thread
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
