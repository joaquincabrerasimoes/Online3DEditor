import * as THREE from 'three';
import { Events } from '../eventbus.js';
import { TranslateGizmo } from './translategizmo.js';
import { RotateGizmo } from './rotategizmo.js';
import { ScaleGizmo } from './scalegizmo.js';

export class GizmoManager
{
    constructor (viewer, eventBus, selectionManager, inputManager, snapSystem)
    {
        this.viewer = viewer;
        this.eventBus = eventBus;
        this.selectionManager = selectionManager;
        this.inputManager = inputManager;
        this.snapSystem = snapSystem;
        this.model = null;

        this.activeMode = null;
        this.activeGizmo = null;
        this.isDragging = false;
        this.hoveredAxis = null;

        this.translateGizmo = new TranslateGizmo (viewer, snapSystem, inputManager);
        this.rotateGizmo = new RotateGizmo (viewer, snapSystem, inputManager);
        this.scaleGizmo = new ScaleGizmo (viewer, snapSystem, inputManager);

        this.translateGizmo.BuildMesh ();
        this.rotateGizmo.BuildMesh ();
        this.scaleGizmo.BuildMesh ();

        this.pivot = null;
        this.prevMousePos = null;

        this.canvas = viewer.GetCanvas ();
        this.onMouseMove = this.OnMouseMove.bind (this);
        this.onMouseDown = this.OnMouseDown.bind (this);
        this.onMouseUp = this.OnMouseUp.bind (this);

        this.canvas.addEventListener ('mousemove', this.onMouseMove, { capture : true });
        this.canvas.addEventListener ('mousedown', this.onMouseDown, { capture : true });
        this.canvas.addEventListener ('mouseup', this.onMouseUp, { capture : true });

        eventBus.on (Events.ModeChanged, ({ mode }) => {
            this.OnModeChanged (mode);
        });

        eventBus.on (Events.SelectionChanged, ({ entries }) => {
            this.OnSelectionChanged (entries);
        });

        eventBus.on (Events.TransformApplied, () => {
            this.UpdatePivotFromSelection ();
        });
    }

    SetModelRef (model)
    {
        this.model = model;
        this.translateGizmo.SetModelRef (model);
        this.rotateGizmo.SetModelRef (model);
        this.scaleGizmo.SetModelRef (model);
    }

    // Called by Navigation's isGizmoDragging callback
    IsDragging ()
    {
        return this.isDragging;
    }

    // Set mode explicitly (from ModeCoordinator or toolbar)
    setMode (mode)
    {
        this.OnModeChanged (mode);
    }

    show ()
    {
        if (this.activeGizmo && this.pivot) {
            this.activeGizmo.Show ();
        }
    }

    hide ()
    {
        if (this.activeGizmo) {
            this.activeGizmo.Hide ();
        }
    }

    updatePivot ()
    {
        this.UpdatePivotFromSelection ();
    }

    OnModeChanged (mode)
    {
        let transformModes = ['translate', 'rotate', 'scale'];

        // Hide current gizmo
        if (this.activeGizmo) {
            this.activeGizmo.Hide ();
        }

        if (!transformModes.includes (mode)) {
            this.activeMode = null;
            this.activeGizmo = null;
            return;
        }

        this.activeMode = mode;
        if (mode === 'translate') {
            this.activeGizmo = this.translateGizmo;
        } else if (mode === 'rotate') {
            this.activeGizmo = this.rotateGizmo;
        } else if (mode === 'scale') {
            this.activeGizmo = this.scaleGizmo;
        }

        // Show if selection exists
        let entries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh' || e.type === 'node');
        if (entries.length > 0) {
            this.UpdatePivotFromSelection ();
            this.activeGizmo.Show ();
        }
    }

    OnSelectionChanged (entries)
    {
        let meshEntries = entries.filter ((e) => e.type === 'mesh' || e.type === 'node');

        if (meshEntries.length === 0) {
            if (this.activeGizmo) {
                this.activeGizmo.Hide ();
            }
            this.pivot = null;
            return;
        }

        if (this.activeGizmo && this.activeMode !== null) {
            this.UpdatePivotFromSelection ();
            this.activeGizmo.Show ();
        }
    }

