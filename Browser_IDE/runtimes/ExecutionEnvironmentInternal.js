"use strict";

let userCodeBlockIdentifier = "__USERCODE__";

// Base class for all Execution Environments
class ExecutionEnvironmentInternal {
    constructor(listenOn) {
        const self = this;

        // ------ Message Listening ------
        this.channel = new PromiseChannel(listenOn, parent);
        // --- FS Handling ---
        this.channel.setEventListener("mkdir", async function (data){
            await self.mkdir(data.path);
        });
        this.channel.setEventListener("writeFile", async function (data){
            await self.writeFile(data.path, data.data);
        });
        this.channel.setEventListener("rename", async function (data){
            await self.rename(data.oldPath, data.newPath);
        });
        this.channel.setEventListener("rmdir", async function (data){
            await self.rmdir(data.path, data.recursive);
        });
        this.channel.setEventListener("unlink", async function (data){
            await self.unlink(data.path);
        });

        // --- Code Execution Functions ---
        this.channel.setEventListener("CleanEnvironment", async function (data){
            await self.resetExecutionScope();
        });
        this.channel.setEventListener("HotReloadFile", async function (data){
            self.hotReloadFile(data.name, data.code);
        });
        this.channel.setEventListener("ReportError", async function (data){
            self.ReportError(userCodeBlockIdentifier + data.block, data.message, data.line, data.stackTrace, data.formatted);
        });
        this.channel.setEventListener("WriteToTerminal", async function (data){
            self.WriteToTerminal(data.message);
        });
        this.channel.setEventListener("ClearTerminal", async function (data){
            self.ClearTerminal(data.message);
        });
        this.channel.setEventListener("RunProgram", async function (data){
            await self.runProgram(data.program, data.runtimeOptions);
        });
        this.channel.setEventListener("PauseProgram", async function (data){
            await self.pauseProgram();
        });
        this.channel.setEventListener("ContinueProgram", async function (data){
            await self.continueProgram();
        });
        this.channel.setEventListener("StopProgram", async function (data){
            await self.stopProgram();
        });
        this.channel.setEventListener("UpdateRuntimeOptions", async function (data){
            await self.updateRuntimeOptions(data.runtimeOptions);
        });
    }

    signalReady() { parent.postMessage({type:"initialized"},"*"); }
    signalStarted() { parent.postMessage({type:"programStarted"},"*"); }
    signalStopped() { parent.postMessage({type:"programStopped"},"*"); }
    signalPaused()  { parent.postMessage({type:"programPaused"},"*"); }
    signalContinue(){ parent.postMessage({type:"programContinued"},"*"); }

    sendProgram(program)                      { throw new Error("Unhandled sendProgram");}
    hotReloadFile(name, code)                 { throw new Error("Unhandled hotReloadFile");}
    resetExecutionScope()                     { throw new Error("Unhandled resetExecutionScope");}
    async runProgram(program, runtimeOptions) { throw new Error("Unhandled runProgram");}
    async pauseProgram()                      { throw new Error("Unhandled pauseProgram");}
    async continueProgram()                   { throw new Error("Unhandled continueProgram");}
    async stopProgram()                       { throw new Error("Unhandled stopProgram");}
    async mkdir(path)                         { throw new Error("Unhandled mkdir");}
    async rmdir(path, recursive)              { throw new Error("Unhandled rmdir");}
    async writeFile(path, data)               { throw new Error("Unhandled writeFile");}
    async unlink(path)                        { throw new Error("Unhandled unlink");}
    async rename(oldPath, newPath)            { throw new Error("Unhandled rename");}
    async initializeFilesystem(folders, files){ throw new Error("Unhandled initializeFilesystem");}
    async updateRuntimeOptions(runtimeOptions){ throw new Error("Unhandled updateRuntimeOptions");}

    ReportError(block, message, line,stackTrace, formatted) {
        ReportError(block, message, line,stackTrace, formatted); // call external function
    }

    reportCriticalInitializationFail(message) {
        parent.postMessage({type:"onCriticalInitializationFail", message:message},"*");
    }

    WriteToTerminal(message) {
        writeTerminal(message);
        if (handExecutionDrawing) {
            handExecutionDrawing.print(message);
        }
    }

    ClearTerminal(message) {
        clearTerminal();
    }

    ClearCanvas(){
        let canvas = document.getElementById("canvas");
        canvas.width = "0";
        canvas.height = "0";
    }

    InputFromTerminal(message) { throw new Error("Unhandled InputFromTerminal"); }

    Reload() {
        parent.postMessage({type:"executionEnvironmentReloadRequest"},"*");
    }

    GetFilesystem() {
        parent.postMessage({type:"executionEnvironmentGetFilesystemRequest"},"*");
    }

    UpdateRuntimeOptionsBase(runtimeOptions) {
        if (runtimeOptions.showHandExecution) {
            let ops = runtimeOptions.handExecutionSettings;

            if (!handExecutionDrawing) {
                handExecutionDrawing = new HandExecutionDrawing({
                    valueMode: ops.modes.valueMode,
                    stackMode: ops.modes.stackMode,
                    heapMode: ops.modes.heapMode,
                    width: ops.width,
                    height: ops.height,
                });
                document.getElementById("canvasContainer").appendChild(handExecutionDrawing.container);
                showCanvas(false);
            }

            handExecutionDrawing.valueMode = ops.modes.valueMode;
            handExecutionDrawing.stackMode = ops.modes.stackMode;
            handExecutionDrawing.heapMode = ops.modes.heapMode;
            handExecutionDrawing.width.transition(ops.width);
            handExecutionDrawing.height.transition(ops.height);
        }
        else if (!runtimeOptions.showHandExecution && handExecutionDrawing) {
            handExecutionDrawing.container.remove();
            handExecutionDrawing = null;
        }

        this.runtimeOptions = runtimeOptions;
    }

    RunProgramBase(){
        unlockOutputViewerSwitch();
        if (SKO.useEmbeddedInterface)
            clearTerminal();

        if (handExecutionDrawing) {
            handExecutionDrawing.initialize();
            this.PreferCanvas();
        }
    }

    PreferCanvas() {
        showCanvas(true);
    }

    PreferTerminal() {
        // The terminal output is shown on the
        // hand execution anyway, so redirect there
        if (handExecutionDrawing) {
            this.PreferCanvas();
            return;
        }

        showTerminal(true);
    }

    DebuggerMessage(data){
        if (this.runtimeOptions.enableSingleStepping || this.runtimeOptions.forceStepLineHighlighting)
            executionEnvironment.channel.postMessage("highlightCurrentLine", {filename: data.file, line: data.line, charStart: data.charStart, charEnd: data.charEnd});

        if (!handExecutionDrawing)
            return;

        let loc = [data.line, data.charStart, data.charEnd];

        if (data.event == "DECL"){
            let updateMemory = data.val.length == 0 || data.val[0] != "PreventUpdate";
            handExecutionDrawing.allocateVariable(data.structure, updateMemory?data.val:[], updateMemory);
        }
        if (data.event == "ASSIGN"){
            handExecutionDrawing.updateValues(data.val);
        }
        if (data.event == "DESTRUCT"){
            handExecutionDrawing.freeMemory(data.val);
        }
    }
}
