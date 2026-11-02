import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { SlashItem } from './SlashCommand';

export interface SlashListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const SlashCommandList = forwardRef<SlashListHandle, SuggestionProps<SlashItem>>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }
      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }
      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-md shadow-xl overflow-hidden py-1 w-64 animate-fade-in text-sm">
      {props.items.length ? (
        props.items.map((item, index) => (
          <button
            className={`w-full text-left px-3 py-2 flex items-center gap-3 ${
              index === selectedIndex ? 'bg-primary/20 text-primary-400' : 'text-slate-200 hover:bg-slate-700'
            }`}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item.icon && <item.icon className="w-4 h-4 opacity-70" />}
            {item.title}
          </button>
        ))
      ) : (
        <div className="px-3 py-2 text-slate-400">No result</div>
      )}
    </div>
  );
});

SlashCommandList.displayName = 'SlashCommandList';
