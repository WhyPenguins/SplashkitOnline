"use strict";

let terminalPanel = document.getElementById('outputPanel');
let terminalElement = document.getElementById('output');
let terminalInput = document.getElementById("terminal-input");
let terminalInputHint = document.getElementById("terminal-input-hint");
let terminalHead = undefined;

let terminalScrollbackLimit = 400; //400 spans, or ~400 lines

function setTerminalInputAwaitState(awaiting) {
    if (awaiting) {
        if (handExecutionDrawing) {
            // This is a hack
            // TODO: Figure out something better
            document.getElementById("terminalOutputContainer").style.display = "flex";
            document.getElementById("canvasContainer").style.flexGrow = "3";

        } else {
            showTerminal(false);
        }
        terminalInputHint.innerText = 'awaiting input...';
        terminalInputHint.scrollIntoViewIfNeeded();
    }
    else
        terminalInputHint.innerText = ' '; // space to ensure the line is at least the right height
}

function resetTerminalInput(){
    terminalInput.innerHTML = '';
    terminalInputHint.style.display = 'initial';
    setTerminalInputAwaitState(false);
}

function clearTerminal() {
    terminalElement.innerHTML = "";
    terminalElement.insertAdjacentHTML('beforeend', "<div><span></span><br></div>");
    terminalHead = terminalElement.lastChild;

    resetTerminalInput();
}

clearTerminal();

function writeTerminalSpan(head, text, classList){
    let el = head.appendChild(document.createElement('span'));
    el.classList.add(...classList);
    el.innerHTML = text;
}
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace('\n', '<br>', 'g');
}


function writeTerminal(text, escapeSpecialCharacters = true){
    if (terminalElement) {
        if (arguments.length > 2) {
            // Convert the arguments object to an array, excluding the last argument
            let textArgs = Array.prototype.slice.call(arguments, 0, -1);
            text = textArgs.join(' ');
        }

        // Escape special characters if needed
        if (escapeSpecialCharacters) {
            text = escapeHtml(text);
        }

        let sections = text.split("\x1b[");

        let newTerminalHead = document.createElement("span");
        let curFmtClasses = terminalHead.lastChild.className.split(/,| /).filter(s=>s);

        // We can immediately insert all the text before the first control sequence,
        // as no styling needs to be changed yet.
        writeTerminalSpan(newTerminalHead, sections[0], curFmtClasses);
        sections.splice(0, 1);

        sections = sections.map(s => {
            let i = s.indexOf("m");

            // Each section has the form: (format codes list, text)
            return [s.substring(0, i).split(";"), s.substring(i+1)]
        });

        for(let section of sections){
            let fmtCodes = section[0];
            let fmtText = section[1];

            curFmtClasses = newTerminalHead.lastChild.className.split(/,| /).filter(s=>s);

            if(fmtCodes.includes("0")){
                // SGR code 0 resets all styling.
                curFmtClasses = [];
            }

            let fmtClasses = fmtCodes.map(s => "sk-term-fmt-code" + s);
            fmtClasses = fmtClasses.filter(s => !curFmtClasses.includes(s));
            // Only concern ourself with styles that aren't already applied.

            writeTerminalSpan(newTerminalHead, fmtText, fmtClasses);
        }

        terminalHead = newTerminalHead;
        terminalElement.appendChild(newTerminalHead);

        terminalPanel.scrollTop = terminalPanel.scrollHeight; // focus on bottom
    }

    while(terminalElement.childNodes.length > terminalScrollbackLimit){
        terminalElement.children[0].remove();
    }

    if (handExecutionDrawing) {
        showCanvas();
    } else {
        terminalInput.focus();
        showTerminal();
    }
}

window.addEventListener("print", async function(ev) {
    writeTerminal(ev.text);
});

document.getElementById("canvas").addEventListener("click", async function () {
    document.getElementById("canvas").focus();
});


/* Bunch of code to make the user unable to type in previous parts of the terminal,
 * while still allowing selecctions. Might be a neater way of doing it?
 * Also handles actually sending the text, in 'keydown'
 */
function moveCursorToEnd() {
    const range = document.createRange();
    const sel = window.getSelection();

    // Place cursor at the end
    range.selectNodeContents(terminalInput);
    range.collapse(false);

    sel.removeAllRanges();
    sel.addRange(range);

    terminalInput.focus();
};

terminalPanel.addEventListener("keydown", (e) => {
    // send terminal input on enter
    if (e.key === "Enter") {
        let text = terminalInput.innerText + "\n";
        writeTerminal(text);
        if (handExecutionDrawing)
            handExecutionDrawing.print(text);
        executionEnvironment.InputFromTerminal(text);

        resetTerminalInput();
        e.preventDefault();
    }

    // Block most navigation keys
    const blockedKeys = [
        "ArrowLeft",
        "ArrowUp",
        "ArrowRight",
        "ArrowDown",
        "Home",
        "PageUp",
        "PageDown"
    ];

    if (blockedKeys.includes(e.key)) {
        e.preventDefault();
    }

    moveCursorToEnd();
});

