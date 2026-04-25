import { Events } from './eventbus.js';

export function MakeSelectionEntryKey (type, nodeId, meshIndex, materialIndex)
{
    if (type === 'mesh') {
        return 'mesh:' + nodeId + ':' + meshIndex;
    } else if (type === 'node') {
        return 'node:' + nodeId;
    } else if (type === 'material') {
        return 'material:' + materialIndex;
    }
    return null;
}

export function CreateMeshEntry (nodeId, meshIndex)
{
    let key = MakeSelectionEntryKey ('mesh', nodeId, meshIndex, null);
    return { type : 'mesh', nodeId : nodeId, meshIndex : meshIndex, key : key };
}

export function CreateNodeEntry (nodeId)
{
    let key = MakeSelectionEntryKey ('node', nodeId, null, null);
    return { type : 'node', nodeId : nodeId, key : key };
}

export function CreateMaterialEntry (materialIndex)
{
    let key = MakeSelectionEntryKey ('material', null, null, materialIndex);
    return { type : 'material', materialIndex : materialIndex, key : key };
}

export class SelectionManager
{
    constructor (eventBus)
    {
        this.eventBus = eventBus;
        this.entries = new Map ();
    }

    select (entry)
    {
        let previous = this.getSelection ();
        this.entries.clear ();
        this.entries.set (entry.key, entry);
        this.Emit (previous);
    }

    toggleSelect (entry)
    {
        let previous = this.getSelection ();
        if (this.entries.has (entry.key)) {
            this.entries.delete (entry.key);
        } else {
            this.entries.set (entry.key, entry);
        }
        this.Emit (previous);
    }

    addToSelection (entry)
    {
        let previous = this.getSelection ();
        this.entries.set (entry.key, entry);
        this.Emit (previous);
    }

    deselectAll ()
    {
        if (this.entries.size === 0) {
            return;
        }
        let previous = this.getSelection ();
        this.entries.clear ();
        this.Emit (previous);
    }

    selectAll (entriesArray)
    {
        let previous = this.getSelection ();
        this.entries.clear ();
        for (let entry of entriesArray) {
            this.entries.set (entry.key, entry);
        }
        this.Emit (previous);
    }

    getSelection ()
    {
        return Array.from (this.entries.values ());
    }

    isSelected (entry)
    {
        return this.entries.has (entry.key);
    }

    getCount ()
    {
        return this.entries.size;
    }

    getCommonType ()
    {
        if (this.entries.size === 0) {
            return 'none';
        }
        let types = new Set ();
        for (let entry of this.entries.values ()) {
            types.add (entry.type);
        }
        if (types.size === 1) {
            return types.values ().next ().value;
        }
        return 'mixed';
    }

    Emit (previous)
    {
        this.eventBus.emit (Events.SelectionChanged, {
            entries : this.getSelection (),
            previous : previous
        });
    }
}
