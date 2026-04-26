import { IsDefined } from '../engine/core/core.js';
import { AddDiv, CreateDiv, ShowDomElement, ClearDomElement, InsertDomElementBefore, InsertDomElementAfter } from '../engine/viewer/domutils.js';
import { CreateSvgIconElement, SetSvgIconImageElement } from './utils.js';

export function ScrollToView (element)
{
    element.scrollIntoView ({
        behavior : 'smooth',
        block : 'nearest'
    });
}

export class TreeViewButton
{
    constructor (imagePath)
    {
        this.imagePath = imagePath;
        this.mainElement = CreateSvgIconElement (this.imagePath, 'ov_tree_item_button');
        this.mainElement.setAttribute ('src', this.imagePath);
    }

    SetImage (imagePath)
    {
        this.imagePath = imagePath;
        SetSvgIconImageElement (this.mainElement, this.imagePath);
    }

    OnClick (clickHandler)
    {
        this.mainElement.addEventListener ('click', (ev) => {
            ev.stopPropagation ();
            clickHandler (ev);
        });
    }

    GetDomElement ()
    {
        return this.mainElement;
    }
}

export class TreeViewItem
{
    constructor (name, icon)
    {
        this.name = name;
        this.parent = null;
        this.mainElement = CreateDiv ('ov_tree_item');
        this.mainElement.setAttribute ('title', this.name);
        this.nameElement = AddDiv (this.mainElement, 'ov_tree_item_name', this.name);
        if (IsDefined (icon)) {
            let iconElement = CreateSvgIconElement (icon, 'ov_tree_item_icon');
            InsertDomElementBefore (iconElement, this.nameElement);
        }
    }

    OnClick (onClick)
    {
        this.mainElement.classList.add ('clickable');
        this.mainElement.style.cursor = 'pointer';
        this.mainElement.addEventListener ('click', onClick);
    }

    OnContextMenu (onContextMenu)
    {
        this.mainElement.addEventListener ('contextmenu', (ev) => {
            ev.preventDefault ();
            ev.stopPropagation ();
            onContextMenu (ev, this);
        });
    }

    // Inline rename: replace the name span with an editable input. Enter
    // commits, Escape cancels, blur commits. While renaming, drag/click of
    // this item are suppressed.
    BeginRename (currentName, onCommit, onCancel)
    {
        if (this._renameInput) {
            return;
        }

        let originalName = currentName !== undefined && currentName !== null
            ? currentName
            : (this.name || '');

        let input = document.createElement ('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'ov_tree_item_rename_input';

        // Hide the static label and place the input where it was
        this.nameElement.style.display = 'none';
        this.nameElement.parentNode.insertBefore (input, this.nameElement.nextSibling);
        // Suppress drag while editing
        let prevDraggable = this.mainElement.draggable;
        this.mainElement.draggable = false;
        // requestAnimationFrame so layout settles before focus
        requestAnimationFrame (() => {
            input.focus ();
            input.select ();
        });

        let finished = false;
        let cleanup = () => {
            if (finished) {
                return;
            }
            finished = true;
            input.remove ();
            this.nameElement.style.display = '';
            this.mainElement.draggable = prevDraggable;
            this._renameInput = null;
        };

        let commit = () => {
            let newName = input.value.trim ();
            cleanup ();
            if (newName.length > 0 && newName !== originalName) {
                this.SetName (newName);
                if (onCommit) {
                    onCommit (newName);
                }
            } else if (onCancel) {
                onCancel ();
            }
        };
        let cancel = () => {
            cleanup ();
            if (onCancel) {
                onCancel ();
            }
        };

        input.addEventListener ('keydown', (ev) => {
            ev.stopPropagation ();
            if (ev.key === 'Enter') {
                ev.preventDefault ();
                commit ();
            } else if (ev.key === 'Escape') {
                ev.preventDefault ();
                cancel ();
            }
        });
        input.addEventListener ('click', (ev) => {
            // Don't let an input click select/deselect the tree item
            ev.stopPropagation ();
        });
        input.addEventListener ('blur', commit);

        this._renameInput = input;
    }

    SetName (name)
    {
        this.name = name;
        this.nameElement.textContent = name;
        this.mainElement.setAttribute ('title', name);
    }

    SetDraggable (onDragStart)
    {
        this.mainElement.draggable = true;
        this.mainElement.addEventListener ('dragstart', (ev) => {
            ev.stopPropagation ();
            onDragStart (ev);
        });
    }

    SetDropTarget (callbacks)
    {
        this.mainElement.addEventListener ('dragenter', (ev) => {
            ev.preventDefault ();
            ev.stopPropagation ();
            this.mainElement.classList.add ('drop_target');
        });
        this.mainElement.addEventListener ('dragover', (ev) => {
            // Must preventDefault to enable drop
            ev.preventDefault ();
            ev.stopPropagation ();
            ev.dataTransfer.dropEffect = 'move';
        });
        this.mainElement.addEventListener ('dragleave', (ev) => {
            // dragleave fires when entering children; only clear when truly leaving
            if (!this.mainElement.contains (ev.relatedTarget)) {
                this.mainElement.classList.remove ('drop_target');
            }
        });
        this.mainElement.addEventListener ('drop', (ev) => {
            ev.preventDefault ();
            ev.stopPropagation ();
            this.mainElement.classList.remove ('drop_target');
            callbacks.onDrop (ev);
        });
    }

    SetParent (parent)
    {
        this.parent = parent;
    }

    AddDomElements (parentDiv)
    {
        parentDiv.appendChild (this.mainElement);
    }
}

export class TreeViewSingleItem extends TreeViewItem
{
    constructor (name, icon)
    {
        super (name, icon);
        this.selected = false;
    }

