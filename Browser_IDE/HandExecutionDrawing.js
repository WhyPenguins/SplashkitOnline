// Written by a human, tidied by GLM 5 :)
"use strict";

// --- Animation System ---

class Animator {
    constructor() {
        this.activeAnimations = [];
        this.isAnimating = false;
        this.lastTime = 0;
    }

    _calculateAcceleration(deltaTime, currentValue, targetValue, velocity, speed) {
        let distance = targetValue - currentValue;
        if (distance === 0) return 0;

        let targetVelocity = distance * speed;
        // v^2 = u^2 + 2as => a = (v^2 - u^2) / 2s
        return (targetVelocity * targetVelocity - velocity * velocity) / (2 * distance);
    }

    add(animation) {
        this.activeAnimations.push(animation);
        if (!this.isAnimating) {
            this.start();
        }
    }

    start() {
        this.isAnimating = true;
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.tick(t));
    }

    tick(currentTime) {
        const elapsed = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Loop backwards for safe removal
        for (let i = this.activeAnimations.length - 1; i >= 0; i--) {
            let anim = this.activeAnimations[i];
            anim.update(elapsed, this._calculateAcceleration);

            if (anim.isFinished()) {
                anim.finish();
                this.activeAnimations.splice(i, 1);
            }
        }

        if (this.activeAnimations.length === 0) {
            this.isAnimating = false;
        } else {
            requestAnimationFrame((t) => this.tick(t));
        }
    }
}

// Singleton instance for global animation handling
const globalAnimator = new Animator();

class AnimatedValue {
    constructor(get, set, speed) {
        this._get = get;
        this._set = set;
        this._speed = speed;
        this._velocity = 0;
        this._acceleration = 0;
        this._target = get();
    }

    transition(newValue) {
        this._target = newValue;
        globalAnimator.add(this);
    }

    update(elapsed, calcAccelFunc) {
        this._acceleration = calcAccelFunc(elapsed, this._get(), this._target, this._velocity, this._speed);
        this._velocity += this._acceleration * elapsed;
        let newValue = this._get() + this._velocity * elapsed;
        this._set(newValue);
    }

    isFinished() {
        return Math.abs(this._get() - this._target) < 1 && Math.abs(this._velocity) < 1;
    }

    finish() {
        this._set(this._target);
        this._velocity = 0;
        this._acceleration = 0;
    }
}


// --- Helper Functions ---

/**
 * Gets absolute X/Y coordinates of an element.
 * In an SVG element, gets absolute coordinates within the SVG
 */
function getAbsoluteOffset(elem) {
    let x = 0, y = 0;
    let curr = elem;
    while (curr) {
        if (curr.offsetLeft === undefined)
            break;
        x += curr.offsetLeft;
        y += curr.offsetTop;
        curr = curr.offsetParent;
    }
    return { x, y };
}

/**
 * Generates a unique ID for a memory address based on type.
 */
function getMemoryId(type, address) {
    return `${type}%${address}`;
}


// --- Visualization Classes ---

/**
 * Represents a pointer line drawn in the SVG layer.
 */
class PointerLine {
    constructor(container, startDot, targetElem) {
        this.container = container;
        this.start = startDot;
        this.pointee = targetElem;
        this.elem = null;
        this.cross = null;

        // Create the SVG Path
        this.elem = elemFromSVG(`<path d="" fill="transparent" marker-end="url(#arrowhead)" class="pointer-line fade-on-create"></path>`)[0];
        container.append(this.elem);

        this.updatePosition();
    }

    updatePosition() {
        if (!this.start || !this.start.isConnected || (this.pointee && !this.pointee.isConnected)) {
            return;
        }

        const startOffset = getAbsoluteOffset(this.start);
        const dotX = startOffset.x + this.start.offsetWidth * 0.5;
        const dotY = startOffset.y + this.start.offsetHeight * 0.5;

        // Defaults off screen for "bad pointer"
        let endX = -100;
        let endY = 40;

        if (this.pointee) {
            const targetOffset = getAbsoluteOffset(this.pointee);
            endX = targetOffset.x;
            endY = targetOffset.y + this.pointee.offsetHeight * 0.5;
        }

        // Bezier curve calculation
        this.elem.setAttribute('d', `M ${dotX} ${dotY} C ${dotX} ${dotY - 20}, ${endX - 60} ${endY + 20}, ${endX - 5} ${endY + 10}`);

        // Update cross position if it exists
        if (this.cross) {
            const crossPoint = this.elem.getPointAtLength(this.elem.getTotalLength() * 0.75);
            this.cross.setAttribute('d', `M ${crossPoint.x} ${crossPoint.y}`);
        }
    }

