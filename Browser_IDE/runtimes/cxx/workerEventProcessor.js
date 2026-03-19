// Note: all the code inside this file must be synchronous, as
// it's called from inside the user's program.
// Asynchronous events can't come back until the user's program ends.

minimumEventsCheckInterval = 0; // set to 0, so we always fetch user events.
let nextEventsCheckTime = 0;

// disable keepAlive system until we receive first keepAlive signal
let lastKeepAlive = -1;

//TODO: Do we need both ping and keepAlive?

const pingMaxDelay = 10; // max delay of 10 milliseconds - after this we sleep to avoid filling the main thread with too many messages

let pingReplyDeadline = -1;
let currentPingSendTime = -1;
let lastPingDelay = 0;

let normalPaused = false;

function sendPing(now) {
    postCustomMessage({
        type: "Ping",
        time: now
    });
    currentPingSendTime = now;
    pingReplyDeadline = now + pingMaxDelay;
}

function postCustomMessage(data) {
  postMessage({ target: 'custom', userData: data });
}

function handleEvent([event, args]){
    switch (event){
        case "terminate":
            while(true){ } // just pause until the worker is killed
            break;
        case "pause":
            if (normalPaused)
                break;
            postCustomMessage({
                type: "ProgramPaused"
            });
            pauseLoop('continue', true,true, -1, null, sleepTime=100);
            break;
        case "keepAlive":
            lastKeepAlive = performance.now();
            break;

        // TODO: de-duplicate this code and the code in executionEnvironment_Internal.js
        case "mkdir":
            FS.mkdir(args.path);
            break;
        case "writeFile":
            if (typeof args.data == 'string')
                FS.writeFile(args.path, args.data);
            else
                FS.writeFile(args.path, new Uint8Array(args.data));
            break;
        case "rename":
            FS.rename(args.oldPath,args.newPath);
            break;
        case "unlink":
            FS.unlink(args.path);
            break;
        case "rmdir":
            if(args.recursive){
                let deleteContentsRecursive = function(p){
                    let entries = FS.readdir(p);
                    for(let entry of entries){
                        if(entry == "." || entry == "..")
                            continue;
                        // All directories contain a reference to themself
                        // and to their parent directory. Ignore them.

                        let entryPath = p + "/" + entry;
                        let entryStat = FS.stat(entryPath, false);

                        if(FS.isDir(entryStat.mode)){
                            deleteContentsRecursive(entryPath);
                            FS.rmdir(entryPath);
                        } else if(FS.isFile(entryStat.mode)){
                            FS.unlink(entryPath);
                        }

                    }
                }
                deleteContentsRecursive(args.path);
                FS.rmdir(args.path);
                // FS.rmdir expects the directory to be empty
                // and will throw an error if it is not.
            } else {
                FS.rmdir(args.path);
            }
            break;
        case "stdin":
            Module.intArrayFromString(args.value).forEach(function(v) {inputBuffer.push(v)});
            inputBuffer[inputBuffer.length-1] = null;
            break;
        case "continue":
            break;
        case "EmEvent":
            switch (args.target) {
                case 'document': {
                    document.fireEvent(args.event);
                    break;
                }
                case 'window': {
                    args.event.target = '';
                    window.fireEvent(args.event);
                    break;
                }
                case 'canvas': {
                    if (args.event) {
                        Module.canvas.fireEvent(args.event);
                    } else if (args.boundingClientRect) {
                        Module.canvas.boundingClientRect = args.boundingClientRect;
                    } else throw 'ey?';
                    break;
                }
            }

            break;
        case "pingReply":
            // ignore all ping replies except most recent
            if (args.time == currentPingSendTime) {
                lastPingDelay = performance.now() - currentPingSendTime;
                sendPing(performance.now());
            }
            break;
        case "updateRuntimeOptions":
            runtimeOptions = args.runtimeOptions;
            break;
        default:
            throw new Error("Unexpected event in workerEventProcessor.js: " + JSON.stringify(event));
    }
}

var httpRequest = new XMLHttpRequest();
let skipNextCommands = false;

// fetch the latest events
function fetchEvents() {
    let programEvents = null;

    try{
        httpRequest.open("GET", "/programEvents.js", false);
        httpRequest.send(null);

        if (httpRequest.response != "")
            programEvents = JSON.parse(httpRequest.response);
        else
            programEvents = [];

    }
    catch (err){
        console.error("Failed to fetch new events: ", err, httpRequest.response);
    }
    return programEvents;
}