terminalPanel.addEventListener("focus", moveCursorToEnd);
terminalPanel.addEventListener("input", function(){
    // update hint text when typed
    terminalInputHint.style.display = terminalInput.innerText.length > 0 ? 'none' : 'initial';

    moveCursorToEnd();
});

terminalPanel.addEventListener("mouseup", (e) => {
    if (window.getSelection().getRangeAt(0).collapsed)
        moveCursorToEnd();
});




// Convenience function for reporting errors, printing them to the terminal
// and also sending a message to the main window.
function ReportError(block, message, line, stacktrace ,formatted=false){
    let outputMessage = message != "";
    let stackTrace = stacktrace;

    // Ensure block and message are strings
    block = block || "";
    message = message || "";

    // Escape only the user-provided input
    let escapedBlock = escapeHtml(block);
    let escapedMessage = escapeHtml(message);

    if (outputMessage && line != null && !formatted){
        escapedMessage = "Error on line "+line+": "+escapedMessage;

    }

    

    if (escapedBlock != null && escapedBlock != "" && escapedBlock != "__USERCODE__null") {
        if (!escapedBlock.startsWith(userCodeBlockIdentifier)){
            escapedMessage = "Please file a bug report and send us the following info!\n    Error in file: "+escapedBlock+"\n    "+escapedMessage;
            escapedBlock = "Internal Error";
        }
        else{
            escapedBlock = escapedBlock.slice(userCodeBlockIdentifier.length);
        }
        if (outputMessage)
            escapedMessage = "(" + escapedBlock + ") " + escapedMessage;
        
    }
    
    

    // Check if the stackTrace is empty
    if (stackTrace != null && stackTrace.trim() !== "") {
        // Format the stack trace with <details> and <summary> tags
        stackTrace = '<pre>' + stackTrace + '</pre>';
        
        if (outputMessage && !formatted) {
            // If formatted is true, do not add the color: red styling
            escapedMessage = '<summary' + (formatted ? '' : ' style="color: red;"') + '>' + escapedMessage + '</summary>';
            escapedMessage = '<details>' + escapedMessage + stackTrace + '</details>';
        }
            
    }else {
        escapedMessage = "\x1b[0m\x1b[31m" + escapedMessage + "\x1b[0m";
    }

    if (outputMessage)
        writeTerminal(escapedMessage, false);

    parent.postMessage({
        type: "error",
        block: escapedBlock,
        message: escapedMessage,
        line: line
    },"*");

    showTerminal(false);
}

let headerHeight = parseFloat(getComputedStyle(document.getElementsByClassName("sk-header")[0]).height.slice(0,-2));


if (!SKO.useEmbeddedInterface) // no resizing/gutters in embedded
{
    Split(['#canvasContainer', '#terminalOutputContainer'], {
        direction: 'vertical',
        sizes: [75, 25],
        minSize: [100, headerHeight],
        gutterSize: 5,
        gutterAlign: 'center',
        snapOffset: 20,
    });
}

if (SKO.theme.includes("light")) {
    document.documentElement.dataset.theme = "light";
}

function updateLoadingProgress(progress) {
    const progressBar = document.getElementById('loading-progress');
    if (progressBar) {
        progressBar.style.width = progress * 100 + '%';
        progressBar.setAttribute('aria-valuenow', progress * 100);
    }
}

function hideLoadingContainer() {
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
        loadingContainer.style.opacity = '0';
    }
}

function showLoadingContainer() {
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
        loadingContainer.style.opacity = '1';
    }
}

function showDownloadFailure() {
    const progressBar = document.getElementById('loading-progress');
    const loadingText = document.getElementById('loading-text');
    if (progressBar && loadingText) {
        progressBar.style.backgroundColor = 'red';
        loadingText.textContent = 'Download Failed';
    }
}

let outputViewLocked = false;

function unlockOutputViewerSwitch(){
    outputViewLocked = false;
}

function showTerminal(auto = true){
    if (!SKO.useEmbeddedInterface) return;
    if (auto && outputViewLocked) return;

    document.getElementById("canvasContainer").style.display = "none";
    document.getElementById("terminalOutputContainer").style.display = "flex";

    document.getElementById("canvasButton").classList.remove("active-mini-tab");
    document.getElementById("terminalButton").classList.add("active-mini-tab");

    if (!auto) outputViewLocked = true;
}

function showCanvas(auto = true){
    if (!SKO.useEmbeddedInterface) return;
    if (auto && outputViewLocked) return;

    document.getElementById("canvasContainer").style.display = "flex";
    document.getElementById("terminalOutputContainer").style.display = "none";

    document.getElementById("canvasButton").classList.add("active-mini-tab");
    document.getElementById("terminalButton").classList.remove("active-mini-tab");

    if (!auto) outputViewLocked = true;
}

if (SKO.useEmbeddedInterface) {
    document.body.classList.add("sk-minified");
    document.body.classList.add("sk-embedded");

    // setup terminal/window switching
    document.getElementById("terminalCanvasSwitch").style.display = "initial";
    showTerminal(true);
}

let handExecutionDrawing = null;


showLoadingContainer();
updateLoadingProgress(0);