    fadePointerLine() {
        this.elem.classList.add("dashed-pointer-line");
        const crossPoint = this.elem.getPointAtLength(this.elem.getTotalLength() * 0.75);

        this.cross = elemFromSVG(`<path d="M ${crossPoint.x} ${crossPoint.y}" fill="transparent" marker-end="url(#cross)" class="fade-on-create"></path>`)[0];
        this.container.append(this.cross);
    }

    removePointerLine(callback) {
        removeFadeOutNonLayout(this.elem, 300, callback);
        if (this.cross) {
            removeFadeOutNonLayout(this.cross, 300, callback);
        }
    }
}

/**
 * Represents a variable or allocation.
 */
class MemoryEntry {
    constructor({ nameElem, names, contentElem, valuesElem, variableElem, columns, fullName, elemCount = null }) {
        this.nameElem = nameElem;
        this.names = names;
        this.contentElem = contentElem;
        this.valuesElem = valuesElem;
        this.variableElem = variableElem;
        this.columns = columns;
        this.fullName = fullName;
        this.pointerLine = null;
        this.elemCount = elemCount;
    }
}


// --- Main Class ---
/* valueMode, stackMode, and heapMode affect
 * how the drawing is updated.
 * "append" always treats the drawing as immutable -
 *    old values/deleted objects/lines are crossed out,
 *    and new values added to the end.
 * "replace" is free to remove deleted objects/values instead,
 * leading to a clearer drawing of the _current_ state, but not of the
 * previous ones.
 * valueMode affects how the primitive values (inside boxes) are modified
 * stackMode affects how variables on the stack are modified
 * heapMode affects how allocations on the heap are modified
 *
 * Recommendations:
 * For faithful hand executions, everything on append
 * For clearer demonstrations, stackMode on replace, the other two on append.
 * For realtime programs with limited allocations, everything but heapMode on append (so it looks like the objects are "fixed" in place in memory).
 * For realtime programs with frequent re-allocations, everything on replace.
 */

class HandExecutionDrawing {
    constructor({valueMode = 'append', stackMode = 'append', heapMode = 'append', width = 550, height = 450} = {}) {
        if (!(width === parseInt(width))) width = 550;
        if (!(height === parseInt(height))) height = 450;

        this.minWidth = width;
        this.minHeight = height;

        this.container = elemNS(SVGNamespace, "svg", { viewBox: `0 0 ${width} ${height}`, xmlns: "http://www.w3.org/2000/svg", class: ["fade-on-create-slow"]});

        // Animate the width/height smoothly
        this.width = new AnimatedValue(
            () => this.container.viewBox.baseVal.width,
            (value) => { this.container.viewBox.baseVal.width = value; },
            4
        );
        this.height = new AnimatedValue(
            () => this.container.viewBox.baseVal.height,
            (value) => { this.container.viewBox.baseVal.height = value; },
            4
        );

        this.valueMode = valueMode; // append|replace
        this.stackMode = stackMode;
        this.heapMode = heapMode;

        // Central registry for pointer lines to update coordinates on reflow/resize
        this.activePointerLines = [];

        // Used to temporarily hide elements during batch operations
        this.hiddenElems = [];

        this.initialize();
    }

    showHidden(){
        for(let i = 0; i < this.hiddenElems.length; i ++)
        {
            this.hiddenElems[i].style.display = "";
        }
        this.hiddenElems = [];

        this.updateSize();
    }

    updateSize() {
        let handexecution = this.container.querySelector(".handexecution");
        let originalWidth = handexecution.style.width;
        let originalHeight = handexecution.style.minHeight;
        handexecution.style.minHeight = "auto";

        if (this.container.querySelector(".handexecution .border").style.width != '')
            handexecution.style.width = "max-content";

        this.width.transition(Math.max(handexecution.scrollWidth, this.minWidth));
        this.height.transition(Math.max(handexecution.scrollHeight, this.minHeight));

        handexecution.style.width = originalWidth;
        handexecution.style.minHeight = originalHeight;

        // Update all pointer lines
        for (let line of this.activePointerLines) {
            line.updatePosition();
        }
    }

