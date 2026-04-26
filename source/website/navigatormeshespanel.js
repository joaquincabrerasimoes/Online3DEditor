import { MeshInstanceId } from '../engine/model/meshinstance.js';
import { AddDiv, CreateDiv, ShowDomElement, ClearDomElement, InsertDomElementBefore, SetDomElementHeight, GetDomElementOuterHeight, IsDomElementVisible } from '../engine/viewer/domutils.js';
import { CalculatePopupPositionToElementBottomRight, ShowListPopup } from './dialogs.js';
import { MeshItem, NavigatorItemRecurse, NodeItem } from './navigatoritems.js';
import { NavigatorPanel, NavigatorPopupButton } from './navigatorpanel.js';
import { AddSvgIconElement, GetMaterialName, GetMeshName, GetNodeName, SetSvgIconImageElement } from './utils.js';
import { Loc, FLoc } from '../engine/core/localization.js';

const MeshesPanelMode =
{
    Simple : 0,
    FlatList : 1,
    TreeView : 2
};

class NavigatorMaterialsPopupButton extends NavigatorPopupButton
{
    constructor (parentDiv)
    {
        super (parentDiv);
        this.materialInfoArray = null;
    }

    Update (materialInfoArray)
    {
        this.materialInfoArray = materialInfoArray;
        if (this.materialInfoArray === null) {
            return;
        }

        let materialsText = FLoc ('Materials ({0})', this.materialInfoArray.length);
        this.buttonText.innerHTML = materialsText;
    }

    OnButtonClick ()
    {
        if (this.materialInfoArray === null) {
            return;
        }

        let materialItems = [];
        for (let i = 0; i < this.materialInfoArray.length; i++) {
            let usedMaterial = this.materialInfoArray[i];
            materialItems.push ({
                name : GetMaterialName (usedMaterial.name),
                color : usedMaterial.color
            });
        }

        if (materialItems.length === 0) {
            return;
        }

        this.popup = ShowListPopup (materialItems, {
            calculatePosition : (contentDiv) => {
                return CalculatePopupPositionToElementBottomRight (this.button, contentDiv);
            },
            onClick : (index) => {
                let usedMaterial = this.materialInfoArray[index];
                this.callbacks.onMaterialSelected (usedMaterial.index);
            }
        });
    }
}

export class NavigatorMeshesPanel extends NavigatorPanel
{
    constructor (parentDiv)
    {
        super (parentDiv);

        this.callbacks = null;
        this.nodeIdToItem = new Map ();
        this.meshInstanceIdToItem = new Map ();
        this.rootItem = null;
        this.mode = MeshesPanelMode.Simple;
        this.buttons = null;
        this.contextMenu = null;
        this.selectionManager = null;
        this.groupDialogCallback = null;
        this.groupManager = null;
        this.modelRef = null;

        this.treeView.AddClass ('tight');
        this.titleButtonsDiv = AddDiv (this.titleDiv, 'ov_navigator_tree_title_buttons');
        this.buttonsDiv = CreateDiv ('ov_navigator_buttons');
        InsertDomElementBefore (this.buttonsDiv, this.treeDiv);

        this.popupDiv = AddDiv (this.panelDiv, 'ov_navigator_info_panel');
        this.materialsButton = new NavigatorMaterialsPopupButton (this.popupDiv);
    }

    GetName ()
    {
        return Loc ('Meshes');
    }

    GetIcon ()
    {
        return 'meshes';
    }

    Resize ()
    {
        let titleHeight = GetDomElementOuterHeight (this.titleDiv);
        let buttonsHeight = 0;
        if (IsDomElementVisible (this.buttonsDiv)) {
            buttonsHeight = GetDomElementOuterHeight (this.buttonsDiv);
        }
        let popupHeight = GetDomElementOuterHeight (this.popupDiv);
        let height = this.parentDiv.offsetHeight;
        SetDomElementHeight (this.treeDiv, height - titleHeight - buttonsHeight - popupHeight);
    }

    Clear ()
    {
        this.ClearMeshTree ();
        ClearDomElement (this.titleButtonsDiv);
        ClearDomElement (this.buttonsDiv);
        this.buttons = null;
    }

    ClearMeshTree ()
    {
        super.Clear ();
        this.materialsButton.Clear ();
        this.nodeIdToItem = new Map ();
        this.meshInstanceIdToItem = new Map ();
        this.rootItem = null;
    }

