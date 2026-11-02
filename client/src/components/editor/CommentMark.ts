import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      /**
       * Set a comment mark
       */
      setComment: (id: string) => ReturnType;
      /**
       * Unset a comment mark
       */
      unsetComment: (id: string) => ReturnType;
    };
  }
}

export const CommentMark = Mark.create<CommentOptions>({
  name: 'comment',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: element => element.getAttribute('data-comment-id'),
        renderHTML: attributes => {
          if (!attributes.commentId) {
            return {};
          }
          return {
            'data-comment-id': attributes.commentId,
            class: 'bg-amber-500/30 border-b-2 border-amber-500 cursor-pointer transition-colors hover:bg-amber-500/40',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setComment: (commentId: string) => ({ commands }) => {
        return commands.setMark(this.name, { commentId });
      },
      unsetComment: (commentId: string) => ({ tr, dispatch }) => {
        if (dispatch) {
          // Remove comment mark specifically with the matching commentId across the whole document
          // since the mark could have been fragmented
          let removed = false;
          tr.doc.descendants((node, pos) => {
            if (node.isText && node.marks) {
              const mark = node.marks.find(m => m.type.name === this.name && m.attrs.commentId === commentId);
              if (mark) {
                tr.removeMark(pos, pos + node.nodeSize, mark.type);
                removed = true;
              }
            }
          });
          return removed;
        }
        return true;
      },
    };
  },
});
