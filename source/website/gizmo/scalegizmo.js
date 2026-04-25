import * as THREE from 'three';
import { GizmoBase } from './gizmobase.js';
import { Transformation } from '../../engine/geometry/transformation.js';
import { Matrix } from '../../engine/geometry/matrix.js';

const AXIS_COLORS = { x : 0xff3333, y : 0x33ff33, z : 0x3333ff, uniform : 0xffffff };
const HOVER_COLORS = { x : 0xff9999, y : 0x99ff99, z : 0x9999ff, uniform : 0xffff99 };

function CreateAxisHandle (axis, color)
{
    let group = new THREE.Group ();

    // Shaft
    let shaftGeo = new THREE.CylinderGeometry (0.02, 0.02, 1.0, 8);
    let mat = new THREE.MeshBasicMaterial ({ color : color, depthTest : false, transparent : true, opacity : 0.9 });
    let shaft = new THREE.Mesh (shaftGeo, mat.clone ());
    shaft.position.y = 0.5;
    shaft.userData.axisName = axis;
    shaft.userData.originalColor = color;
    group.add (shaft);

    // End cube
    let cubeGeo = new THREE.BoxGeometry (0.12, 0.12, 0.12);
    let cube = new THREE.Mesh (cubeGeo, mat.clone ());
    cube.position.y = 1.06;
    cube.userData.axisName = axis;
    cube.userData.originalColor = color;
    group.add (cube);

    if (axis === 'x') {
        group.rotation.z = -Math.PI / 2;
    } else if (axis === 'z') {
        group.rotation.x = Math.PI / 2;
    }

    return group;
}

export class ScaleGizmo extends GizmoBase
{
    constructor (viewer, snapSystem, inputManager)
    {
        super (viewer);
        this.snapSystem = snapSystem;
        this.inputManager = inputManager;

        this.dragAxis = null;
        this.startMousePos = null;
        this.startTransformations = null;
        this.selectedEntries = null;
        this.model = null;
        this.pivotScreen = new THREE.Vector2 ();
        this.startDist = 1.0;
    }

    SetModelRef (model)
    {
        this.model = model;
    }

    BuildMesh ()
    {
        for (let axis of ['x', 'y', 'z']) {
            this.rootGroup.add (CreateAxisHandle (axis, AXIS_COLORS[axis]));
        }

        // Center uniform scale cube
        let centerGeo = new THREE.BoxGeometry (0.18, 0.18, 0.18);
        let centerMat = new THREE.MeshBasicMaterial ({
            color : AXIS_COLORS.uniform,
            depthTest : false,
            transparent : true,
            opacity : 0.9
        });
        let center = new THREE.Mesh (centerGeo, centerMat);
        center.userData.axisName = 'uniform';
        center.userData.originalColor = AXIS_COLORS.uniform;
        this.rootGroup.add (center);
    }

    OnHoverEnter (axisName)
    {
        this.rootGroup.traverse ((child) => {
            if (child.isMesh && child.userData.axisName === axisName) {
                child.material.color.setHex (HOVER_COLORS[axisName] || 0xffffff);
            }
        });
    }

    OnHoverLeave (axisName)
    {
        this.rootGroup.traverse ((child) => {
            if (child.isMesh && child.userData.axisName === axisName) {
                child.material.color.setHex (child.userData.originalColor);
            }
        });
    }

    OnDragStart (axisName, mousePos, threeCamera, canvasSize, entries)
    {
        this.dragAxis = axisName;
        this.selectedEntries = entries;
        this.startMousePos = mousePos.clone ();

        let pivot4d = this.rootGroup.position.clone ().project (threeCamera);
        this.pivotScreen.set (
            (pivot4d.x + 1) / 2 * canvasSize.width,
            (1 - (pivot4d.y + 1) / 2) * canvasSize.height
        );

        let dx = mousePos.x - this.pivotScreen.x;
        let dy = mousePos.y - this.pivotScreen.y;
        this.startDist = Math.sqrt (dx * dx + dy * dy) || 1.0;

        this.startTransformations = new Map ();
        if (this.model) {
            for (let entry of entries) {
                let node = this.model.FindNodeById (entry.nodeId);
                if (node) {
                    this.startTransformations.set (entry.key, node.GetTransformation ().Clone ());
                }
            }
        }
    }

    OnDrag (mousePos, threeCamera, canvasSize)
    {
        if (this.dragAxis === null || this.model === null) {
            return;
        }

        let dx = mousePos.x - this.pivotScreen.x;
        let dy = mousePos.y - this.pivotScreen.y;
        let currentDist = Math.sqrt (dx * dx + dy * dy) || 1.0;
        let rawFactor = currentDist / this.startDist;

        // Clamp to prevent zero/negative
        rawFactor = Math.max (rawFactor, 0.01);

        // Alt held during drag → bypass snap (free placement)
        let altHeld = this.inputManager && this.inputManager.isAltPressed ();
        let snappedFactor = altHeld ? rawFactor : this.snapSystem.snapScale (rawFactor);
        snappedFactor = Math.max (snappedFactor, 0.01);

        let pivot = this.rootGroup.position;

        if (this.selectedEntries && this.startTransformations) {
            for (let entry of this.selectedEntries) {
                let node = this.model.FindNodeById (entry.nodeId);
                if (!node) {
                    continue;
                }
                let startTransform = this.startTransformations.get (entry.key);
                if (!startTransform) {
                    continue;
                }
                this.ApplyScaleToNode (node, startTransform, snappedFactor, pivot);
            }
        }

        this.viewer.Render ();
    }

    ApplyScaleToNode (node, startTransform, factor, pivot)
    {
        let axis = this.dragAxis;
        let sx = (axis === 'x' || axis === 'uniform') ? factor : 1.0;
        let sy = (axis === 'y' || axis === 'uniform') ? factor : 1.0;
        let sz = (axis === 'z' || axis === 'uniform') ? factor : 1.0;

        // Scale around pivot: T_new = Translate(pivot) * Scale(s) * Translate(-pivot) * T_start
        let toPivot = new Matrix ().CreateTranslation (-pivot.x, -pivot.y, -pivot.z);
        let scaleMatrix = new Matrix ().CreateScale (sx, sy, sz);
        let fromPivot = new Matrix ().CreateTranslation (pivot.x, pivot.y, pivot.z);

        let parent = node.GetParent ();
        let parentWorldMatrix = null;
        let parentWorldInv = null;
        if (parent !== null) {
            parentWorldMatrix = parent.GetWorldTransformation ().GetMatrix ().Clone ();
            parentWorldInv = parentWorldMatrix.Clone ();
            parentWorldInv.Invert ();
        }

        let startLocal = startTransform.GetMatrix ();
        let startWorld = parent !== null
            ? startLocal.MultiplyMatrix (parentWorldMatrix)
            : startLocal.Clone ();

        let result = startWorld.Clone ();
        result = toPivot.MultiplyMatrix (result);
        result = scaleMatrix.MultiplyMatrix (result);
        result = fromPivot.MultiplyMatrix (result);

        let newLocal = parentWorldInv !== null
            ? result.MultiplyMatrix (parentWorldInv)
            : result;

        node.SetTransformation (new Transformation (newLocal));
    }

    OnDragEnd ()
    {
        this.dragAxis = null;
        this.startTransformations = null;
    }
}
