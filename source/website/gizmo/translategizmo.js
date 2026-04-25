import * as THREE from 'three';
import { GizmoBase } from './gizmobase.js';
import { Transformation } from '../../engine/geometry/transformation.js';
import { Matrix } from '../../engine/geometry/matrix.js';

const AXIS_COLORS = {
    x : 0xff3333,
    y : 0x33ff33,
    z : 0x3333ff
};

const HOVER_COLORS = {
    x : 0xff9999,
    y : 0x99ff99,
    z : 0x9999ff
};

const PLANE_COLORS = {
    xy : 0x3333ff,  // Z missing → blue tint
    xz : 0x33ff33,  // Y missing → green tint
    yz : 0xff3333   // X missing → red tint
};

function CreateAxisArrow (axis, color)
{
    let group = new THREE.Group ();

    // Shaft
    let shaftGeo = new THREE.CylinderGeometry (0.02, 0.02, 1.0, 8);
    let mat = new THREE.MeshBasicMaterial ({ color : color, depthTest : false, transparent : true, opacity : 0.9 });
    let shaft = new THREE.Mesh (shaftGeo, mat.clone ());
    shaft.position.y = 0.5;
    group.add (shaft);

    // Head (cone)
    let headGeo = new THREE.ConeGeometry (0.08, 0.25, 16);
    let head = new THREE.Mesh (headGeo, mat.clone ());
    head.position.y = 1.125;
    group.add (head);

    // Orient to axis
    if (axis === 'x') {
        group.rotation.z = -Math.PI / 2;
    } else if (axis === 'z') {
        group.rotation.x = Math.PI / 2;
    }
    // y is default (up)

    // Tag all meshes with axis name
    group.traverse ((child) => {
        if (child.isMesh) {
            child.userData.axisName = axis;
            child.userData.originalColor = color;
        }
    });

    return group;
}

function CreatePlaneHandle (plane, color)
{
    let geo = new THREE.PlaneGeometry (0.3, 0.3);
    let mat = new THREE.MeshBasicMaterial ({
        color : color,
        depthTest : false,
        transparent : true,
        opacity : 0.3,
        side : THREE.DoubleSide
    });
    let mesh = new THREE.Mesh (geo, mat);

    // Position offset and orientation per plane
    if (plane === 'xy') {
        mesh.position.set (0.4, 0.4, 0);
    } else if (plane === 'xz') {
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set (0.4, 0, 0.4);
    } else if (plane === 'yz') {
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set (0, 0.4, 0.4);
    }

    mesh.userData.axisName = plane;
    mesh.userData.originalColor = color;
    return mesh;
}

export class TranslateGizmo extends GizmoBase
{
    constructor (viewer, snapSystem, inputManager)
    {
        super (viewer);
        this.snapSystem = snapSystem;
        this.inputManager = inputManager;

        this.dragAxis = null;
        this.startMousePos = null;
        this.startWorldPositions = null;
        this.selectedEntries = null;
        this.model = null;

        // For drag projection
        this.dragPlaneNormal = new THREE.Vector3 ();
        this.dragPlane = new THREE.Plane ();
        this.dragStartPoint = new THREE.Vector3 ();
    }

    SetModelRef (model)
    {
        this.model = model;
    }

    BuildMesh ()
    {
        // Axes
        let axes = ['x', 'y', 'z'];
        for (let axis of axes) {
            let arrow = CreateAxisArrow (axis, AXIS_COLORS[axis]);
            this.rootGroup.add (arrow);
        }

        // Plane handles
        let planes = ['xy', 'xz', 'yz'];
        for (let plane of planes) {
            let handle = CreatePlaneHandle (plane, PLANE_COLORS[plane]);
            this.rootGroup.add (handle);
        }
    }

    OnHoverEnter (axisName)
    {
        this.SetAxisColor (axisName, HOVER_COLORS[axisName] || 0xffffff);
    }

    OnHoverLeave (axisName)
    {
        this.rootGroup.traverse ((child) => {
            if (child.isMesh && child.userData.axisName === axisName) {
                child.material.color.setHex (child.userData.originalColor);
            }
        });
    }

    SetAxisColor (axisName, color)
    {
        this.rootGroup.traverse ((child) => {
            if (child.isMesh && child.userData.axisName === axisName) {
                child.material.color.setHex (color);
            }
        });
    }

    OnDragStart (axisName, mousePos, threeCamera, canvasSize, entries)
    {
        this.dragAxis = axisName;
        this.startMousePos = mousePos.clone ();
        this.selectedEntries = entries;

        // Store start world positions for all selected nodes
        this.startWorldPositions = new Map ();
        if (this.model) {
            for (let entry of entries) {
                let node = this.model.FindNodeById (entry.nodeId);
                if (node) {
                    let worldTransform = node.GetWorldTransformation ();
                    let m = worldTransform.GetMatrix ().Get ();
                    // Extract translation from row-major matrix (indices 12,13,14)
                    this.startWorldPositions.set (entry.key, new THREE.Vector3 (m[12], m[13], m[14]));
                }
            }
        }

        // Setup drag plane based on axis
        let pivot = this.rootGroup.position.clone ();
        this.SetupDragPlane (axisName, threeCamera, pivot);
        this.dragStartPoint = this.GetMouseWorldPos (mousePos, threeCamera, canvasSize);
    }

