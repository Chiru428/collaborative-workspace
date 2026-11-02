import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-(--glass-bg) border border-(--glass-border) rounded-lg w-full max-w-md shadow-2xl overflow-hidden animate-slide-up mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-(--glass-border) bg-slate-900/50">
          <h2 className="text-xl font-bold font-heading text-white flex items-center gap-2">
            {title}
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-sm hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
