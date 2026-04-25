import * as THREE from 'three';
import { Events } from './eventbus.js';

const TRANSLATE_SNAP = 0.5;
const ROTATE_SNAP = Math.PI / 12;  // 15 degrees
const SCALE_SNAP = 0.1;

export class SnapSystem
{
    constructor (eventBus)
    {
        this.eventBus = eventBus;
        this.enabled = true;
    }

    isEnabled ()
    {
        return this.enabled;
    }

    setEnabled (bool)
    {
        this.enabled = bool;
        this.eventBus.emit (Events.SnapToggled, { enabled : this.enabled });
    }

    toggle ()
    {
        this.setEnabled (!this.enabled);
    }

    snapTranslation (vec3)
    {
        if (!this.enabled) {
            return vec3.clone ();
        }
        return new THREE.Vector3 (
            Math.round (vec3.x / TRANSLATE_SNAP) * TRANSLATE_SNAP,
            Math.round (vec3.y / TRANSLATE_SNAP) * TRANSLATE_SNAP,
            Math.round (vec3.z / TRANSLATE_SNAP) * TRANSLATE_SNAP
        );
    }

    snapRotation (radians)
    {
        if (!this.enabled) {
            return radians;
        }
        return Math.round (radians / ROTATE_SNAP) * ROTATE_SNAP;
    }

    snapScale (factor)
    {
        if (!this.enabled) {
            return factor;
        }
        return Math.round (factor / SCALE_SNAP) * SCALE_SNAP;
    }
}
