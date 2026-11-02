import { useMemo } from "react";

export type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  // Extract initials
  const initials = useMemo(() => {
    if (!name) return "??";
    const parts = name.split(/[\s.@]+/);
    if (parts.length > 1 && parts[1].length > 0) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }, [name]);

  // Deterministic color excluding warm amber tones
  const bgColor = useMemo(() => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#3b82f6'];
    const index = name ? name.length % colors.length : 0;
    return colors[index];
  }, [name]);

  const sizes: Record<AvatarSize, string> = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  return (
    <div
      className={`flex items-center justify-center rounded-full font-bold text-white shadow-sm ring-2 ring-background ${sizes[size]} ${className}`}
      style={{ backgroundColor: bgColor }}
      title={name}
    >
      {initials}
    </div>
  );
}
