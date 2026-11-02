import { Extension } from '@tiptap/core';
import type { Editor, Range } from '@tiptap/core';
import type { LucideIcon } from 'lucide-react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

export interface SlashItem {
  title: string;
  icon: LucideIcon;
  command: (args: { editor: Editor; range: Range }) => void;
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        pluginKey: new PluginKey('slashCommand'),
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
