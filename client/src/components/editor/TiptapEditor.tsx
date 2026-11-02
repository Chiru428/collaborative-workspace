"use client";

import { API_URL, WS_URL } from "@/lib/config";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { CollaborationCursor } from './CollaborationCursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Bold, Italic, Strikethrough, Heading1, Heading2, List, ListOrdered, Quote, Code, Loader2, Save, History, MessageSquarePlus, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import axios from 'axios';
import { VersionHistory } from '../document/VersionHistory';
import { CommentMark } from './CommentMark';
import { CommentPopover } from '../document/CommentPopover';
import { CommentsPanel } from '../document/CommentsPanel';

import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from 'tiptap-markdown';
// html2pdf is dynamically imported in handleExportPDF to avoid SSR issues
import { IndexeddbPersistence } from 'y-indexeddb';
import { SlashCommand, SlashItem } from './SlashCommand';
import { SlashCommandList, SlashListHandle } from './SlashCommandList';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { FileDown, Image as ImageIcon, Download } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';


const SLASH_ITEMS: SlashItem[] = [
  { title: 'Heading 1', icon: Heading1, command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(); } },
  { title: 'Heading 2', icon: Heading2, command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(); } },
  { title: 'Bullet List', icon: List, command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleBulletList().run(); } },
  { title: 'Ordered List', icon: ListOrdered, command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleOrderedList().run(); } },
  { title: 'Table', icon: FileDown, command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } },
  {
    title: 'Image',
    icon: ImageIcon,
    command: ({ editor, range }) => {
      const url = window.prompt('Image URL (https://...)');
      // Only http(s) URLs: blocks javascript:/data: sources pasted into the prompt.
      if (url && /^https?:\/\//i.test(url.trim())) {
        editor.chain().focus().deleteRange(range).setImage({ src: url.trim() }).run();
      } else {
        editor.chain().focus().deleteRange(range).run();
      }
    },
  },
  { title: 'Code Block', icon: Code, command: ({ editor, range }) => { editor.chain().focus().deleteRange(range).toggleCodeBlock().run(); } },
];