    UpdatePivotFromSelection ()
    {
        if (this.model === null) {
            return;
        }

        let entries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh' || e.type === 'node');
        if (entries.length === 0) {
            return;
        }

        let sumX = 0, sumY = 0, sumZ = 0, count = 0;

        for (let entry of entries) {
            let node = this.model.FindNodeById (entry.nodeId);
            if (!node) {
                continue;
            }
            let worldTransform = node.GetWorldTransformation ();
            let m = worldTransform.GetMatrix ().Get ();
            sumX += m[12];
            sumY += m[13];
            sumZ += m[14];
            count++;
        }

        if (count === 0) {
            return;
        }

        this.pivot = new THREE.Vector3 (sumX / count, sumY / count, sumZ / count);

        if (this.activeGizmo) {
            this.activeGizmo.UpdatePivot (this.pivot);
            this.UpdateGizmoScale ();
        }
    }

    UpdateGizmoScale ()
    {
        if (!this.activeGizmo || !this.pivot) {
            return;
        }
        let camera = this.viewer.GetCamera ();
        let camPos = new THREE.Vector3 (camera.eye.x, camera.eye.y, camera.eye.z);
        let dist = camPos.distanceTo (this.pivot);
        this.activeGizmo.SetScale (dist);
    }

    BuildRaycaster (ev)
    {
        let canvas = this.canvas;
        let rect = canvas.getBoundingClientRect ();
        let x = ev.clientX - rect.left;
        let y = ev.clientY - rect.top;
        let canvasSize = this.viewer.GetCanvasSize ();
        let ndc = new THREE.Vector2 (
            (x / canvasSize.width) * 2 - 1,
            -(y / canvasSize.height) * 2 + 1
        );
        let raycaster = new THREE.Raycaster ();
        let threeCamera = this.viewer.GetThreeCamera ();
        raycaster.setFromCamera (ndc, threeCamera);
        return raycaster;
    }

    GetMouseCanvasPos (ev)
    {
        let rect = this.canvas.getBoundingClientRect ();
        return new THREE.Vector2 (ev.clientX - rect.left, ev.clientY - rect.top);
    }

    OnMouseMove (ev)
    {
        if (this.activeGizmo === null || !this.activeGizmo.IsVisible ()) {
            return;
        }

        let mousePos = this.GetMouseCanvasPos (ev);
        let canvasSize = this.viewer.GetCanvasSize ();
        let threeCamera = this.viewer.GetThreeCamera ();

        if (this.isDragging) {
            this.activeGizmo.OnDrag (mousePos, threeCamera, canvasSize);
            this.UpdateGizmoScale ();
            ev.stopImmediatePropagation ();
            return;
        }

        // Hover detection
        let raycaster = this.BuildRaycaster (ev);
        let result = this.activeGizmo.GetHandleAtRay (raycaster);

        if (result.hit) {
            this.activeGizmo.UpdateHover (result.axisName);
            this.canvas.style.cursor = 'grab';
            this.viewer.Render ();
        } else {
            this.activeGizmo.UpdateHover (null);
            this.canvas.style.cursor = '';
            this.viewer.Render ();
        }
    }

    OnMouseDown (ev)
    {
        if (ev.button !== 0) {
            return;
        }

        if (this.activeGizmo === null || !this.activeGizmo.IsVisible ()) {
            return;
        }

        let raycaster = this.BuildRaycaster (ev);
        let result = this.activeGizmo.GetHandleAtRay (raycaster);

        if (!result.hit) {
            return;
        }

        // Consume this event — prevent Navigation from processing it
        ev.stopImmediatePropagation ();

        let mousePos = this.GetMouseCanvasPos (ev);
        let canvasSize = this.viewer.GetCanvasSize ();
        let threeCamera = this.viewer.GetThreeCamera ();
        let entries = this.selectionManager.getSelection ().filter ((e) => e.type === 'mesh' || e.type === 'node');

        this.isDragging = true;
        this.canvas.style.cursor = 'grabbing';
        this.activeGizmo.OnDragStart (result.axisName, mousePos, threeCamera, canvasSize, entries);
        this.eventBus.emit (Events.GizmoDragStart, { mode : this.activeMode });
    }

    OnMouseUp (ev)
    {
        if (!this.isDragging) {
            return;
        }

        this.isDragging = false;
        this.canvas.style.cursor = '';
        this.activeGizmo.OnDragEnd ();
        this.eventBus.emit (Events.GizmoDragEnd, { mode : this.activeMode });
        this.eventBus.emit (Events.TransformApplied, {
            mode : this.activeMode,
            ids : this.selectionManager.getSelection ().map ((e) => e.key)
        });
    }

    destroy ()
    {
        this.canvas.removeEventListener ('mousemove', this.onMouseMove, { capture : true });
        this.canvas.removeEventListener ('mousedown', this.onMouseDown, { capture : true });
        this.canvas.removeEventListener ('mouseup', this.onMouseUp, { capture : true });
    }
}