    SetContextMenu (contextMenu)
    {
        this.contextMenu = contextMenu;
    }

    SetSelectionManager (selectionManager)
    {
        this.selectionManager = selectionManager;
    }

    SetGroupDialogCallback (callback)
    {
        this.groupDialogCallback = callback;
    }

    SetGroupManager (groupManager)
    {
        this.groupManager = groupManager;
    }

    Init (callbacks)
    {
        super.Init (callbacks);
        this.materialsButton.Init ({
            onMeshHover : (meshInstanceId) => {
                this.callbacks.onMeshTemporarySelected (meshInstanceId);
            },
            onMeshSelected : (meshInstanceId) => {
                this.callbacks.onMeshSelected (meshInstanceId);
            },
            onMaterialSelected : (materialIndex) => {
                this.callbacks.onMaterialSelected (materialIndex);
            }
        });
    }

    Fill (importResult)
    {
        super.Fill (importResult);
        // Stash model so drag-drop handlers can resolve nodes
        this.modelRef = importResult.model;

        const rootNode = importResult.model.GetRootNode ();
        let isHierarchical = false;
        for (let childNode of rootNode.GetChildNodes ()) {
            if (childNode.ChildNodeCount () > 0 || childNode.MeshIndexCount () > 1) {
                isHierarchical = true;
                break;
            }
        }

        if (this.mode === MeshesPanelMode.Simple && isHierarchical) {
            this.mode = MeshesPanelMode.TreeView;
        } else if (this.mode !== MeshesPanelMode.Simple && !isHierarchical) {
            this.mode = MeshesPanelMode.Simple;
        }

        this.FillButtons (importResult);
        if (this.mode === MeshesPanelMode.Simple) {
            ShowDomElement (this.buttonsDiv, false);
            this.titleDiv.classList.add ('withbuttons');
            this.titleDiv.classList.remove ('nomargin');
        } else {
            ShowDomElement (this.buttonsDiv, true);
            this.titleDiv.classList.remove ('withbuttons');
            this.titleDiv.classList.add ('nomargin');
        }

        this.FillMeshTree (importResult.model);
        this.InstallContainerDropTarget ();
        this.Resize ();
    }

