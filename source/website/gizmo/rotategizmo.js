import * as THREE from 'three';
import { GizmoBase } from './gizmobase.js';
import { Transformation } from '../../engine/geometry/transformation.js';
import { Matrix } from '../../engine/geometry/matrix.js';

const AXIS_COLORS = { x : 0xff3333, y : 0x33ff33, z : 0x3333ff };
const HOVER_COLORS = { x : 0xff9999, y : 0x99ff99, z : 0x9999ff };

function CreateRing (axis, color)
{
    let geo = new THREE.TorusGeometry (1.0, 0.02, 8, 64);
    let mat = new THREE.MeshBasicMaterial ({
        color : color,
        depthTest : false,
        transparent : true,
        opacity : 0.9,
        side : THREE.DoubleSide
    });
    let mesh = new THREE.Mesh (geo, mat);

    if (axis === 'x') {
        mesh.rotation.y = Math.PI / 2;
    } else if (axis === 'z') {
        mesh.rotation.x = Math.PI / 2;
    }
    // y: default orientation lies in XZ plane, need to rotate to XY
    // Actually for Y axis ring: we want it in XZ plane → default torus is in XY so rotate X by 90
    if (axis === 'y') {
        mesh.rotation.x = Math.PI / 2;
    }

    mesh.userData.axisName = axis;
    mesh.userData.originalColor = color;
    return mesh;
}

export class RotateGizmo extends GizmoBase
{
    constructor (viewer, snapSystem, inputManager)
    {
        super (viewer);
        this.snapSystem = snapSystem;
        this.inputManager = inputManager;

        this.dragAxis = null;
        this.startAngle = null;
        this.startTransformations = null;
        this.selectedEntries = null;
        this.model = null;
        this.pivotWorld = new THREE.Vector3 ();
        this.screenCenter = new THREE.Vector2 ();
    }

    SetModelRef (model)
    {
        this.model = model;
    }

    BuildMesh ()
    {
        for (let axis of ['x', 'y', 'z']) {
            this.rootGroup.add (CreateRing (axis, AXIS_COLORS[axis]));
        }
    }

    OnHoverEnter (axisName)
    {
        let mesh = this.GetMeshForAxis (axisName);
        if (mesh) {
            mesh.material.color.setHex (HOVER_COLORS[axisName] || 0xffffff);
        }
    }

    OnHoverLeave (axisName)
    {
        let mesh = this.GetMeshForAxis (axisName);
        if (mesh) {
            mesh.material.color.setHex (mesh.userData.originalColor);
        }
    }

    OnDragStart (axisName, mousePos, threeCamera, canvasSize, entries)
    {
        this.dragAxis = axisName;
        this.selectedEntries = entries;
        this.pivotWorld = this.rootGroup.position.clone ();

        // Store pivot in screen space for angle calculation
        let pivot4d = this.pivotWorld.clone ().project (threeCamera);
        this.screenCenter.set (
            (pivot4d.x + 1) / 2 * canvasSize.width,
            (1 - (pivot4d.y + 1) / 2) * canvasSize.height
        );

        this.startAngle = Math.atan2 (
            mousePos.y - this.screenCenter.y,
            mousePos.x - this.screenCenter.x
        );

        // Snapshot start transformations
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

        let currentAngle = Math.atan2 (
            mousePos.y - this.screenCenter.y,
            mousePos.x - this.screenCenter.x
        );
        let rawDelta = currentAngle - this.startAngle;

        // Alt held during drag → bypass snap (free placement)
        let altHeld = this.inputManager && this.inputManager.isAltPressed ();
        let snappedDelta = altHeld ? rawDelta : this.snapSystem.snapRotation (rawDelta);

        // Get rotation axis in world space
        let axisVec = new THREE.Vector3 ();
        if (this.dragAxis === 'x') { axisVec.set (1, 0, 0); }
        else if (this.dragAxis === 'y') { axisVec.set (0, 1, 0); }
        else if (this.dragAxis === 'z') { axisVec.set (0, 0, 1); }

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
                this.ApplyRotationToNode (node, startTransform, axisVec, snappedDelta);
            }
        }

        this.viewer.Render ();
    }

    ApplyRotationToNode (node, startTransform, axisVec, angle)
    {
        // Rotate around pivot: T_new = Translate(pivot) * Rotate(axis, angle) * Translate(-pivot) * T_start
        let pivot = this.pivotWorld;

        // Build rotation matrix using engine's Matrix
        let coord3DAxis = { x : axisVec.x, y : axisVec.y, z : axisVec.z };
        let rotMatrix = new Matrix ().CreateRotationAxisAngle (coord3DAxis, angle);

        // Build translate-to-pivot matrix
        let toPivot = new Matrix ().CreateTranslation (-pivot.x, -pivot.y, -pivot.z);
        let fromPivot = new Matrix ().CreateTranslation (pivot.x, pivot.y, pivot.z);

        // T_world_new = fromPivot * rot * toPivot * T_start_world
        // For simplicity, apply to local transform directly (works when parent is identity)
        let parent = node.GetParent ();
        let parentWorldInv = null;
        if (parent !== null) {
            let pw = parent.GetWorldTransformation ().GetMatrix ();
            let pwInv = pw.Clone ();
            pwInv.Invert ();
            parentWorldInv = pwInv;
        }

        // Get start world transform
        let startLocal = startTransform.GetMatrix ();
        let startWorld = parent !== null
            ? startLocal.MultiplyMatrix (parent.GetWorldTransformation ().GetMatrix ())
            : startLocal.Clone ();

        // Apply: fromPivot * rot * toPivot * startWorld
        let result = startWorld.Clone ();
        result = toPivot.MultiplyMatrix (result);
        result = rotMatrix.MultiplyMatrix (result);
        result = fromPivot.MultiplyMatrix (result);

        // Convert back to local
        let newLocal = parentWorldInv !== null
            ? result.MultiplyMatrix (parentWorldInv)
            : result;

        node.SetTransformation (new Transformation (newLocal));
    }

    OnDragEnd ()
    {
        this.dragAxis = null;
        this.startAngle = null;
        this.startTransformations = null;
    }
}