    SetSelected (selected)
    {
        this.selected = selected;
        if (this.selected) {
            this.mainElement.classList.add ('selected');
            let parent = this.parent;
            if (parent === null) {
                ScrollToView (this.mainElement);
            } else {
                while (parent !== null) {
                    parent.ShowChildren (true);
                    ScrollToView (this.mainElement);
                    parent = parent.parent;
                }
            }
        } else {
            this.mainElement.classList.remove ('selected');
        }
    }
}

export class TreeViewButtonItem extends TreeViewSingleItem
{
    constructor (name, icon)
    {
        super (name, icon);
        this.buttonsDiv = CreateDiv ('ov_tree_item_button_container');
        InsertDomElementBefore (this.buttonsDiv, this.nameElement);
    }

    AppendButton (button)
    {
        this.buttonsDiv.appendChild (button.GetDomElement ());
    }
}

export class TreeViewGroupItem extends TreeViewItem
{
    constructor (name, icon)
    {
        super (name, icon);
        this.children = [];
        this.isVisible = true;
        this.isChildrenVisible = false;

        this.childrenDiv = null;
        this.openButtonIcon = 'arrow_down';
        this.closeButtonIcon = 'arrow_right';

        this.openCloseButton = CreateSvgIconElement (this.openButtonIcon, 'ov_tree_item_icon');
        InsertDomElementBefore (this.openCloseButton, this.nameElement);
    }

    AddChild (child)
    {
        this.CreateChildrenDiv ();
        this.children.push (child);
        child.SetParent (this);
        child.AddDomElements (this.childrenDiv);
    }

    ExpandAll (expand)
    {
        for (let child of this.children) {
            if (child instanceof TreeViewGroupItem) {
                child.ShowChildren (expand);
                child.ExpandAll (expand);
            }
        }
    }

    Show (show)
    {
        this.isVisible = show;
        if (this.childrenDiv === null) {
            return;
        }
        if (this.isVisible) {
            ShowDomElement (this.mainElement, true);
            this.childrenDiv.classList.add ('ov_tree_view_children');
        } else {
            ShowDomElement (this.mainElement, false);
            this.childrenDiv.classList.remove ('ov_tree_view_children');
        }
    }

    ShowChildren (show)
    {
        this.isChildrenVisible = show;
        if (this.childrenDiv === null) {
            return;
        }
        if (show) {
            SetSvgIconImageElement (this.openCloseButton, this.openButtonIcon);
            ShowDomElement (this.childrenDiv, true);
        } else {
            SetSvgIconImageElement (this.openCloseButton, this.closeButtonIcon);
            ShowDomElement (this.childrenDiv, false);
        }
    }

    CreateChildrenDiv ()
    {
        if (this.childrenDiv === null) {
            this.childrenDiv = CreateDiv ('ov_tree_view_children');
            InsertDomElementAfter (this.childrenDiv, this.mainElement);
            this.Show (this.isVisible);
            this.ShowChildren (this.isChildrenVisible);
            this.OnClick ((ev) => {
                this.isChildrenVisible = !this.isChildrenVisible;
                this.ShowChildren (this.isChildrenVisible);
            });
        }
        return this.childrenDiv;
    }
}

export class TreeViewGroupButtonItem extends TreeViewGroupItem
{
    constructor (name, icon)
    {
        super (name, icon);
        this.buttonsDiv = CreateDiv ('ov_tree_item_button_container');
        InsertDomElementBefore (this.buttonsDiv, this.nameElement);
    }

    AppendButton (button)
    {
        this.buttonsDiv.appendChild (button.GetDomElement ());
    }
}

export class TreeView
{
    constructor (parentDiv)
    {
        this.mainDiv = AddDiv (parentDiv, 'ov_tree_view');
        this.children = [];
    }

    GetDomElement ()
    {
        return this.mainDiv;
    }

    AddClass (className)
    {
        this.mainDiv.classList.add (className);
    }

    AddChild (child)
    {
        child.AddDomElements (this.mainDiv);
        this.children.push (child);
    }

    Clear ()
    {
        ClearDomElement (this.mainDiv);
        this.children = [];
    }
}
