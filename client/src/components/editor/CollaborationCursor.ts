import { Extension } from '@tiptap/core';
import { yCursorPlugin } from '@tiptap/y-tiptap';

interface CursorUser {
    name: string | null;
    color: string | null;
}

const awarenessStatesToArray = (states: Map<number, { user?: CursorUser }>) => {
    return Array.from(states.entries()).map(([key, value]) => {
        return {
            clientId: key,
            ...value.user,
        };
    });
};

const defaultOnUpdate = () => null;

/**
 * Custom CollaborationCursor extension because @tiptap/extension-collaboration-cursor 3.x
 * imports yCursorPlugin from 'y-prosemirror' instead of '@tiptap/y-tiptap', 
 * causing a PluginKey mismatch and crashing with "Cannot read properties of undefined (reading 'doc')".
 */
export const CollaborationCursor = Extension.create({
    name: 'collaborationCursor',
    addOptions() {
        return {
            provider: null,
            user: {
                name: null,
                color: null,
            },
            render: (user: CursorUser) => {
                const cursor = document.createElement('span');
                cursor.classList.add('collaboration-cursor__caret');
                cursor.setAttribute('style', `border-color: ${user.color}; box-shadow: 0 0 10px ${user.color}40;`);
                
                const label = document.createElement('div');
                label.classList.add('collaboration-cursor__label');
                label.setAttribute('style', `
                    background-color: ${user.color}; 
                    color: white; 
                    font-size: 12px; 
                    font-weight: 600; 
                    padding: 2px 8px; 
                    border-radius: 4px 4px 4px 0; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    white-space: nowrap;
                `);
                label.insertBefore(document.createTextNode(user.name ?? ''), null);
                cursor.insertBefore(label, null);
                return cursor;
            },
            selectionRender: undefined,
            onUpdate: defaultOnUpdate,
        };
    },
    addStorage() {
        return {
            users: [],
        };
    },
    addProseMirrorPlugins() {
        return [
            yCursorPlugin((() => {
                this.options.provider.awareness.setLocalStateField('user', this.options.user);
                this.storage.users = awarenessStatesToArray(this.options.provider.awareness.states);
                this.options.provider.awareness.on('update', () => {
                    this.storage.users = awarenessStatesToArray(this.options.provider.awareness.states);
                });
                return this.options.provider.awareness;
            })(), 
            {
                cursorBuilder: this.options.render,
                selectionBuilder: this.options.selectionRender,
            }),
        ];
    },
});