function sleep(delayms) {
    try{
        httpRequest.open("GET", "/sleep?ms="+delayms, false);
        httpRequest.send(null);
    }
    catch (err){
        console.error("Failed to sleep: ", err, httpRequest.response);
    }
}

function __sko_process_events(){

    let now = performance.now();

    emitAudio(now);

    if (now >= nextEventsCheckTime){
        nextEventsCheckTime = now + minimumEventsCheckInterval;

        let programEvents = fetchEvents();

        try{
            if (programEvents && !skipNextCommands)
                programEvents.forEach(handleEvent);
        }
        catch (err){
            throw err;
        }

        skipNextCommands = false;
    }

    now = performance.now();

    // if keep alive is active and it's been a while since we got a signal...
    if (lastKeepAlive > 0 && lastKeepAlive + 1000 < now) {
        pauseLoop('keepAlive', false);
        now = performance.now();
    }

    // update lastPingDelay once we go over the deadline
    if (currentPingSendTime != -1 && pingReplyDeadline < now)
        lastPingDelay = now - currentPingSendTime;

    if (lastPingDelay > pingMaxDelay) {
        // send another ping in case the previous one was lost
        sendPing(now);

        // now keep looping, handling events (so we continue to send/recieve pings)
        pauseLoop(null, false, true, -1, function(programEvents){
            // stay paused until ping delay is reasonable
            return lastPingDelay > pingMaxDelay;
        });
    }

    // if no ping is currently sent, send one!
    if (currentPingSendTime == -1)
        sendPing(performance.now());
}

// a busy loop for when paused
// TODO: Refactor, this is doing too much and has too many parameters
function pauseLoop(waitOn, reportContinue=true, handleEvents=true, waitUntil=-1, customWaitFunction=null, sleepTime=null) {
    if (waitOn == "continue")
        normalPaused = true;
    let paused = true;
    let pauseStart = performance.now();
    while (paused) {
        let programEvents = fetchEvents();
        if (handleEvents) {
            programEvents.forEach(handleEvent);
        }

        if (customWaitFunction) {
            paused = customWaitFunction(programEvents);
        }
        else if (waitOn){
            for (let i = 0; i < programEvents.length; i ++) {
                if (programEvents[i][0] == waitOn) {
                    lastKeepAlive = performance.now();
                    paused = false;
                }
            }
        }

        if (waitUntil > 0 && performance.now() >= waitUntil){
            paused = false;
        }
        // Sleep for sleepTime once paused for longer than sleepTime*10  (heuristically chosen)
        if (sleepTime && (performance.now() - pauseStart) > sleepTime*10)
            sleep(sleepTime);
    }
    if (waitOn == "continue")
        normalPaused = false;

    if (reportContinue)
        postCustomMessage({
            type: "ProgramContinued"
        });
}

// FS Event Forwarding
function postFSEvent(data){
    postCustomMessage({type:"FS", message:data});
}

// TODO: de-duplicate this code and the code in executionEnvironment_Internal.js
moduleEvents.addEventListener("onRuntimeInitialized", function() {
    // Attach to file system callbacks
    FSEvents.addEventListener('onMovePath', function(e) {
        postFSEvent({type: "onMovePath", oldPath: e.oldPath, newPath: e.newPath});
    });
    FSEvents.addEventListener('onMakeDirectory', function(e) {
        postFSEvent({type: "onMakeDirectory", path: e.path});
    });
    FSEvents.addEventListener('onDeletePath', function(e) {
        postFSEvent({type: "onDeletePath", path: e.path});
    });
    FSEvents.addEventListener('onOpenFile', function(e) {
        if ((e.flags & 64)==0)
            return;

        postFSEvent({type: "onOpenFile", path: e.path});
    });
});

// Audio
let lastAudioEmitTime = 0;
let audioEventBuffer = null;
let globalScriptProcessorNode = null;

// initialize global script processor
function setGlobalScriptProcessor(bufferSize, numberOfInputChannels, numberOfOutputChannels, node) {
    if (numberOfOutputChannels != 2) {
        console.error("Unexpected number of output channels: ", numberOfOutputChannels);
        return;
    }

    globalScriptProcessorNode = node;
    globalScriptProcessorNode.bufferSize = bufferSize;

    // initialize storage
    audioEventBuffer = {
        outputBuffer : {
            numberOfChannels: 2,
            channelBuffers: [new Float32Array(bufferSize), new Float32Array(bufferSize)],
            getChannelData : function(channel){
                return this.channelBuffers[channel]
            },
        },
    };

    // now that we know the buffer size, let the main page know
    postCustomMessage({
        type: "InitializeAudioBuffer",
        bufferSize: bufferSize,
    });
}

