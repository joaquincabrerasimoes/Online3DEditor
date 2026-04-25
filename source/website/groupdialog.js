

export class GroupDialog
{
    constructor ()
    {
        this.overlayDiv = null;
        this.selectedGroupId = null;
        this.onEscKey = this.OnEscKey.bind (this);
    }

    Show (model, groupManager, selectionManager, onComplete)
    {
        this.Close ();

        this.selectedGroupId = null;

        // Create modal overlay
        this.overlayDiv = document.createElement ('div');
        this.overlayDiv.className = 'ov_modal_overlay';
        document.body.appendChild (this.overlayDiv);

        // Dialog card
        let dialogDiv = document.createElement ('div');
        dialogDiv.className = 'ov_dialog ov_group_dialog';
        document.body.appendChild (dialogDiv);

        // Title
        let titleDiv = document.createElement ('div');
        titleDiv.className = 'ov_dialog_title';
        titleDiv.textContent = 'Move to Group';
        dialogDiv.appendChild (titleDiv);

        // Content — scrollable group tree
        let contentDiv = document.createElement ('div');
        contentDiv.className = 'ov_dialog_content ov_group_dialog_content';
        dialogDiv.appendChild (contentDiv);

        let treeDiv = document.createElement ('div');
        treeDiv.className = 'ov_group_dialog_tree';
        contentDiv.appendChild (treeDiv);

        // Build tree of existing groups
        this.BuildGroupTree (treeDiv, model, groupManager, (nodeId) => {
            this.selectedGroupId = nodeId;
            // Update selected item visual
            let allItems = treeDiv.querySelectorAll ('.ov_group_dialog_item');
            allItems.forEach ((item) => item.classList.remove ('selected'));
            let selected = treeDiv.querySelector ('[data-node-id="' + nodeId + '"]');
            if (selected) {
                selected.classList.add ('selected');
            }
            moveButton.disabled = false;
            moveButton.classList.remove ('disabled');
        });

        // Create new group inline section
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
        confirmCreateBtn.textContent = '✓';
        confirmCreateBtn.style.display = 'none';
        createSection.appendChild (confirmCreateBtn);

        createBtn.addEventListener ('click', () => {
            createBtn.style.display = 'none';
            createInput.style.display = '';
            confirmCreateBtn.style.display = '';
            createInput.focus ();
        });

        let doCreate = () => {
            let name = createInput.value.trim ();
            if (!name) {
                return;
            }
            let newId = groupManager.createGroup (name, null);
            if (newId !== null) {
                this.selectedGroupId = newId;
                // Rebuild tree to show new group
                while (treeDiv.firstChild) { treeDiv.removeChild (treeDiv.firstChild); }
                this.BuildGroupTree (treeDiv, model, groupManager, (nodeId) => {
                    this.selectedGroupId = nodeId;
                    let allItems = treeDiv.querySelectorAll ('.ov_group_dialog_item');
                    allItems.forEach ((item) => item.classList.remove ('selected'));
                    let sel = treeDiv.querySelector ('[data-node-id="' + nodeId + '"]');
                    if (sel) { sel.classList.add ('selected'); }
                    moveButton.disabled = false;
                    moveButton.classList.remove ('disabled');
                });
                // Auto-select the new group
                let newItem = treeDiv.querySelector ('[data-node-id="' + newId + '"]');
                if (newItem) {
                    newItem.classList.add ('selected');
                    moveButton.disabled = false;
                    moveButton.classList.remove ('disabled');
                }
                createBtn.style.display = '';
                createInput.style.display = 'none';
                confirmCreateBtn.style.display = 'none';
                createInput.value = '';
            }
        };

        confirmCreateBtn.addEventListener ('click', doCreate);
        createInput.addEventListener ('keydown', (ev) => {
            if (ev.key === 'Enter') { doCreate (); }
            if (ev.key === 'Escape') {
                createBtn.style.display = '';
                createInput.style.display = 'none';
                confirmCreateBtn.style.display = 'none';
                createInput.value = '';
            }
        });

        // Footer buttons
        let footerDiv = document.createElement ('div');
        footerDiv.className = 'ov_dialog_buttons';
        dialogDiv.appendChild (footerDiv);

        let cancelButton = document.createElement ('button');
        cancelButton.className = 'ov_dialog_button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener ('click', () => { this.Close (); });
        footerDiv.appendChild (cancelButton);

        let moveButton = document.createElement ('button');
        moveButton.className = 'ov_dialog_button ov_dialog_button_primary disabled';
        moveButton.textContent = 'Move';
        moveButton.disabled = true;
        moveButton.addEventListener ('click', () => {
            if (this.selectedGroupId === null) {
                return;
            }
            let entries = selectionManager.getSelection ();
            groupManager.moveToGroup (entries, this.selectedGroupId);
            this.Close ();
            if (onComplete) {
                onComplete ();
            }
        });
        footerDiv.appendChild (moveButton);

        // Center dialog
        requestAnimationFrame (() => {
            if (!dialogDiv.isConnected) { return; }
            let w = dialogDiv.offsetWidth;
            let h = dialogDiv.offsetHeight;
            dialogDiv.style.position = 'fixed';
            dialogDiv.style.left = Math.max (0, (window.innerWidth - w) / 2) + 'px';
            dialogDiv.style.top = Math.max (0, (window.innerHeight - h) / 3) + 'px';
        });

        this.dialogDiv = dialogDiv;

        document.addEventListener ('keydown', this.onEscKey);
        this.overlayDiv.addEventListener ('click', () => { this.Close (); });
    }

    BuildGroupTree (container, model, groupManager, onSelect)
    {
        // Add root as option
        let rootNode = model.GetRootNode ();
        this.AddGroupItem (container, rootNode, 0, onSelect, true);
    }

    AddGroupItem (container, node, depth, onSelect, isRoot)
    {
        let item = document.createElement ('div');
        item.className = 'ov_group_dialog_item';
        item.style.paddingLeft = (8 + depth * 16) + 'px';
        item.setAttribute ('data-node-id', node.GetId ());

        let label = isRoot ? 'Root' : (node.GetName () || 'Group ' + node.GetId ());
        item.textContent = label;

        item.addEventListener ('click', () => {
            onSelect (node.GetId ());
        });

        container.appendChild (item);

        // Add children recursively (non-leaf nodes only)
        for (let child of node.GetChildNodes ()) {
            if (child.ChildNodeCount () > 0 || child.GetName ()) {
                this.AddGroupItem (container, child, depth + 1, onSelect, false);
            }
        }
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
    }

    OnEscKey (ev)
    {
        if (ev.key === 'Escape') {
            this.Close ();
        }
    }
}
