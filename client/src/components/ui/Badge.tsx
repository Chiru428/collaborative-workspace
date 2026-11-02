import React from "react";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

export type Role = "owner" | "editor" | "viewer";

interface BadgeProps {
  role: Role;
  className?: string;
}

export function Badge({ role, className = "" }: BadgeProps) {
  const configs: Record<Role, { color: string; icon: React.ReactNode; label: string }> = {
    owner: {
      color: "bg-primary/20 text-primary-400 border border-primary/30",
      icon: <ShieldAlert className="w-3 h-3" />,
      label: "Owner",
    },
    editor: {
      color: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
      icon: <ShieldCheck className="w-3 h-3" />,
      label: "Editor",
    },
    viewer: {
      color: "bg-slate-700/50 text-slate-300 border border-slate-600/50",
      icon: <Shield className="w-3 h-3" />,
      label: "Viewer",
    },
  };

  const config = configs[role];

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-xs font-medium ${config.color} ${className}`}>
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
}