    initialize() {
        while (this.container.firstChild)
            this.container.firstChild.remove();

        this.container.append(...elemFromSVG(`
            <defs>
                <marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 " fill="transparent" stroke="#444" stroke-width="2px"></path>
                </marker>
                <marker id="cross" markerWidth="20" markerHeight="20" refX="10" refY="10" orient="auto">
                    <line x1="0" y1="0" x2="20" y2="20" stroke="black" stroke-width="1.5" style="opacity: 0.5;"></line>
                    <line x1="0" y1="20" x2="20" y2="0" stroke="black" stroke-width="1.5" style="opacity: 0.5;"></line>
                </marker>
            </defs>
        `));

        // Renamed 'memory' to 'stackContainer' for clarity
        this.stackContainer = $div("memory", [
            $div("memorytitle fade-on-create", ["Memory (Stack)"]),
        ]);
        this.heapContainer = $div("memory", [
            $div("memorytitle fade-on-create", ["Memory (Heap)"]),
        ]);
        this.heapContainer.style.opacity = "0";

        this.terminalOutput = $div("handexecution-terminal", []);
        this.terminalOutputContainer = $div("section terminal-section", [
            $div("terminaltitle fade-on-create", ["Terminal Output"]),
            $div("variable fade-on-create", [
                this.terminalOutput
            ]),
        ]);

        let innerGraphic = $div("border", [
            $div("maintitle", ["Hand Execution"]),
            $div("section", [
                this.stackContainer,
                $div("", []),
                this.heapContainer,
            ]),
            this.terminalOutputContainer
        ]);

        // Manual resize events
        let self = this;
        innerGraphic.addEventListener('mousedown', (e) => {
            document.addEventListener('mouseup', function onMouseUp() {
                self.updateSize();
                document.removeEventListener('mouseup', onMouseUp);
            });
        });

        let foreignObject = elemNS(SVGNamespace, "foreignObject", { x: 0, y: 0, width: "100%", height: "100%" }, [
            $div("not-content inky handexecution", [
                innerGraphic
            ])
        ]);

        this.container.appendChild(foreignObject);
        this.null = null;

        this.typedMemoryMap = new Map();
        this.allocationsMap = new Map();
    }

    print(text) {
        this.terminalOutput.innerHTML += escape(text).replaceAll("\n", "<br/>");
    }

    buildStructure(parentElem, struct, isElement, initValues = [], updateMemory, {hide = false} = {})
    {
        let pieces = [];
        let principleAllocation = null;

        const _buildStructure = (parentElem, struct, isElement) => {
            let isPrimitive = !(struct.fields && struct.fields.length > 0);
            let id = getMemoryId(struct.type, struct.address);

            if (!principleAllocation)
                principleAllocation = [struct.address, id];

            // First check if we already know about this variable,
            // as perhaps a reference has been made instead
            let existing = this.typedMemoryMap.get(id);
            if (existing) {
                // Add alias
                let nameSpan = $span("fade-on-create", [` (${struct.name})`]);
                existing.names.push(nameSpan);
                existing.nameElem.appendChild(nameSpan);
                return;
            }

            pieces.push(id);

            // It's a new variable!
            let contentElem = null;
            let valuesElem = null;
            let variableElem = null;
            let fullName = "";

            if (!isElement) {
                let nameSpan = $span("fade-on-create", [struct.name]);
                let nameElem = $div("title fade-on-create", [nameSpan]);
                let names = [nameSpan];
                if (isPrimitive)
                    valuesElem = $div("values fade-on-create", []);

                contentElem = $div("content fade-on-create" + (struct.is_array ? " array" : ""), valuesElem ? [valuesElem] : []);
                variableElem = $div("variable fade-on-create", [nameElem, contentElem]);

                fullName = (parentElem.fullName??"") + ((parentElem.fullName??"") != "" ? "." : "") + struct.name;
                contentElem.fullName = fullName;

                variableElem.title = fullName;

                this.typedMemoryMap.set(id, new MemoryEntry({
                    nameElem, names, contentElem, valuesElem, variableElem, fullName, elemCount:(struct.fields??[]).length
                }));
            } else {
                // Array element logic
                variableElem = valuesElem = $div("col fade-on-create", []);

                let nameSpan = $span("fade-on-create", [struct.name]);
                let names = [nameSpan];
                let nameElem = $span("fade-on-create col-label", [nameSpan]);
                valuesElem.appendChild(nameElem);

                if (isPrimitive && initValues.map(x => x.address).indexOf(struct.address) == -1) {
                    if (updateMemory)
                        valuesElem.appendChild($span("fade-on-create", ["?"]));
                }

                fullName = `${parentElem.fullName??""}[${struct.name}]`;
                valuesElem.fullName = fullName;
                contentElem = valuesElem;

                variableElem.title = fullName;

                this.typedMemoryMap.set(id, new MemoryEntry({
                    nameElem, names, valuesElem, contentElem, columns: true, fullName, elemCount:(struct.fields??[]).length
                }));
            }

            // Recursion for fields
            if (struct.fields) {
                for (let field of struct.fields) {
                    _buildStructure(contentElem, field, struct.is_array);
                }
            }

            parentElem.appendChild(variableElem);
            if (hide) {
                variableElem.style.display = "none";
                this.hiddenElems.push(variableElem);
            }
        };

        _buildStructure(parentElem, struct, isElement);

        return {pieces, principleAllocation};
    }