    FillButtons (importResult)
    {
        function CreateButton (parentDiv, button, className, onClick)
        {
            button.div = AddDiv (parentDiv, 'ov_navigator_button');
            button.div.setAttribute ('alt', button.name);
            button.div.setAttribute ('title', button.name);
            if (className) {
                button.div.classList.add (className);
            }
            button.iconDiv = AddSvgIconElement (button.div, button.icon);
            button.div.addEventListener ('click', () => {
                onClick ();
            });
        }

        function UpdateButtonsStatus (buttons, mode)
        {
            let showTree = (mode === MeshesPanelMode.TreeView);
            if (showTree) {
                buttons.flatList.iconDiv.classList.remove ('selected');
                buttons.treeView.iconDiv.classList.add ('selected');
            } else {
                buttons.flatList.iconDiv.classList.add ('selected');
                buttons.treeView.iconDiv.classList.remove ('selected');
            }
            ShowDomElement (buttons.separator, showTree);
            ShowDomElement (buttons.expandAll.div, showTree);
            ShowDomElement (buttons.collapseAll.div, showTree);
        }

        function UpdateView (panel, importResult)
        {
            let hiddenMeshInstanceIds = [];
            panel.EnumerateMeshItems ((meshItem) => {
                if (!meshItem.IsVisible ()) {
                    hiddenMeshInstanceIds.push (meshItem.GetMeshInstanceId ());
                }
                return true;
            });

            panel.ClearMeshTree ();
            panel.FillMeshTree (importResult.model);

            for (let meshInstanceId of hiddenMeshInstanceIds) {
                let meshItem = panel.GetMeshItem (meshInstanceId);
                meshItem.SetVisible (false, NavigatorItemRecurse.Parents);
            }

            UpdateButtonsStatus (panel.buttons, panel.mode);
            panel.callbacks.onViewTypeChanged ();
        }

        this.buttons = {
            flatList : {
                name : Loc ('Flat list'),
                icon : 'flat_list',
                div : null,
                iconDiv : null
            },
            treeView : {
                name : Loc ('Tree view'),
                icon : 'tree_view',
                div : null,
                iconDiv : null
            },
            separator : null,
            expandAll : {
                name : Loc ('Expand all'),
                icon : 'expand',
                div : null,
                iconDiv : null
            },
            collapseAll : {
                name : Loc ('Collapse all'),
                icon : 'collapse',
                div : null,
                iconDiv : null
            },
            showHideMeshes : {
                name : Loc ('Show/hide meshes'),
                icon : 'visible',
                div : null,
                iconDiv : null
            },
            fitToWindow : {
                name : Loc ('Fit meshes to window'),
                icon : 'fit',
                div : null,
                iconDiv : null
            }
        };

        if (this.mode === MeshesPanelMode.Simple) {
            CreateButton (this.titleButtonsDiv, this.buttons.showHideMeshes, 'right', () => {
                let nodeId = this.rootItem.GetNodeId ();
                this.callbacks.onNodeShowHide (nodeId);
            });

            CreateButton (this.titleButtonsDiv, this.buttons.fitToWindow, 'right', () => {
                let nodeId = this.rootItem.GetNodeId ();
                this.callbacks.onNodeFitToWindow (nodeId);
            });
        } else {
            CreateButton (this.buttonsDiv, this.buttons.flatList, null, () => {
                if (this.mode === MeshesPanelMode.FlatList) {
                    return;
                }
                this.mode = MeshesPanelMode.FlatList;
                UpdateView (this, importResult);
            });

            CreateButton (this.buttonsDiv, this.buttons.treeView, null, () => {
                if (this.mode === MeshesPanelMode.TreeView) {
                    return;
                }
                this.mode = MeshesPanelMode.TreeView;
                UpdateView (this, importResult);
            });

            this.buttons.separator = AddDiv (this.buttonsDiv, 'ov_navigator_buttons_separator');

            CreateButton (this.buttonsDiv, this.buttons.expandAll, null, () => {
                this.rootItem.ExpandAll (true);
            });

            CreateButton (this.buttonsDiv, this.buttons.collapseAll, null, () => {
                this.rootItem.ExpandAll (false);
            });

            CreateButton (this.buttonsDiv, this.buttons.showHideMeshes, 'right', () => {
                let nodeId = this.rootItem.GetNodeId ();
                this.callbacks.onNodeShowHide (nodeId);
            });

            CreateButton (this.buttonsDiv, this.buttons.fitToWindow, 'right', () => {
                let nodeId = this.rootItem.GetNodeId ();
                this.callbacks.onNodeFitToWindow (nodeId);
            });

            UpdateButtonsStatus (this.buttons, this.mode);
        }
    }