    SetupDragPlane (axisName, camera, pivot)
    {
        let cameraDir = new THREE.Vector3 ();
        camera.getWorldDirection (cameraDir);

        if (axisName === 'x') {
            let xAxis = new THREE.Vector3 (1, 0, 0);
            this.dragPlaneNormal = new THREE.Vector3 ().crossVectors (xAxis, cameraDir);
            if (this.dragPlaneNormal.lengthSq () < 0.001) {
                this.dragPlaneNormal = new THREE.Vector3 (0, 1, 0);
            }
            this.dragPlaneNormal.normalize ();
        } else if (axisName === 'y') {
            let yAxis = new THREE.Vector3 (0, 1, 0);
            this.dragPlaneNormal = new THREE.Vector3 ().crossVectors (yAxis, cameraDir);
            if (this.dragPlaneNormal.lengthSq () < 0.001) {
                this.dragPlaneNormal = new THREE.Vector3 (1, 0, 0);
            }
            this.dragPlaneNormal.normalize ();
        } else if (axisName === 'z') {
            let zAxis = new THREE.Vector3 (0, 0, 1);
            this.dragPlaneNormal = new THREE.Vector3 ().crossVectors (zAxis, cameraDir);
            if (this.dragPlaneNormal.lengthSq () < 0.001) {
                this.dragPlaneNormal = new THREE.Vector3 (0, 1, 0);
            }
            this.dragPlaneNormal.normalize ();
        } else if (axisName === 'xy') {
            this.dragPlaneNormal = new THREE.Vector3 (0, 0, 1);
        } else if (axisName === 'xz') {
            this.dragPlaneNormal = new THREE.Vector3 (0, 1, 0);
        } else if (axisName === 'yz') {
            this.dragPlaneNormal = new THREE.Vector3 (1, 0, 0);
        }

        this.dragPlane.setFromNormalAndCoplanarPoint (this.dragPlaneNormal, pivot);
    }

    GetMouseWorldPos (mousePos, threeCamera, canvasSize)
    {
        let ndc = new THREE.Vector2 (
            (mousePos.x / canvasSize.width) * 2 - 1,
            -(mousePos.y / canvasSize.height) * 2 + 1
        );
        let raycaster = new THREE.Raycaster ();
        raycaster.setFromCamera (ndc, threeCamera);
        let hitPoint = new THREE.Vector3 ();
        raycaster.ray.intersectPlane (this.dragPlane, hitPoint);
        return hitPoint;
    }

    OnDrag (mousePos, threeCamera, canvasSize)
    {
        if (this.dragAxis === null || this.model === null) {
            return;
        }

        let currentWorldPos = this.GetMouseWorldPos (mousePos, threeCamera, canvasSize);
        if (!currentWorldPos) {
            return;
        }

        let rawDelta = currentWorldPos.clone ().sub (this.dragStartPoint);

        // Project delta onto the drag axis
        let constrainedDelta = this.ConstrainDelta (rawDelta, this.dragAxis);

        // Apply snap
        let ctrlHeld = this.inputManager && this.inputManager.isCtrlPressed ();
        let snappedDelta = ctrlHeld ? constrainedDelta : this.snapSystem.snapTranslation (constrainedDelta);

        // Apply to all selected nodes
        if (this.selectedEntries && this.startWorldPositions) {
            for (let entry of this.selectedEntries) {
                let node = this.model.FindNodeById (entry.nodeId);
                if (!node) {
                    continue;
                }
                let startPos = this.startWorldPositions.get (entry.key);
                if (!startPos) {
                    continue;
                }
                let newWorldPos = startPos.clone ().add (snappedDelta);
                this.ApplyTranslationToNode (node, newWorldPos);
            }
        }

        this.viewer.Render ();
    }

    ConstrainDelta (delta, axisName)
    {
        if (axisName === 'x') {
            return new THREE.Vector3 (delta.x, 0, 0);
        } else if (axisName === 'y') {
            return new THREE.Vector3 (0, delta.y, 0);
        } else if (axisName === 'z') {
            return new THREE.Vector3 (0, 0, delta.z);
        } else if (axisName === 'xy') {
            return new THREE.Vector3 (delta.x, delta.y, 0);
        } else if (axisName === 'xz') {
            return new THREE.Vector3 (delta.x, 0, delta.z);
        } else if (axisName === 'yz') {
            return new THREE.Vector3 (0, delta.y, delta.z);
        }
        return delta.clone ();
    }

    ApplyTranslationToNode (node, newWorldPos)
    {
        // Get parent world transform to convert world pos to local pos
        let parent = node.GetParent ();
        if (parent !== null) {
            let parentWorld = parent.GetWorldTransformation ();
            let parentMatrix = new THREE.Matrix4 ();
            let pm = parentWorld.GetMatrix ().Get ();
            parentMatrix.set (
                pm[0], pm[4], pm[8],  pm[12],
                pm[1], pm[5], pm[9],  pm[13],
                pm[2], pm[6], pm[10], pm[14],
                pm[3], pm[7], pm[11], pm[15]
            );
            let parentInverse = new THREE.Matrix4 ().copy (parentMatrix).invert ();
            let localPos = newWorldPos.clone ().applyMatrix4 (parentInverse);
            this.SetNodeTranslation (node, localPos);
        } else {
            this.SetNodeTranslation (node, newWorldPos);
        }
    }

    SetNodeTranslation (node, localPos)
    {
        let transform = node.GetTransformation ();
        let m = transform.GetMatrix ().Get ();
        // Update translation components (row-major: indices 12,13,14)
        let newMatrix = m.slice ();
        newMatrix[12] = localPos.x;
        newMatrix[13] = localPos.y;
        newMatrix[14] = localPos.z;
        let newEngineMatrix = new Matrix (newMatrix);
        node.SetTransformation (new Transformation (newEngineMatrix));
    }

    OnDragEnd ()
    {
        this.dragAxis = null;
        this.startMousePos = null;
        this.startWorldPositions = null;
    }
}
