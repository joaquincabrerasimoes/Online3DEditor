import { GetDomElementClientCoordinates } from '../engine/viewer/domutils.js';

export class InputManager
{
    constructor (canvasElement)
    {
        this.canvasElement = canvasElement;
        this.modifiers = { ctrl : false, shift : false, alt : false, meta : false };
        this.mousePosition = { x : 0, y : 0 };
        this.buttonsDown = new Set ();

        this.onKeyDown = this.OnKeyDown.bind (this);
        this.onKeyUp = this.OnKeyUp.bind (this);
        this.onMouseDown = this.OnMouseDown.bind (this);
        this.onMouseMove = this.OnMouseMove.bind (this);
        this.onMouseUp = this.OnMouseUp.bind (this);
        this.onBlur = this.OnBlur.bind (this);

        document.addEventListener ('keydown', this.onKeyDown);
        document.addEventListener ('keyup', this.onKeyUp);
        canvasElement.addEventListener ('mousedown', this.onMouseDown);
        canvasElement.addEventListener ('mousemove', this.onMouseMove);
        canvasElement.addEventListener ('mouseup', this.onMouseUp);
        window.addEventListener ('blur', this.onBlur);
    }

    isCtrlPressed ()
    {
        return this.modifiers.ctrl || this.modifiers.meta;
    }

    isShiftPressed ()
    {
        return this.modifiers.shift;
    }

    isAltPressed ()
    {
        return this.modifiers.alt;
    }

    isButtonDown (which)
    {
        return this.buttonsDown.has (which);
    }

    getMousePosition ()
    {
        return { x : this.mousePosition.x, y : this.mousePosition.y };
    }

    destroy ()
    {
        document.removeEventListener ('keydown', this.onKeyDown);
        document.removeEventListener ('keyup', this.onKeyUp);
        this.canvasElement.removeEventListener ('mousedown', this.onMouseDown);
        this.canvasElement.removeEventListener ('mousemove', this.onMouseMove);
        this.canvasElement.removeEventListener ('mouseup', this.onMouseUp);
        window.removeEventListener ('blur', this.onBlur);
    }

    OnKeyDown (ev)
    {
        this.modifiers.ctrl = ev.ctrlKey;
        this.modifiers.shift = ev.shiftKey;
        this.modifiers.alt = ev.altKey;
        this.modifiers.meta = ev.metaKey;
    }

    OnKeyUp (ev)
    {
        this.modifiers.ctrl = ev.ctrlKey;
        this.modifiers.shift = ev.shiftKey;
        this.modifiers.alt = ev.altKey;
        this.modifiers.meta = ev.metaKey;
    }

    OnMouseDown (ev)
    {
        this.buttonsDown.add (ev.button);
        this.UpdateMousePosition (ev);
    }

    OnMouseMove (ev)
    {
        this.UpdateMousePosition (ev);
    }

    OnMouseUp (ev)
    {
        this.buttonsDown.delete (ev.button);
        this.UpdateMousePosition (ev);
    }

    OnBlur ()
    {
        this.modifiers.ctrl = false;
        this.modifiers.shift = false;
        this.modifiers.alt = false;
        this.modifiers.meta = false;
        this.buttonsDown.clear ();
    }

    UpdateMousePosition (ev)
    {
        let coords = GetDomElementClientCoordinates (this.canvasElement, ev.clientX, ev.clientY);
        this.mousePosition.x = coords.x;
        this.mousePosition.y = coords.y;
    }
}