    FillMeshTree (model)
    {
        function AddMeshToNodeTree (panel, node, mesh, meshIndex, parentItem, mode)
        {
            let meshName = GetMeshName (node.GetName (), mesh.GetName ());
            let meshInstanceId = new MeshInstanceId (node.GetId (), meshIndex);
            let meshItemIcon = (mode === MeshesPanelMode.TreeView ? 'tree_mesh' : null);
            let meshItem = new MeshItem (meshName, meshItemIcon, meshInstanceId, {
                onShowHide : (selectedMeshId) => {
                    panel.callbacks.onMeshShowHide (selectedMeshId);
                },
                onFitToWindow : (selectedMeshId) => {
                    panel.callbacks.onMeshFitToWindow (selectedMeshId);
                },
                onSelected : (selectedMeshId) => {
                    panel.callbacks.onMeshSelected (selectedMeshId);
                },
                onContextMenu : (ev, itemMeshInstanceId) => {
                    panel.ShowItemContextMenu (ev, itemMeshInstanceId.nodeId, itemMeshInstanceId.meshIndex, 'mesh');
                },
                onDragStart : (ev, id, itemType) => {
                    panel.HandleDragStart (ev, id, itemType);
                },
                onDrop : (ev, id, itemType) => {
                    panel.HandleDrop (ev, id, itemType);
                }
            });
            panel.meshInstanceIdToItem.set (meshInstanceId.GetKey (), meshItem);
            parentItem.AddChild (meshItem);
        }

        function CreateNodeItem (panel, node)
        {
            const nodeName = GetNodeName (node.GetName ());
            const nodeId = node.GetId ();
            let nodeItem = new NodeItem (nodeName, nodeId, {
                onShowHide : (selectedNodeId) => {
                    panel.callbacks.onNodeShowHide (selectedNodeId);
                },
                onFitToWindow : (selectedNodeId) => {
                    panel.callbacks.onNodeFitToWindow (selectedNodeId);
                },
                onContextMenu : (ev, itemNodeId) => {
                    panel.ShowItemContextMenu (ev, itemNodeId, null, 'node');
                },
                onDragStart : (ev, id, itemType) => {
                    panel.HandleDragStart (ev, id, itemType);
                },
                onDrop : (ev, id, itemType) => {
                    panel.HandleDrop (ev, id, itemType);
                }
            });
            panel.nodeIdToItem.set (nodeId, nodeItem);
            return nodeItem;
        }

        function CreateDummyRootItem (panel, node)
        {
            const nodeId = node.GetId ();
            let rootItem = new NodeItem (null, nodeId, {
                onVisibilityChanged : (isVisible) => {
                    if (isVisible) {
                        SetSvgIconImageElement (panel.buttons.showHideMeshes.iconDiv, 'visible');
                    } else {
                        SetSvgIconImageElement (panel.buttons.showHideMeshes.iconDiv, 'hidden');
                    }
                }
            });
            rootItem.Show (false);
            rootItem.ShowChildren (true);
            panel.treeView.AddChild (rootItem);
            panel.nodeIdToItem.set (nodeId, rootItem);
            return rootItem;
        }

        function AddModelNodeToTree (panel, model, node, parentItem, mode)
        {
            let meshNodes = [];
            for (let childNode of node.GetChildNodes ()) {
                if (mode === MeshesPanelMode.TreeView) {
                    if (childNode.IsMeshNode ()) {
                        meshNodes.push (childNode);
                    } else {
                        let nodeItem = CreateNodeItem (panel, childNode);
                        parentItem.AddChild (nodeItem);
                        AddModelNodeToTree (panel, model, childNode, nodeItem, mode);
                    }
                } else {
                    AddModelNodeToTree (panel, model, childNode, parentItem, mode);
                }
            }
            for (let meshNode of meshNodes) {
                AddModelNodeToTree (panel, model, meshNode, parentItem, mode);
            }
            for (let meshIndex of node.GetMeshIndices ()) {
                let mesh = model.GetMesh (meshIndex);
                AddMeshToNodeTree (panel, node, mesh, meshIndex, parentItem, mode);
            }
        }

        let rootNode = model.GetRootNode ();
        this.rootItem = CreateDummyRootItem (this, rootNode);
        AddModelNodeToTree (this, model, rootNode, this.rootItem, this.mode);
    }

    UpdateMaterialList (materialInfoArray)
    {
        this.materialsButton.Update (materialInfoArray);
    }

    GetNodeItem (nodeId)
    {
        return this.nodeIdToItem.get (nodeId);
    }

    MeshItemCount ()
    {
        return this.meshInstanceIdToItem.size;
    }

    GetMeshItem (meshInstanceId)
    {
        return this.meshInstanceIdToItem.get (meshInstanceId.GetKey ());
    }

    EnumerateNodeItems (processor)
    {
        for (const nodeItem of this.nodeIdToItem.values ()) {
            if (!processor (nodeItem)) {
                break;
            }
        }
    }

    EnumerateMeshItems (processor)
    {
        for (const meshItem of this.meshInstanceIdToItem.values ()) {
            if (!processor (meshItem)) {
                break;
            }
        }
    }

    IsMeshVisible (meshInstanceId)
    {
        let meshItem = this.GetMeshItem (meshInstanceId);
        return meshItem.IsVisible ();
    }

    HasHiddenMesh ()
    {
        let hasHiddenMesh = false;
        this.EnumerateMeshItems ((meshItem) => {
            if (!meshItem.IsVisible ()) {
                hasHiddenMesh = true;
                return false;
            }
            return true;
        });
        return hasHiddenMesh;
    }

    ShowAllMeshes (show)
    {
        this.EnumerateNodeItems ((nodeItem) => {
            nodeItem.SetVisible (show, NavigatorItemRecurse.No);
            return true;
        });
        this.EnumerateMeshItems ((meshItem) => {
            meshItem.SetVisible (show, NavigatorItemRecurse.No);
            return true;
        });
    }

    ToggleNodeVisibility (nodeId)
    {
        let nodeItem = this.GetNodeItem (nodeId);
        nodeItem.SetVisible (!nodeItem.IsVisible (), NavigatorItemRecurse.All);
    }