function emitAudio(now) {
    // if first run, or too much time has passed, reset ourselves
    if (lastAudioEmitTime==0 || (now - lastAudioEmitTime)>500)lastAudioEmitTime = now;

    if (globalScriptProcessorNode != null) {

        // how much time passes in the audio buffer sent by one emission
        let msPerAudioBufferSize = (globalScriptProcessorNode.bufferSize / AudioContextExt.sampleRate)*1000;

        // loop until caught up
        for(; lastAudioEmitTime <= now; lastAudioEmitTime += msPerAudioBufferSize) {
            // process audio and send to main page
            globalScriptProcessorNode.onaudioprocess(audioEventBuffer);
            postCustomMessage({
                type: "Audio",
                channelBuffers: audioEventBuffer.outputBuffer.channelBuffers,
            });
        }
    }
}

// ensure we're up to date on events before runnning.
// this way, even if the user's program never calls
// process_events(), we'll still have processed all the
// file commands at least.
Module['onRuntimeInitialized'] = function() {
    moduleEvents.dispatchEvent(new Event("onRuntimeInitialized"));

    __sko_process_events();
}

// setup user program exit event
Module['noExitRuntime'] = false;
Module['onExit'] = function() {
    postCustomMessage({
        type: "ProgramEnded"
    });
}

let inputBuffer = new Array(0);
let inputBufferWasFull = false;

// forces buffered output (e.g write("...") , no newline) to be printed
function syncStdOut(){
    // Refered to SplashKitBackendWASMCPP.worker.js
    // FS.makedev(5, 0) gives the ID for stdin/stdout, found in createDefaultDevices (makedev just computes an ID, doesn't actually make a device)
    // TTY.default_tty_ops.put_char only outputs when (val === null || val === 10)
    // fsync forces buffer output
    Module['TTY'].default_tty_ops.fsync(Module['TTY'].ttys[Module['FS'].makedev(5, 0)]);
}

Module['stdin'] = function() {
    if (inputBuffer.length == 0) {
        syncStdOut();

        postCustomMessage({ type: "stdinAwait" });

        pauseLoop('stdin', false, true);
    }

    let character = inputBuffer.splice(0, 1);

    return character[0];
}

// attach to detect opening a window
Module['preInit'] = function (){
    let x = Module["GL"].createContext;
    Module["GL"].createContext = function(...args){
        postCustomMessage({ type: "windowOpen" });
        return x(...args);
    }
}

// Debugging
let runtimeOptions = null;
let lastLine;

function __output_debugger_message__(line, strPtr){
    let text = Module['UTF8ToString'](strPtr);
    __sko_debugger_message(line, JSON.parse(text));
}

const BREAK_YES = 1;
const BREAK_NO = 0;
const BREAK_NO_BUFFER = -1;
let debugger_buffer = [];

function __sko_debugger_message(line, data){
    if (data.break != BREAK_NO_BUFFER){
        debugger_buffer.push(data);

        postCustomMessage({
            type: "DebuggerMessage",
            data: debugger_buffer,
        });
        debugger_buffer = [];
    }
    else{
        debugger_buffer.push(data);
    }

    if (!runtimeOptions || (runtimeOptions.enableSingleStepping && data.break == BREAK_YES)) {
        syncStdOut();
        postCustomMessage({
            type: "ProgramPaused"
        });
        pauseLoop('continue', true,true, -1, null, sleepTime=100);
    } else {
        if (
            runtimeOptions &&
            !runtimeOptions.enableSingleStepping &&
            runtimeOptions.forceStepLineHighlighting &&
            (runtimeOptions.forceStepLineHighlightingInner || data.event != "EXPRINNER") &&
            data.break == BREAK_YES
        ) {
            sleep(runtimeOptions.stepLineHighlightingDelay);
            __sko_process_events();
        }
    }
    lastLine = line;
}

Module.onCustomMessage = function(message){
    let data = message.data.userData;
    switch (data.event){
        case "updateRuntimeOptions":
            runtimeOptions = data.runtimeOptions;
            break;
        default:
            throw new Error("Unexpected custom message in workerEventProcessor.js: " + JSON.stringify(data));
    }
}