    remapMemory(address, new_structure) {
        let allocation = this.allocationsMap.get(address);
        this.allocationsMap.delete(address);
        this.allocationsMap.set(new_structure.address, allocation);
        if (new_structure.is_array) {
            let existing = this.typedMemoryMap.get(allocation.principleAllocation);
            let new_id = getMemoryId(new_structure.type, new_structure.address);

            allocation.principleAllocation = new_id;
            this.typedMemoryMap.set(new_id, existing)

            let current_count = existing.elemCount;

            let overlap = Math.min(new_structure.fields.length, current_count);

            let pieces = [];
            let recurse = (struct) => {
                // Remap from the original address to the new one
                let originalAddress = struct.address - new_structure.address + address;
                let id = getMemoryId(struct.type, originalAddress);
                let new_id = getMemoryId(struct.type, struct.address);
                let existing = this.typedMemoryMap.get(id);
                this.typedMemoryMap.delete(id);
                this.typedMemoryMap.set(new_id, existing);
                // Recursion for fields
                if (struct.fields) {
                    for (let field of struct.fields) {
                        recurse(field);
                    }
                }
            }

            // handle existing elements
            for(let i = 0; i < overlap; i ++) {
                recurse(new_structure.fields[i]);
            }

            // add extra elements
            for(let i = overlap; i < new_structure.fields.length; i ++) {
                this.buildStructure(existing.contentElem, new_structure.fields[i], true, [], false);
            }

            // remove extra elements
            for(let i = overlap; i < current_count; i ++) {
                this._handleRemoval(existing.contentElem.childNodes[i], this.valueMode);
            }

            existing.elemCount = new_structure.fields.length;
        }
        else {
            // TODO: currently unused, trying to save time :)
        }
        this.updateSize();
    }

    allocateVariable(structure, initValues = [], updateMemory = true, {hide = false} = {}) {
        let pieces = [];
        let principleAllocation = null;

        this.stackContainer.fullName = "";

        // Determine allocation target (Stack or Heap)
        let isHeap = structure.name == "HEAP" || structure.location == "heap"; // TODO: structure.name == "HEAP" is a hack...
        if (isHeap) {
            structure.name = "";
            ({pieces, principleAllocation} = this.buildStructure(this.heapContainer, structure, false, initValues, updateMemory, {hide}));
            // so is this :)
            this.heapContainer.style.opacity = "1";
        } else {
            ({pieces, principleAllocation} = this.buildStructure(this.stackContainer, structure, false, initValues, updateMemory, {hide}));
        }

        this.allocationsMap.set(principleAllocation[0], {
            principleAllocation: principleAllocation[1],
            pieces,
            isHeap
        });

        if (updateMemory)
            this.updateValues(initValues);

        this.updateSize();
    }