    ToggleMeshVisibility (meshInstanceId)
    {
        let meshItem = this.GetMeshItem (meshInstanceId);
        meshItem.SetVisible (!meshItem.IsVisible (), NavigatorItemRecurse.Parents);
    }

    IsMeshIsolated (meshInstanceId)
    {
        let isIsolated = true;
        this.EnumerateMeshItems ((meshItem) => {
            if (!meshItem.GetMeshInstanceId ().IsEqual (meshInstanceId) && meshItem.IsVisible ()) {
                isIsolated = false;
                return false;
            }
            return true;
        });
        return isIsolated;
    }

    IsolateMesh (meshInstanceId)
    {
        this.ShowAllMeshes (false);
        this.ToggleMeshVisibility (meshInstanceId);
    }

    // Drag/drop: begin dragging an item. If item is in current selection,
    // the whole selection is dragged; otherwise just this single item.
    HandleDragStart (ev, id, itemType)
    {
        let entries;
        if (itemType === 'mesh') {
            let key = 'mesh:' + id.nodeId + ':' + id.meshIndex;
            if (this.selectionManager && this.selectionManager.isSelected ({ key : key })) {
                entries = this.selectionManager.getSelection ();
            } else {
                entries = [{
                    type : 'mesh',
                    nodeId : id.nodeId,
                    meshIndex : id.meshIndex,
                    key : key
                }];
            }
        } else if (itemType === 'node') {
            let key = 'node:' + id;
            entries = [{ type : 'node', nodeId : id, key : key }];
        } else {
            return;
        }
        ev.dataTransfer.setData ('application/x-o3d-items', JSON.stringify (entries));
        ev.dataTransfer.effectAllowed = 'move';
    }

    // Drop on a tree item or root. Resolves target group and reparents via
    // GroupManager. Cycle-safe (prevents dropping a node into its descendants).
    HandleDrop (ev, targetId, targetType)
    {
        if (!this.groupManager || !this.modelRef) {
            return;
        }
        let raw = ev.dataTransfer.getData ('application/x-o3d-items');
        if (!raw) {
            return;
        }
        let entries;
        try {
            entries = JSON.parse (raw);
        } catch (e) {
            return;
        }
        if (!entries || entries.length === 0) {
            return;
        }

        let targetNodeId;
        if (targetType === 'node') {
            targetNodeId = targetId;
        } else if (targetType === 'mesh') {
            // Drop onto a mesh = drop into the mesh's parent group
            let node = this.modelRef.FindNodeById (targetId.nodeId);
            if (!node) {
                return;
            }
            let parent = node.GetParent ();
            targetNodeId = parent
                ? parent.GetId ()
                : this.modelRef.GetRootNode ().GetId ();
        } else if (targetType === 'root') {
            targetNodeId = this.modelRef.GetRootNode ().GetId ();
        } else {
            return;
        }

        if (this.WouldCreateCycle (entries, targetNodeId)) {
            return;
        }

        this.groupManager.moveToGroup (entries, targetNodeId);
        // Tree refresh fires via Events.GroupChanged subscription
    }

    // Reject drops where the target node is the dragged node itself or one of
    // its descendants (would orphan the subtree).
    WouldCreateCycle (entries, targetNodeId)
    {
        for (let entry of entries) {
            if (entry.type !== 'node') {
                continue;
            }
            if (entry.nodeId === targetNodeId) {
                return true;
            }
            let node = this.modelRef.FindNodeById (entry.nodeId);
            if (!node) {
                continue;
            }
            let inSubtree = false;
            node.Enumerate ((n) => {
                if (n.GetId () === targetNodeId) {
                    inSubtree = true;
                }
            });
            if (inSubtree) {
                return true;
            }
        }
        return false;
    }

