import { Events } from './eventbus.js';

export class ModeCoordinator
{
    constructor (eventBus, gizmoManager, measureTool, selectionManager, contextMenu)
    {
        this.eventBus = eventBus;
        this.gizmoManager = gizmoManager;
        this.measureTool = measureTool;
        this.selectionManager = selectionManager;
        this.contextMenu = contextMenu;
        this.currentMode = 'none';

        eventBus.on (Events.ModeChanged, ({ mode }) => {
            this.OnModeChanged (mode);
        });

        eventBus.on (Events.SelectionChanged, ({ entries }) => {
            this.OnSelectionChanged (entries);
        });

        eventBus.on (Events.TransformApplied, () => {
            if (this.gizmoManager) {
                this.gizmoManager.updatePivot ();
            }
        });
    }

    OnModeChanged (mode)
    {
        let prevMode = this.currentMode;
        this.currentMode = mode;

        if (this.contextMenu) {
            this.contextMenu.hide ();
        }

        switch (mode) {
            case 'translate':
            case 'rotate':
            case 'scale':
                // Gizmo activation handled by GizmoManager's own subscription
                // Exit measure if was active
                if (prevMode === 'measure' && this.measureTool) {
                    this.measureTool.ExitActive ();
                }
                break;

            case 'measure':
                // Hide gizmo
                if (this.gizmoManager) {
                    this.gizmoManager.hide ();
                    this.gizmoManager.activeMode = null;
                    this.gizmoManager.activeGizmo = null;
                }
                // Deselect objects
                if (this.selectionManager) {
                    this.selectionManager.deselectAll ();
                }
                break;

            case 'none':
                // GizmoManager handles its own hide on ModeChanged
                // Measure tool handles its own exit via its own subscription
                break;
        }
    }

    OnSelectionChanged (entries)
    {
        // When selection goes empty in a transform mode, hide gizmo
        let meshEntries = entries.filter ((e) => e.type === 'mesh' || e.type === 'node');
        let transformModes = ['translate', 'rotate', 'scale'];

        if (meshEntries.length === 0 && transformModes.includes (this.currentMode)) {
            if (this.gizmoManager) {
                this.gizmoManager.hide ();
            }
        } else if (meshEntries.length > 0 && transformModes.includes (this.currentMode)) {
            if (this.gizmoManager) {
                this.gizmoManager.show ();
                this.gizmoManager.updatePivot ();
            }
        }
    }
}
