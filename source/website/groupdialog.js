// Move-to-Group dialog.
// Behaviour:
//  - Tree picker shows existing groups (root first, then nested groups)
//  - Click an item → it becomes the move target AND the parent for new groups
//  - "+ Create New Group" creates a child of the currently-selected target,
//    so you can build deeper indentation right inside the dialog
//  - "Move" reparents the original SelectionManager selection under the
//    chosen target

export class GroupDialog
{
    constructor ()
    {
        this.overlayDiv = null;
        this.dialogDiv = null;
        this.selectedGroupId = null;
        this.onEscKey = this.OnEscKey.bind (this);

        // Bound at Show() time so re-rendering can use them
        this.model = null;
        this.groupManager = null;
        this.selectionManager = null;
        this.treeDiv = null;
        this.hintDiv = null;
        this.moveButton = null;
    }

    Show (model, groupManager, selectionManager, onComplete)
    {
        this.Close ();
        this.model = model;
        this.groupManager = groupManager;
        this.selectionManager = selectionManager;
        // Default target = root, so "Create New Group" without prior click
        // creates a top-level group (sane default)
        this.selectedGroupId = model.GetRootNode ().GetId ();

        // Modal overlay
        this.overlayDiv = document.createElement ('div');
        this.overlayDiv.className = 'ov_modal_overlay';
        this.overlayDiv.addEventListener ('click', () => { this.Close (); });
        document.body.appendChild (this.overlayDiv);

        // Dialog card
        let dialogDiv = document.createElement ('div');
        dialogDiv.className = 'ov_dialog ov_group_dialog';
        document.body.appendChild (dialogDiv);
        this.dialogDiv = dialogDiv;

        // Title
        let titleDiv = document.createElement ('div');
        titleDiv.className = 'ov_dialog_title';
        titleDiv.textContent = 'Move to Group';
        dialogDiv.appendChild (titleDiv);

        // Content area
        let contentDiv = document.createElement ('div');
        contentDiv.className = 'ov_dialog_content ov_group_dialog_content';
        dialogDiv.appendChild (contentDiv);

        // Tree
        let treeDiv = document.createElement ('div');
        treeDiv.className = 'ov_group_dialog_tree';
        contentDiv.appendChild (treeDiv);
        this.treeDiv = treeDiv;
        this.RebuildTree ();

        // Hint about where new groups will be created
        let hintDiv = document.createElement ('div');
        hintDiv.className = 'ov_group_dialog_hint';
        contentDiv.appendChild (hintDiv);
        this.hintDiv = hintDiv;
        this.UpdateHint ();

        // Create-new-group inline section
        let createSection = document.createElement ('div');
        createSection.className = 'ov_group_dialog_create';
        contentDiv.appendChild (createSection);

        let createBtn = document.createElement ('button');
        createBtn.className = 'ov_dialog_button';
        createBtn.textContent = '+ Create New Group';
        createSection.appendChild (createBtn);

        let createInput = document.createElement ('input');
        createInput.type = 'text';
        createInput.placeholder = 'Group name...';
        createInput.className = 'ov_group_dialog_input';
        createInput.style.display = 'none';
        createSection.appendChild (createInput);

        let confirmCreateBtn = document.createElement ('button');
        confirmCreateBtn.className = 'ov_dialog_button';
        confirmCreateBtn.textContent = '\u2713';
        confirmCreateBtn.style.display = 'none';
        createSection.appendChild (confirmCreateBtn);

        createBtn.addEventListener ('click', () => {
            createBtn.style.display = 'none';
            createInput.style.display = '';
            confirmCreateBtn.style.display = '';
            createInput.focus ();
        });

        let resetCreateUI = () => {
            createBtn.style.display = '';
            createInput.style.display = 'none';
            confirmCreateBtn.style.display = 'none';
            createInput.value = '';
        };

        let doCreate = () => {
            let name = createInput.value.trim ();
            if (!name) {
                return;
            }
            // Create as child of the currently-selected group (root if none).
            let parentId = this.selectedGroupId !== null
                ? this.selectedGroupId
                : this.model.GetRootNode ().GetId ();
            let newId = this.groupManager.createGroup (name, parentId);
            if (newId === null) {
                return;
            }
            // New group becomes the move target (and the parent for any
            // subsequent "Create New Group" → enables deep nesting)
            this.selectedGroupId = newId;
            this.RebuildTree ();
            this.UpdateHint ();
            resetCreateUI ();
        };

        confirmCreateBtn.addEventListener ('click', doCreate);
        createInput.addEventListener ('keydown', (ev) => {
            if (ev.key === 'Enter') {
                doCreate ();
            } else if (ev.key === 'Escape') {
                ev.stopPropagation ();
                resetCreateUI ();
            }
        });

        // Footer
        let footerDiv = document.createElement ('div');
        footerDiv.className = 'ov_dialog_buttons';
        dialogDiv.appendChild (footerDiv);

        let cancelButton = document.createElement ('button');
        cancelButton.className = 'ov_dialog_button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener ('click', () => { this.Close (); });
        footerDiv.appendChild (cancelButton);

        let moveButton = document.createElement ('button');
        moveButton.className = 'ov_dialog_button ov_dialog_button_primary';
        moveButton.textContent = 'Move';
        moveButton.addEventListener ('click', () => {
            if (this.selectedGroupId === null) {
                return;
            }
            let entries = this.selectionManager.getSelection ();
            this.groupManager.moveToGroup (entries, this.selectedGroupId);
            this.Close ();
            if (onComplete) {
                onComplete ();
            }
        });
        footerDiv.appendChild (moveButton);
        this.moveButton = moveButton;

        // Center the dialog after layout
        requestAnimationFrame (() => {
            if (!dialogDiv.isConnected) { return; }
            let w = dialogDiv.offsetWidth;
            let h = dialogDiv.offsetHeight;
            dialogDiv.style.position = 'fixed';
            dialogDiv.style.left = Math.max (0, (window.innerWidth - w) / 2) + 'px';
            dialogDiv.style.top = Math.max (0, (window.innerHeight - h) / 3) + 'px';
        });

        document.addEventListener ('keydown', this.onEscKey);
    }

