"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";

interface CommentPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string, mentions: string[]) => void;
  collaborators: { userId: string; email: string }[];
}

export function CommentPopover(props: CommentPopoverProps) {
  // The form is a separate component so its state starts fresh every time the popover opens.
  return props.isOpen ? <CommentForm {...props} /> : null;
}

function CommentForm({ onClose, onSubmit, collaborators }: CommentPopoverProps) {
  const [content, setContent] = useState("");
  const [mentionFilter, setMentionFilter] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    // Naive mention detection: if last word starts with @
    const words = val.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (lastWord.startsWith("@")) {
      setMentionFilter(lastWord.slice(1).toLowerCase());
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (userId: string, email: string) => {
    const words = content.split(/\s+/);
    words.pop(); // remove the partial @mentions
    const newContent = [...words, `@${email.split('@')[0]} `].join(" ");
    setContent(newContent);
    setMentions((prev) => Array.from(new Set([...prev, userId])));
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!content.trim()) return;
    // Drop mentions whose @name was deleted from the text after being picked.
    const stillMentioned = mentions.filter((id) => {
      const email = collaborators.find((c) => c.userId === id)?.email;
      return email ? content.includes(`@${email.split("@")[0]}`) : false;
    });
    onSubmit(content.trim(), stillMentioned);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  const filteredCollaborators = collaborators.filter((c) => 
    c.email.toLowerCase().includes(mentionFilter)
  );

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 w-72 bg-(--glass-bg) border border-(--glass-border) rounded-lg shadow-2xl p-4 animate-scale-in backdrop-blur-xl">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment... (Type @ to mention)"
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-md p-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none h-24"
          />
          {showMentions && filteredCollaborators.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-full bg-slate-800 border border-slate-700 rounded-md shadow-lg overflow-hidden max-h-32 overflow-y-auto">
              {filteredCollaborators.map((c) => (
                <button
                  key={c.userId}
                  type="button"
                  onClick={() => insertMention(c.userId, c.email)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 text-slate-200 truncate"
                >
                  {c.email}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm">Comment</Button>
        </div>
      </form>
    </div>
  );
}
