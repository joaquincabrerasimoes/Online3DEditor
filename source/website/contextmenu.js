

export class ContextMenu
{
    constructor ()
    {
        this.menuDiv = null;
        this.activeSubmenu = null;
        this.onOutsideClick = this.OnOutsideClick.bind (this);
        this.onEscKey = this.OnEscKey.bind (this);
        this.onScroll = this.OnScroll.bind (this);
    }

    show (x, y, items)
    {
        this.hide ();

        this.menuDiv = this.BuildMenu (items);
        document.body.appendChild (this.menuDiv);

        // Position with boundary detection
        this.menuDiv.style.position = 'absolute';
        this.menuDiv.style.left = x + 'px';
        this.menuDiv.style.top = y + 'px';
        this.menuDiv.style.zIndex = '1000';

        // After DOM insertion, check boundaries
        requestAnimationFrame (() => {
            if (!this.menuDiv) {
                return;
            }
            let rect = this.menuDiv.getBoundingClientRect ();
            let viewportW = window.innerWidth;
            let viewportH = window.innerHeight;

            if (rect.right > viewportW) {
                this.menuDiv.style.left = Math.max (0, x - rect.width) + 'px';
            }
            if (rect.bottom > viewportH) {
                this.menuDiv.style.top = Math.max (0, y - rect.height) + 'px';
            }
        });

        // Delay outside-click handler so the triggering event doesn't close immediately
        setTimeout (() => {
            document.addEventListener ('click', this.onOutsideClick);
            document.addEventListener ('keydown', this.onEscKey);
            window.addEventListener ('scroll', this.onScroll, true);
        }, 0);
    }

    hide ()
    {
        if (this.activeSubmenu) {
            this.activeSubmenu.hide ();
            this.activeSubmenu = null;
        }
        if (this.menuDiv) {
            this.menuDiv.remove ();
            this.menuDiv = null;
        }
        document.removeEventListener ('click', this.onOutsideClick);
        document.removeEventListener ('keydown', this.onEscKey);
        window.removeEventListener ('scroll', this.onScroll, true);
    }

    BuildMenu (items)
    {
        let div = document.createElement ('div');
        div.className = 'ov_context_menu';

        for (let i = 0; i < items.length; i++) {
            let item = items[i];

            if (item.separator) {
                let sep = document.createElement ('div');
                sep.className = 'ov_context_menu_separator';
                div.appendChild (sep);
                continue;
            }

            let itemDiv = document.createElement ('div');
            itemDiv.className = 'ov_context_menu_item';
            if (item.disabled) {
                itemDiv.classList.add ('disabled');
            }

            if (item.icon) {
                let iconSpan = document.createElement ('span');
                iconSpan.className = 'ov_context_menu_icon';
                iconSpan.textContent = item.icon;
                itemDiv.appendChild (iconSpan);
            }

            let labelSpan = document.createElement ('span');
            labelSpan.className = 'ov_context_menu_label';
            labelSpan.textContent = item.label;
            itemDiv.appendChild (labelSpan);

            if (item.submenu) {
                let arrowSpan = document.createElement ('span');
                arrowSpan.className = 'ov_context_menu_arrow';
                arrowSpan.textContent = '▶';
                itemDiv.appendChild (arrowSpan);

                itemDiv.addEventListener ('mouseenter', (ev) => {
                    if (this.activeSubmenu) {
                        this.activeSubmenu.hide ();
                    }
                    let rect = itemDiv.getBoundingClientRect ();
                    let sub = new ContextMenu ();
                    sub.show (rect.right, rect.top, item.submenu);
                    this.activeSubmenu = sub;
                });
            } else if (!item.disabled && item.onClick) {
                itemDiv.addEventListener ('click', (ev) => {
                    ev.stopPropagation ();
                    item.onClick ();
                    this.hide ();
                });
            }

            div.appendChild (itemDiv);
        }

        return div;
    }

    OnOutsideClick (ev)
    {
        if (this.menuDiv && !this.menuDiv.contains (ev.target)) {
            this.hide ();
        }
    }

    OnEscKey (ev)
    {
        if (ev.key === 'Escape') {
            this.hide ();
        }
    }

    OnScroll ()
    {
        this.hide ();
    }
}