    RebuildTree ()
    {
        if (!this.treeDiv) {
            return;
        }
        while (this.treeDiv.firstChild) {
            this.treeDiv.removeChild (this.treeDiv.firstChild);
        }
        let rootNode = this.model.GetRootNode ();
        this.AddGroupItem (rootNode, 0, true);
        // Re-apply visual selection
        this.HighlightSelectedItem ();
    }

    AddGroupItem (node, depth, isRoot)
    {
        let item = document.createElement ('div');
        item.className = 'ov_group_dialog_item';
        item.style.paddingLeft = (8 + depth * 16) + 'px';
        item.setAttribute ('data-node-id', node.GetId ());

        let label = isRoot ? 'Root' : (node.GetName () || 'Group ' + node.GetId ());
        item.textContent = label;

        item.addEventListener ('click', () => {
            this.selectedGroupId = node.GetId ();
            this.HighlightSelectedItem ();
            this.UpdateHint ();
        });

        this.treeDiv.appendChild (item);

        // Recurse only into nodes that act as groups:
        //   - has children (a container), OR
        //   - has no meshes (an empty group / freshly created)
        // This filters out leaf mesh nodes that would otherwise appear as
        // bogus drop targets in the picker.
        for (let child of node.GetChildNodes ()) {
            if (child.ChildNodeCount () > 0 || child.MeshIndexCount () === 0) {
                this.AddGroupItem (child, depth + 1, false);
            }
        }
    }

    HighlightSelectedItem ()
    {
        if (!this.treeDiv) {
            return;
        }
        let allItems = this.treeDiv.querySelectorAll ('.ov_group_dialog_item');
        allItems.forEach ((item) => item.classList.remove ('selected'));
        let selected = this.treeDiv.querySelector (
            '[data-node-id="' + this.selectedGroupId + '"]'
        );
        if (selected) {
            selected.classList.add ('selected');
        }
    }

    UpdateHint ()
    {
        if (!this.hintDiv || this.selectedGroupId === null) {
            return;
        }
        let node = this.model.FindNodeById (this.selectedGroupId);
        let isRoot = node === this.model.GetRootNode ();
        let label = isRoot ? 'Root' : (node && node.GetName () ? node.GetName () : 'Group ' + this.selectedGroupId);
        this.hintDiv.textContent = 'New groups are created inside: ' + label;
    }

    Close ()
    {
        document.removeEventListener ('keydown', this.onEscKey);
        if (this.overlayDiv) {
            this.overlayDiv.remove ();
            this.overlayDiv = null;
        }
        if (this.dialogDiv) {
            this.dialogDiv.remove ();
            this.dialogDiv = null;
        }
        this.treeDiv = null;
        this.hintDiv = null;
        this.moveButton = null;
    }

    OnEscKey (ev)
    {
        if (ev.key === 'Escape') {
            this.Close ();
        }
    }
}