    // Make the tree container itself a drop target → root
    InstallContainerDropTarget ()
    {
        let container = this.treeView.GetDomElement ();
        // Avoid double-installing on Fill rebuilds
        if (container.dataset.dropInstalled === '1') {
            return;
        }
        container.dataset.dropInstalled = '1';

        container.addEventListener ('dragenter', (ev) => {
            // Only mark container when not over a child item
            if (ev.target === container) {
                ev.preventDefault ();
                container.classList.add ('drop_target_root');
            }
        });
        container.addEventListener ('dragover', (ev) => {
            // preventDefault required to allow drop
            ev.preventDefault ();
            ev.dataTransfer.dropEffect = 'move';
        });
        container.addEventListener ('dragleave', (ev) => {
            if (ev.target === container && !container.contains (ev.relatedTarget)) {
                container.classList.remove ('drop_target_root');
            }
        });
        container.addEventListener ('drop', (ev) => {
            // If a child item handled the drop, it called stopPropagation;
            // we only get here for drops on the empty tree area → root
            ev.preventDefault ();
            container.classList.remove ('drop_target_root');
            this.HandleDrop (ev, null, 'root');
        });
    }

    // Rebuild only the mesh tree without touching files/materials panels.
    // Preserves visibility state. If the model became hierarchical (e.g. after
    // a "Move to Group..." operation) the panel is auto-switched to TreeView
    // so the new groups are actually visible to the user.
    RefreshMeshTree (model)
    {
        let savedHidden = [];
        this.EnumerateMeshItems ((meshItem) => {
            if (!meshItem.IsVisible ()) {
                savedHidden.push (meshItem.GetMeshInstanceId ());
            }
            return true;
        });

        // Re-detect hierarchy. A model is "hierarchical" if any direct child of
        // the root has its own children OR holds more than one mesh.
        let rootNode = model.GetRootNode ();
        let isHierarchical = false;
        for (let childNode of rootNode.GetChildNodes ()) {
            if (childNode.ChildNodeCount () > 0 || childNode.MeshIndexCount () > 1) {
                isHierarchical = true;
                break;
            }
        }
        if (this.mode === MeshesPanelMode.Simple && isHierarchical) {
            // Promoted to a hierarchical layout — clear stale items then go
            // through Fill() so mode/title/buttons all rebuild consistently.
            this.ClearMeshTree ();
            this.Fill ({ model : model, missingFiles : [] });
        } else {
            this.ClearMeshTree ();
            this.FillMeshTree (model);
        }

        for (let meshInstanceId of savedHidden) {
            let item = this.GetMeshItem (meshInstanceId);
            if (item) {
                item.SetVisible (false, NavigatorItemRecurse.Parents);
            }
        }
    }

    ShowItemContextMenu (ev, nodeId, meshIndex, itemType)
    {
        if (!this.contextMenu) {
            return;
        }

        // If clicked item is not in selection, select it first
        if (this.selectionManager) {
            let key = itemType === 'mesh'
                ? 'mesh:' + nodeId + ':' + meshIndex
                : 'node:' + nodeId;
            if (!this.selectionManager.isSelected ({ key : key })) {
                if (itemType === 'mesh') {
                    let id = new MeshInstanceId (nodeId, meshIndex);
                    this.callbacks.onMeshSelected (id);
                }
            }
        }

        let items = [
            {
                label : 'Move To Group...',
                onClick : () => {
                    if (this.groupDialogCallback) {
                        this.groupDialogCallback ();
                    }
                }
            }
        ];

        // "Rename..." is only meaningful for nodes (groups). Meshes get their
        // names from the imported model; we don't expose name editing for them.
        if (itemType === 'node' && this.groupManager) {
            items.push ({
                label : 'Rename...',
                onClick : () => {
                    let nodeItem = this.GetNodeItem (nodeId);
                    if (!nodeItem) {
                        return;
                    }
                    let currentName = (nodeItem.name && nodeItem.name.length > 0)
                        ? nodeItem.name
                        : '';
                    nodeItem.BeginRename (currentName, (newName) => {
                        this.groupManager.renameGroup (nodeId, newName);
                    });
                }
            });
        }

        items.push ({ separator : true });
        items.push ({
            label : 'Focus',
            onClick : () => {
                if (itemType === 'mesh') {
                    let id = new MeshInstanceId (nodeId, meshIndex);
                    this.callbacks.onMeshFitToWindow (id);
                } else {
                    this.callbacks.onNodeFitToWindow (nodeId);
                }
            }
        });
        items.push ({
            label : 'Remove from Scene',
            onClick : () => {
                if (itemType === 'mesh') {
                    let id = new MeshInstanceId (nodeId, meshIndex);
                    this.callbacks.onMeshShowHide (id);
                } else {
                    this.callbacks.onNodeShowHide (nodeId);
                }
            }
        });

        this.contextMenu.show (ev.clientX, ev.clientY, items);
    }
}
