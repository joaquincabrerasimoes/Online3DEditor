import { Events } from './eventbus.js';

export class KeyboardHandler
{
    constructor (eventBus)
    {
        this.eventBus = eventBus;
        this.onKeyDown = this.OnKeyDown.bind (this);
        document.addEventListener ('keydown', this.onKeyDown);
    }

    destroy ()
    {
        document.removeEventListener ('keydown', this.onKeyDown);
    }

    OnKeyDown (ev)
    {
        // Ignore keystrokes while typing in form fields
        let tag = document.activeElement ? document.activeElement.tagName : '';
        let isEditable = document.activeElement ? document.activeElement.hasAttribute ('contenteditable') : false;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || isEditable) {
            return;
        }

        let key = ev.key.toLowerCase ();

        if (ev.ctrlKey || ev.metaKey) {
            if (key === 'a') {
                ev.preventDefault ();
                this.eventBus.emit (Events.SelectionSelectAll, {});
            }
            return;
        }

        switch (key) {
            case 't':
                this.eventBus.emit (Events.ModeChanged, { mode : 'translate' });
                break;
            case 'r':
                this.eventBus.emit (Events.ModeChanged, { mode : 'rotate' });
                break;
            case 's':
                this.eventBus.emit (Events.ModeChanged, { mode : 'scale' });
                break;
            case 'escape':
                this.eventBus.emit (Events.ModeChanged, { mode : 'none' });
                break;
            case 'delete':
            case 'backspace':
                this.eventBus.emit (Events.SelectionDeleteRequested, {});
                break;
        }
    }
}
