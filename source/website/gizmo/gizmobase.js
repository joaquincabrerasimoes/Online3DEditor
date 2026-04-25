import * as THREE from 'three';

export class GizmoBase
{
    constructor (viewer)
    {
        this.viewer = viewer;
        this.rootGroup = new THREE.Group ();
        this.rootGroup.visible = false;
        this.inScene = false;
        this.hoveredAxis = null;
    }

    // Called once to build geometry — override in subclass
    BuildMesh ()
    {
        throw new Error ('GizmoBase.BuildMesh must be overridden');
    }

    // Hover feedback — override in subclass
    OnHoverEnter (axisName)
    {
        throw new Error ('GizmoBase.OnHoverEnter must be overridden');
    }

    OnHoverLeave (axisName)
    {
        throw new Error ('GizmoBase.OnHoverLeave must be overridden');
    }

    // Drag lifecycle — override in subclass
    OnDragStart (axisName, mousePos)
    {
        throw new Error ('GizmoBase.OnDragStart must be overridden');
    }

    OnDrag (mousePos, mouseDelta)
    {
        throw new Error ('GizmoBase.OnDrag must be overridden');
    }

    OnDragEnd ()
    {
        throw new Error ('GizmoBase.OnDragEnd must be overridden');
    }

    UpdatePivot (worldPosition)
    {
        this.rootGroup.position.copy (worldPosition);
    }

    Show ()
    {
        if (!this.inScene) {
            this.viewer.AddExtraObject (this.rootGroup);
            this.inScene = true;
        }
        this.rootGroup.visible = true;
        this.viewer.Render ();
    }

    Hide ()
    {
        this.rootGroup.visible = false;
        if (this.hoveredAxis !== null) {
            this.OnHoverLeave (this.hoveredAxis);
            this.hoveredAxis = null;
        }
        this.viewer.Render ();
    }

    IsVisible ()
    {
        return this.rootGroup.visible;
    }

    SetScale (cameraDistance)
    {
        let scale = cameraDistance * 0.15;
        this.rootGroup.scale.setScalar (scale);
    }

    GetHandleAtRay (raycaster)
    {
        let meshes = [];
        this.rootGroup.traverse ((child) => {
            if (child.isMesh && child.userData.axisName) {
                meshes.push (child);
            }
        });

        let intersects = raycaster.intersectObjects (meshes, false);
        if (intersects.length === 0) {
            return { hit : false, axisName : null, point : null };
        }

        let first = intersects[0];
        return {
            hit : true,
            axisName : first.object.userData.axisName,
            point : first.point.clone ()
        };
    }

    UpdateHover (axisName)
    {
        if (axisName === this.hoveredAxis) {
            return;
        }
        if (this.hoveredAxis !== null) {
            this.OnHoverLeave (this.hoveredAxis);
        }
        this.hoveredAxis = axisName;
        if (this.hoveredAxis !== null) {
            this.OnHoverEnter (this.hoveredAxis);
        }
    }

    GetMeshForAxis (axisName)
    {
        let found = null;
        this.rootGroup.traverse ((child) => {
            if (child.isMesh && child.userData.axisName === axisName) {
                found = child;
            }
        });
        return found;
    }
}