    freeMemory(address) {
        let allocation = this.allocationsMap.get(address[0]);
        if (!allocation) return;

        // Determine mode based on allocation source
        let mode = allocation.isHeap ? this.heapMode : this.stackMode;

        // Handle main variable visualization
        let mainEntry = this.typedMemoryMap.get(allocation.principleAllocation);
        if (mainEntry) {
            // Does it still have references? These will be popped off in reverse-order,
            // before the actual object is removed. Aside from strange cases...
            if (mainEntry.names.length > 1)
            {
                this._handleRemoval(mainEntry.names[mainEntry.names.length-1], this.stackMode);
                mainEntry.names.pop();
                return;
            }

            this._handleRemoval(mainEntry.variableElem, mode);

            if (mainEntry.pointerLine) {
                this._handlePointerRemoval(mainEntry.pointerLine, mode);
            }
        }

        // Handle sub-pieces
        for (let pieceId of allocation.pieces) {
            let pieceEntry = this.typedMemoryMap.get(pieceId);
            if (pieceEntry) {
                this.typedMemoryMap.delete(pieceId);
                if (pieceEntry.pointerLine) {
                    this._handlePointerRemoval(pieceEntry.pointerLine, mode);
                }
            }
        }

        this.updateSize();
    }

    updateValues(newValues) {
        for (let newVal of newValues) {
            let id = getMemoryId(newVal.type, newVal.address);
            let variable = this.typedMemoryMap.get(id);

            if (!variable) {
                console.error("Tried to assign to address " + newVal.address);
                continue;
            }

            let valuesElem = variable.valuesElem;

            // Strike out or remove old value
            if (valuesElem.childNodes.length >= 1) {
                let lastChild = valuesElem.childNodes[valuesElem.childNodes.length - 1];
                if (!lastChild.classList.contains("col-label")) {
                    this._handleRemoval(lastChild, this.valueMode);
                }
            }

            // Handle existing pointer line removal
            if (variable.pointerLine) {
                this._handlePointerRemoval(variable.pointerLine, this.stackMode);
            }

            // Insert spacing
            if (this.valueMode == "append" && valuesElem.childNodes.length > (variable.columns ? 1 : 0))
                valuesElem.insertAdjacentHTML('beforeend', variable.columns ? "" : " ");

            // Create new value (Pointer or Primitive)
            if (newVal.type[newVal.type.length - 1] == '*' && newVal.type != "char*") {
                this._createPointerVisualization(variable, newVal);
            } else {
                if (String(newVal.val) != "")
                    valuesElem.appendChild($span("fade-on-create", [String(newVal.val)]));
            }
        }
        this.updateSize();
    }

    /**
     * Helper to visualize pointers.
     */
    _createPointerVisualization(variable, newVal) {
        let dot = $span("fade-on-create", ["o"]);
        variable.valuesElem.appendChild(dot);

        let pointee = null;
        if (newVal.val == 0) {
            if (!this.null) {
                let nameElem = $div("title fade-on-create", "nullptr");
                this.null = $div("variable fade-on-create null", [nameElem]);
                this.heapContainer.appendChild(this.null);
            }
            pointee = this.null;
        } else {
            let id = getMemoryId(newVal.type.slice(0, newVal.type.length - 1), newVal.val);
            let entry = this.typedMemoryMap.get(id);
            if (entry) pointee = entry.contentElem;
        }

        // Create the visual pointer line object
        let newPointerLine = new PointerLine(this.container, dot, pointee);

        // Attach methods and store reference
        variable.pointerLine = newPointerLine;
        this.activePointerLines.push(newPointerLine);
    }

    /**
     * Logic for removing/fading elements based on mode.
     */
    _handleRemoval(element, mode) {
        function isElementVisible(el) {
            return !!el.offsetParent;
        }
        if (!isElementVisible(element))
        {
            element.remove();
            return;
        }

        if (mode == "append") {
            element.classList.add("strikethrough");
        } else {
            removeFadeOutNonLayout(element, 300, () => this.updateSize());
        }
    }

    /**
     * Logic for removing/fading pointer lines based on mode.
     */
    _handlePointerRemoval(pointerLine, mode) {
        if (mode == "append") {
            pointerLine.fadePointerLine();
        } else {
            pointerLine.removePointerLine(() => this.updateSize());
        }
    }
}
