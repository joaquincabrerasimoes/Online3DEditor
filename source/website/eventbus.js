export const Events = {
    SelectionChanged : 'selection.changed',
    SelectionSelectAll : 'selection.selectAll',
    SelectionDeleteRequested : 'selection.deleteRequested',
    ModeChanged : 'mode.changed',
    GizmoDragStart : 'gizmo.dragStart',
    GizmoDragEnd : 'gizmo.dragEnd',
    TransformApplied : 'transform.applied',
    MeasureToggled : 'measure.toggled',
    SnapToggled : 'snap.toggled',
    GroupChanged : 'group.changed',
    CameraFocusRequested : 'camera.focusRequested',
};

export class EventBus
{
    constructor ()
    {
        this.listeners = new Map ();
    }

    on (event, callback)
    {
        if (!this.listeners.has (event)) {
            this.listeners.set (event, new Set ());
        }
        this.listeners.get (event).add (callback);
    }

    off (event, callback)
    {
        if (!this.listeners.has (event)) {
            return;
        }
        this.listeners.get (event).delete (callback);
    }

    emit (event, data)
    {
        if (!this.listeners.has (event)) {
            return;
        }
        for (let callback of this.listeners.get (event)) {
            callback (data);
        }
    }

    once (event, callback)
    {
        let wrapper = (data) => {
            callback (data);
            this.off (event, wrapper);
        };
        this.on (event, wrapper);
    }
}

const eventBus = new EventBus ();
export default eventBus;
