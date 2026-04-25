// MarqueeSelector — left-click + drag on empty space draws a rectangle.
// On mouseup, fires onMarqueeEnd(rect, modifiers, startedOnMesh).
//
// Behavior contract:
//   - Drag distance < 5px → no marquee (treated as click; ignored here)
//   - Drag started ON a 3D mesh → marquee suppressed (object click flow handles it)
//   - Empty rectangle release → onMarqueeEnd is still fired so caller can deselect-all
//   - Modifiers (ctrl/shift/alt) captured at mouse-up time and passed to caller

const MARQUEE_THRESHOLD_PX = 5;

export class MarqueeSelector
{
    constructor (canvas, parentDiv)
    {
        this.canvas = canvas;
        this.parentDiv = parentDiv;
        this.startPos = null;
        this.endPos = null;
        this.isActive = false;
        this.suppressed = false;     // true → drag started on mesh, ignore
        this.overlayDiv = null;
        this.onMarqueeEnd = null;    // (rect, modifiers, startedOnMesh) => void
        this.shouldSuppress = null;  // (mouseEv) => boolean — caller decides

        this.boundOnDown = this.OnMouseDown.bind (this);
        this.boundOnMove = this.OnMouseMove.bind (this);
        this.boundOnUp = this.OnMouseUp.bind (this);

        this.canvas.addEventListener ('mousedown', this.boundOnDown);
        document.addEventListener ('mousemove', this.boundOnMove);
        document.addEventListener ('mouseup', this.boundOnUp);
    }

    SetOnMarqueeEnd (callback)
    {
        this.onMarqueeEnd = callback;
    }

    SetShouldSuppress (predicate)
    {
        // predicate (mouseEv) → true means "don't start marquee on this mousedown"
        // Used for: drag started on a mesh, or gizmo handle hit, etc.
        this.shouldSuppress = predicate;
    }

    OnMouseDown (ev)
    {
        if (ev.button !== 0) {
            return;
        }
        if (this.shouldSuppress && this.shouldSuppress (ev)) {
            this.suppressed = true;
            this.startPos = null;
            return;
        }
        this.suppressed = false;
        this.startPos = this.GetCanvasPos (ev);
        this.endPos = { x : this.startPos.x, y : this.startPos.y };
        this.isActive = false; // becomes true once threshold passed
    }

    OnMouseMove (ev)
    {
        if (!this.startPos || this.suppressed) {
            return;
        }
        this.endPos = this.GetCanvasPos (ev);
        let dx = this.endPos.x - this.startPos.x;
        let dy = this.endPos.y - this.startPos.y;
        let dist = Math.sqrt (dx * dx + dy * dy);
        if (dist > MARQUEE_THRESHOLD_PX) {
            if (!this.isActive) {
                this.isActive = true;
                this.ShowOverlay ();
            }
            this.UpdateOverlay ();
        }
    }

    OnMouseUp (ev)
    {
        if (ev.button !== 0) {
            return;
        }
        if (this.suppressed || !this.startPos) {
            this.suppressed = false;
            this.startPos = null;
            this.isActive = false;
            this.HideOverlay ();
            return;
        }

        let wasActive = this.isActive;
        let rect = this.GetRect ();
        let modifiers = {
            ctrl : ev.ctrlKey || ev.metaKey,
            shift : ev.shiftKey,
            alt : ev.altKey
        };

        this.startPos = null;
        this.endPos = null;
        this.isActive = false;
        this.HideOverlay ();

        if (wasActive && this.onMarqueeEnd) {
            this.onMarqueeEnd (rect, modifiers);
        }
    }

    GetCanvasPos (ev)
    {
        let r = this.canvas.getBoundingClientRect ();
        return {
            x : ev.clientX - r.left,
            y : ev.clientY - r.top
        };
    }

    GetRect ()
    {
        let x1 = Math.min (this.startPos.x, this.endPos.x);
        let y1 = Math.min (this.startPos.y, this.endPos.y);
        let x2 = Math.max (this.startPos.x, this.endPos.x);
        let y2 = Math.max (this.startPos.y, this.endPos.y);
        return { x1 : x1, y1 : y1, x2 : x2, y2 : y2 };
    }

    ShowOverlay ()
    {
        if (!this.overlayDiv) {
            this.overlayDiv = document.createElement ('div');
            this.overlayDiv.className = 'ov_marquee_selector';
            this.parentDiv.appendChild (this.overlayDiv);
        }
        this.overlayDiv.style.display = 'block';
    }

    HideOverlay ()
    {
        if (this.overlayDiv) {
            this.overlayDiv.style.display = 'none';
        }
    }

    UpdateOverlay ()
    {
        if (!this.overlayDiv) {
            return;
        }
        let rect = this.GetRect ();
        let canvasRect = this.canvas.getBoundingClientRect ();
        let parentRect = this.parentDiv.getBoundingClientRect ();
        let left = (canvasRect.left - parentRect.left) + rect.x1;
        let top = (canvasRect.top - parentRect.top) + rect.y1;
        this.overlayDiv.style.left = left + 'px';
        this.overlayDiv.style.top = top + 'px';
        this.overlayDiv.style.width = (rect.x2 - rect.x1) + 'px';
        this.overlayDiv.style.height = (rect.y2 - rect.y1) + 'px';
    }

    destroy ()
    {
        this.canvas.removeEventListener ('mousedown', this.boundOnDown);
        document.removeEventListener ('mousemove', this.boundOnMove);
        document.removeEventListener ('mouseup', this.boundOnUp);
        if (this.overlayDiv && this.overlayDiv.parentNode) {
            this.overlayDiv.remove ();
        }
    }
}