export default function TiptapEditor({ documentId = "default", role = "editor", collaborators = [] }: { documentId?: string, role?: string, collaborators?: { userId: string; email: string }[] }) {
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const { user, isLoading } = useAuth();

  const [accessLost, setAccessLost] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !user?.token) return;

    const doc = new Y.Doc();
    // Cache is scoped per user so a different account on the same browser never sees it.
    const indexeddbProvider = new IndexeddbPersistence(`${user._id}:${documentId}`, doc);

    // The JWT travels in the WebSocket subprotocol header, not in the URL (URLs end up in logs).
    const wsProvider = new WebsocketProvider(WS_URL, documentId, doc, {
      protocols: ['collab-v1', `token.${user.token}`],
      connect: false, // opened on the next tick so React Strict Mode's mount/unmount/mount never aborts a half-open socket
    });
    const connectTimer = setTimeout(() => wsProvider.connect(), 0);

    wsProvider.on('status', (event: { status: string }) => {
      setIsOffline(event.status !== 'connected');
    });
    wsProvider.on('sync', (synced: boolean) => {
      setIsSynced(synced);
    });
    // 4001 = bad/expired token, 4004 = no access or document deleted. Retrying can't help.
    // (4003 = role changed/revoked: the default auto-reconnect re-authorizes with the new role.)
    wsProvider.on('connection-close', (event: CloseEvent | null) => {
      if (event && (event.code === 4001 || event.code === 4004)) {
        wsProvider.disconnect();
        setAccessLost(event.code === 4001 ? 'Your session has expired. Please log in again.' : 'This document is unavailable or you no longer have access.');
      }
    });

    // Creating external resources (doc + sockets) must happen in the effect; exposing them via state is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYdoc(doc);
    setProvider(wsProvider);
    setAccessLost(null);

    return () => {
      clearTimeout(connectTimer);
      wsProvider.destroy();
      indexeddbProvider.destroy();
      doc.destroy();
      setProvider(null);
      setYdoc(null);
    };
  }, [documentId, user?.token, user?._id, isLoading]);

  if (accessLost) {
    return (
      <div className="flex flex-col justify-center items-center h-[70vh] w-full">
        <p className="text-slate-300 font-medium">{accessLost}</p>
      </div>
    );
  }

  if (!provider || !ydoc || isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-[70vh] w-full">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-slate-400 font-medium animate-pulse">Loading document state...</p>
      </div>
    );
  }

  return <div className="flex flex-col h-full relative">
      <div className="absolute top-2 right-4 z-50 flex items-center gap-2 text-xs font-medium px-2 py-1 rounded bg-slate-800/80 border border-slate-700/50 backdrop-blur-sm">
        <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-500' : isSynced ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'}`}></div>
        <span className="text-slate-300">{isOffline ? 'Offline (Saving locally)' : isSynced ? 'Online & Synced' : 'Syncing...'}</span>
      </div>
      <InnerEditor ydoc={ydoc} provider={provider} role={role} documentId={documentId} collaborators={collaborators || []} />
    </div>;
}

function ToolbarButton({ onClick, isActive, icon: Icon, title }: { onClick: () => void; isActive: boolean; icon: LucideIcon; title: string }) {
  return (
  <Button
    variant="ghost"
    size="sm"
    onClick={onClick}
    title={title}
    className={`p-2 transition-all duration-200 ${
      isActive 
        ? 'bg-primary/20 text-primary-400 hover:text-primary hover:bg-primary/30 border border-primary/30 shadow-inner' 
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 border border-transparent'
    }`}
  >
    <Icon className="w-5 h-5" />
  </Button>
  );
}

function InnerEditor({ 
  ydoc, 
  provider, 
  role, 
  documentId,
  collaborators
}: { 
  ydoc: Y.Doc; 
  provider: WebsocketProvider; 
  role: string; 
  documentId: string;
  collaborators: { userId: string; email: string }[]
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [commentsRefresh, setCommentsRefresh] = useState(0);
  
  // Comment Creation State
  const [commentPopoverOpen, setCommentPopoverOpen] = useState(false);
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<{from: number, to: number} | null>(null);
  
  // Deterministic color based on user email or random (removed warm amber tones)
  const cursorColor = useMemo(() => {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#3b82f6'];
    const seed = user?.email || user?._id || '';
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return colors[hash % colors.length];
  }, [user?.email, user?._id]);

  const editor = useEditor({
    editable: role !== 'viewer',
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        undoRedo: false, // history is handled by Yjs
        link: false, // registered separately below with our own options
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider,
        user: {
          name: user?.email || 'Anonymous',
          color: cursorColor,
        },
      }),
      CommentMark,

      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: true }),
      Link.configure({ openOnClick: false }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Start typing your document here...' }),
      Markdown,
      SlashCommand.configure({
        suggestion: {
          items: ({ query }: { query: string }) =>
            SLASH_ITEMS.filter((item) => item.title.toLowerCase().startsWith(query.toLowerCase())).slice(0, 10),
          render: () => {
            let component: ReactRenderer<SlashListHandle, SuggestionProps<SlashItem>> | null = null;
            let popup: TippyInstance[] = [];
            return {
              onStart: (props: SuggestionProps<SlashItem>) => {
                component = new ReactRenderer(SlashCommandList, { props, editor: props.editor });
                if (!props.clientRect) return;
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate(props: SuggestionProps<SlashItem>) {
                component?.updateProps(props);
                if (!props.clientRect) return;
                popup[0]?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
              },
              onKeyDown(props: SuggestionKeyDownProps) {
                if (props.event.key === 'Escape') {
                  popup[0]?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit() {
                popup[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-invert sm:prose-lg xl:prose-xl mx-auto focus:outline-none min-h-[60vh] max-w-4xl py-8 px-4',
      },
    },
  });

  // Sync editor editability when role changes.
  // useEditor's `editable` option is only read on creation — it is NOT reactive.
  // We must call setEditable() explicitly whenever role changes.
  useEffect(() => {
    if (editor) {
      editor.setEditable(role !== 'viewer');
      // Re-focus the editor when it becomes editable
      if (role !== 'viewer') {
        editor.commands.focus();
      }
    }
  }, [editor, role]);

  const handleSaveSnapshot = async () => {
    if (!user?.token) return;
    const label = window.prompt("Enter a label for this version (optional):");
    if (label === null) return; // User cancelled

    setIsSavingSnapshot(true);
    try {
      await axios.post(
        `${API_URL}/api/documents/${documentId}/versions/snapshot`,
        { label },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      toast("Version saved successfully", "success");
    } catch (error) {
      console.error("Failed to save snapshot", error);
      toast("Failed to save version", "error");
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  
  const handleExportPDF = async () => {
    const element = document.querySelector('.ProseMirror') as HTMLElement;
    if (!element) return;
    const html2pdf = (await import('html2pdf.js')).default;
    const opt = {
      margin: 1,
      filename: 'document.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(element).save();
  };

  const handleExportMarkdown = () => {
    if (!editor) return;
    const markdown = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartComment = () => {
    if (!editor || editor.state.selection.empty) return;
    
    // 1. Generate client-side UUID
    const id = crypto.randomUUID();
    
    // 2. Apply mark immediately
    editor.chain().focus().setComment(id).run();
    
    // 3. Store state and open popover
    setPendingCommentId(id);
    setPendingAnchor({ from: editor.state.selection.from, to: editor.state.selection.to });
    setCommentPopoverOpen(true);
  };

  const handleCancelComment = () => {
    if (editor && pendingCommentId) {
      editor.chain().focus().unsetComment(pendingCommentId).run();
    }
    setCommentPopoverOpen(false);
    setPendingCommentId(null);
    setPendingAnchor(null);
  };

  const handleSubmitComment = async (content: string, mentions: string[]) => {
    if (!user?.token || !pendingCommentId || !pendingAnchor) return;
    
    try {
      await axios.post(
        `${API_URL}/api/documents/${documentId}/comments`,
        {
          _id: pendingCommentId,
          content,
          anchorFrom: pendingAnchor.from,
          anchorTo: pendingAnchor.to,
          mentions
        },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      toast("Comment added", "success");
      setCommentPopoverOpen(false);
      setPendingCommentId(null);
      setPendingAnchor(null);
      setCommentsRefresh((n) => n + 1);
      setIsCommentsOpen(true);
    } catch (error) {
      console.error("Failed to add comment", error);
      toast("Failed to add comment", "error");
      handleCancelComment();
    }
  };

  const handleScrollToComment = (commentId: string) => {
    if (!editor) return;
    
    let foundPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (foundPos !== -1) return false;
      if (node.marks.find(m => m.type.name === 'comment' && m.attrs.commentId === commentId)) {
        foundPos = pos;
        return false;
      }
    });
    
    if (foundPos !== -1) {
      editor.commands.setTextSelection(foundPos);
      editor.commands.scrollIntoView();
    } else {
      toast("Comment highlight no longer found in text", "info");
    }
  };

  const handleCommentResolved = (commentId: string) => {
    if (editor) {
      editor.chain().focus().unsetComment(commentId).run();
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col h-full relative">
       {/* Toolbar */}
       {role !== 'viewer' && (
       <div className="sticky top-0 z-10 flex justify-center p-4 backdrop-blur-md bg-(--glass-bg)/80 border-b border-(--glass-border)">
         <div className="flex items-center space-x-1.5 bg-slate-900/60 p-1.5 rounded-lg border border-slate-700/50 shadow-xl overflow-x-auto max-w-full hide-scrollbar">
           <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} icon={Bold} title="Bold" />
           <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} icon={Italic} title="Italic" />
           <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} icon={Strikethrough} title="Strikethrough" />
           
           <div className="w-px h-6 bg-slate-700/50 mx-2"></div>
           
           <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} icon={Heading1} title="Heading 1" />
           <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} icon={Heading2} title="Heading 2" />
           
           <div className="w-px h-6 bg-slate-700/50 mx-2"></div>
           
           <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} icon={List} title="Bullet List" />
           <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} icon={ListOrdered} title="Ordered List" />
           
           <div className="w-px h-6 bg-slate-700/50 mx-2"></div>
           
           <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} icon={Quote} title="Quote" />
           <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive('codeBlock')} icon={Code} title="Code Block" />
           
           <div className="w-px h-6 bg-slate-700/50 mx-2"></div>

           <Button
             variant="ghost"
             size="sm"
             onClick={handleStartComment}
             disabled={editor.state.selection.empty}
             title="Add comment"
             className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 disabled:opacity-30"
           >
             <MessageSquarePlus className="w-5 h-5" />
           </Button>

           <Button
             variant="ghost"
             size="sm"
             onClick={() => setIsCommentsOpen(!isCommentsOpen)}
             title="View comments"
             className={`p-2 transition-colors ${isCommentsOpen ? 'text-primary bg-primary/10 hover:bg-primary/20' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
           >
             <MessageSquare className="w-5 h-5" />
           </Button>
           
           <div className="w-px h-6 bg-slate-700/50 mx-2"></div>
           
           <Button
             variant="ghost"
             size="sm"
             onClick={handleExportPDF}
             title="Export PDF"
             className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50"
           >
             <FileDown className="w-5 h-5" />
           </Button>
           <Button
             variant="ghost"
             size="sm"
             onClick={handleExportMarkdown}
             title="Export Markdown"
             className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50"
           >
             <Download className="w-5 h-5" />
           </Button>
           <Button
             variant="ghost"
             size="sm"
             onClick={handleSaveSnapshot}
             title="Save version"
             isLoading={isSavingSnapshot}
             className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50"
           >
             <Save className="w-5 h-5" />
           </Button>
           
           <Button
             variant="ghost"
             size="sm"
             onClick={() => setIsHistoryOpen(true)}
             title="Version History"
             className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50"
           >
             <History className="w-5 h-5" />
           </Button>
         </div>
       </div>
       )}
       
       <div className="grow overflow-y-auto relative">
         <EditorContent editor={editor} className="h-full" />
         <div className="absolute bottom-4 right-4 text-[10px] text-slate-400 bg-slate-800/80 px-2 py-1 rounded border border-slate-700/50 backdrop-blur-sm pointer-events-none">
           {editor.storage.characterCount.words()} words • {Math.round(editor.storage.characterCount.words() / 200)} min read
         </div>
         
         <CommentPopover 
           isOpen={commentPopoverOpen}
           onClose={handleCancelComment}
           onSubmit={handleSubmitComment}
           collaborators={collaborators}
         />
       </div>
       
       <VersionHistory 
         documentId={documentId} 
         isOpen={isHistoryOpen} 
         onClose={() => setIsHistoryOpen(false)} 
         role={role} 
       />
       
       <CommentsPanel 
         documentId={documentId}
         isOpen={isCommentsOpen}
         refreshKey={commentsRefresh}
         onClose={() => setIsCommentsOpen(false)}
         role={role}
         onScrollToComment={handleScrollToComment}
         onCommentResolved={handleCommentResolved}
       />
    </div>
  )
}
