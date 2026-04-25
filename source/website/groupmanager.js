import { Node } from '../engine/model/node.js';
import { Events } from './eventbus.js';

export class GroupManager
{
    constructor (eventBus)
    {
        this.eventBus = eventBus;
        this.model = null;
    }

    SetModel (model)
    {
        this.model = model;
    }

    createGroup (name, parentNodeId)
    {
        if (this.model === null) {
            return null;
        }

        let parentNode;
        if (parentNodeId !== null && parentNodeId !== undefined) {
            parentNode = this.model.FindNodeById (parentNodeId);
        }
        if (!parentNode) {
            parentNode = this.model.GetRootNode ();
        }

        let groupNode = new Node ();
        parentNode.AddChildNode (groupNode);
        groupNode.SetName (name);

        this.eventBus.emit (Events.GroupChanged, {
            groupId : groupNode.GetId (),
            action : 'create'
        });

        return groupNode.GetId ();
    }

    moveToGroup (entries, groupNodeId)
    {
        if (this.model === null) {
            return;
        }

        let groupNode = this.model.FindNodeById (groupNodeId);
        if (!groupNode) {
            return;
        }

        let movedIds = [];

        for (let entry of entries) {
            if (entry.type !== 'mesh' && entry.type !== 'node') {
                continue;
            }

            let node = this.model.FindNodeById (entry.nodeId);
            if (!node) {
                continue;
            }

            if (node === groupNode || node === this.model.GetRootNode ()) {
                continue;
            }

            // For mesh entries where the node has multiple meshes,
            // split the mesh into its own node first
            if (entry.type === 'mesh' && node.MeshIndexCount () > 1) {
                let newNode = new Node ();
                node.GetParent () !== null
                    ? node.GetParent ().AddChildNode (newNode)
                    : this.model.GetRootNode ().AddChildNode (newNode);
                newNode.SetName (node.GetName ());
                newNode.AddMeshIndex (entry.meshIndex);

                // Remove meshIndex from original node
                let idx = node.GetMeshIndices ().indexOf (entry.meshIndex);
                if (idx !== -1) {
                    node.GetMeshIndices ().splice (idx, 1);
                }
                node = newNode;
            }

            groupNode.ReparentChildNode (node);
            movedIds.push (node.GetId ());
        }

        this.eventBus.emit (Events.GroupChanged, {
            groupId : groupNodeId,
            action : 'reparent',
            movedIds : movedIds
        });
    }

    renameGroup (groupNodeId, newName)
    {
        if (this.model === null) {
            return;
        }
        let node = this.model.FindNodeById (groupNodeId);
        if (!node) {
            return;
        }
        node.SetName (newName);
        this.eventBus.emit (Events.GroupChanged, {
            groupId : groupNodeId,
            action : 'rename'
        });
    }

    deleteGroup (groupNodeId)
    {
        if (this.model === null) {
            return;
        }
        let node = this.model.FindNodeById (groupNodeId);
        if (!node) {
            return;
        }
        let parent = node.GetParent ();
        if (!parent) {
            return; // cannot delete root
        }

        // Reparent all children to grandparent
        let children = [...node.GetChildNodes ()];
        for (let child of children) {
            parent.ReparentChildNode (child);
        }

        // Move mesh indices to parent
        for (let i = 0; i < node.MeshIndexCount (); i++) {
            parent.AddMeshIndex (node.GetMeshIndex (i));
        }

        parent.RemoveChildNode (node);

        this.eventBus.emit (Events.GroupChanged, {
            groupId : groupNodeId,
            action : 'delete'
        });
    }

    getGroupNodes ()
    {
        if (this.model === null) {
            return [];
        }
        let groups = [];
        this.model.GetRootNode ().Enumerate ((node) => {
            // A group node: has children (non-leaf), OR is explicitly named
            if (node !== this.model.GetRootNode ()) {
                groups.push (node);
            }
        });
        return groups;
    }
}
