export class GridSlider
{
    constructor (grid, parentElement)
    {
        this.grid = grid;
        this.parentElement = parentElement;
        this.stops = [1, 5, 10, 20, 50, 100];
        this.currentIndex = 2; // default: 10m
        this.containerDiv = null;
        this.Build ();
    }

    Build ()
    {
        this.containerDiv = document.createElement ('div');
        this.containerDiv.className = 'ov_grid_slider only_on_model';

        let labelDiv = document.createElement ('div');
        labelDiv.className = 'ov_grid_slider_label';
        labelDiv.textContent = this.stops[this.currentIndex] + 'm';
        this.labelDiv = labelDiv;
        this.containerDiv.appendChild (labelDiv);

        let input = document.createElement ('input');
        input.type = 'range';
        input.className = 'ov_grid_slider_input';
        input.min = '0';
        input.max = String (this.stops.length - 1);
        input.step = '1';
        input.value = String (this.currentIndex);
        this.input = input;
        this.containerDiv.appendChild (input);

        let ticksDiv = document.createElement ('div');
        ticksDiv.className = 'ov_grid_slider_ticks';
        for (let stop of this.stops) {
            let span = document.createElement ('span');
            span.textContent = stop + 'm';
            ticksDiv.appendChild (span);
        }
        this.containerDiv.appendChild (ticksDiv);

        input.addEventListener ('input', (ev) => {
            let idx = parseInt (ev.target.value);
            this.currentIndex = idx;
            let spacing = this.stops[idx];
            this.labelDiv.textContent = spacing + 'm';
            if (this.grid) {
                this.grid.setSpacing (spacing);
            }
        });

        this.parentElement.appendChild (this.containerDiv);
    }

    destroy ()
    {
        if (this.containerDiv && this.containerDiv.parentNode) {
            this.containerDiv.remove ();
        }
    }
}
