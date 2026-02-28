// IDE specific action queues

let IDECoreInitQueue = new ActionQueue("IDECoreInitQueue", {
    cancelRunning: false,
    replaceQueued: true,
    maxQueued: 1,
    waitOn: [],
});

// These three execute in parallel, after IDECoreInitQueue has cleared
let CompilerInitQueue = new ActionQueue("CompilerInitQueue", {
    cancelRunning: false,
    replaceQueued: true,
    maxQueued: 1,
    waitOn: [IDECoreInitQueue],
});
let ExecutionEnvironmentLoadQueue = new ActionQueue("ExecutionEnvironmentLoadQueue", {
    cancelRunning: false,
    replaceQueued: true,
    maxQueued: 1,
    waitOn: [IDECoreInitQueue],
});
let InitializeProjectQueue = new ActionQueue("InitializeProjectQueue", {
    cancelRunning: true,
    replaceQueued: true,
    maxQueued: 1,
    waitOn: [IDECoreInitQueue],
});

// These cancel if the project is re-initialized/loaded
// Can have multipled scheduled - they don't cancel eachother out'
/* Note: ImportToProjectQueue actions use the UnifiedFS - so they write to both the
         project FS and the transient FS in the ExecutableEnvironment.
         We mirror inbetween 'Init'ing the project, and Loading data into it.
*/
let MirrorProjectQueue = new ActionQueue("MirrorProjectQueue", {
    cancelRunning: true,
    replaceQueued: true,
    maxQueued: 1,
    waitOn: [InitializeProjectQueue],
    cancelOn: [InitializeProjectQueue],
});
let ImportToProjectQueue = new ActionQueue("ImportToProjectQueue", {
    cancelRunning: false,
    replaceQueued: false,
    maxQueued: 100,
    waitOn: [ExecutionEnvironmentLoadQueue, InitializeProjectQueue, MirrorProjectQueue],
    cancelOn: [InitializeProjectQueue],
});

// This only executes if everything has loaded, and cancels if another project is loaded
let LanguageSwitchAfterLoadQueue = new ActionQueue("LanguageSwitchAfterLoadQueue", {
    cancelRunning: true,
    replaceQueued: true,
    maxQueued: 1,
    waitOn: [ImportToProjectQueue, InitializeProjectQueue],
    cancelOn: [InitializeProjectQueue],
});

// TODO: This only executes if everything has loaded, and cancels if another project is loaded
let CompileQueue = new ActionQueue("CompileQueue", {
    cancelRunning: true,
    replaceQueued: true,
    maxQueued: 1,
    waitOn: [CompilerInitQueue, InitializeProjectQueue, ExecutionEnvironmentLoadQueue],
    cancelOn: [InitializeProjectQueue],
});

// Whenever both execution environment and load project queue clear, mirror the project
ActionQueue.OnClear([ExecutionEnvironmentLoadQueue, InitializeProjectQueue], async function(){
    MirrorProjectQueue.Schedule("Mirror", async function(){
        // mirror project once execution environment +
        // project are ready
        await mirrorProject();
    });
});

// Update execution state whenever these queues clear
[
    InitializeProjectQueue,
    MirrorProjectQueue,
    ImportToProjectQueue,
    CompilerInitQueue,
    ExecutionEnvironmentLoadQueue,
].forEach(queue => ActionQueue.OnClear([queue], updateCodeExecutionState));


let startupTimeStart = performance.now();
let startupTime = null;

// Once the IDE is practically ready for execution, record the time and send it as analytics along with other metadata
ActionQueue.OnClear([ExecutionEnvironmentLoadQueue, InitializeProjectQueue, ImportToProjectQueue, CompilerInitQueue], async function(){
    if (startupTime != null)
        return;

    startupTime = performance.now() - startupTimeStart;

    // spin this off so it doesn't block anything
    (async function () {

    if (analytics) {
        let autoCreatedCount = null;
        let manuallyCreatedCount = null;
        if (!IDECriticalStorageFail){
            try {
                // return just a count of auto-created projects so we have an idea of how often people continue using embedded SKO or if they stop...
                let projects = await appStorage.access(async (s) => {
                    return await s.getAllProjects();
                });

                autoCreatedCount = 0;
                manuallyCreatedCount = 0;
                for (let project of projects) {
                    if (project.name.indexOf(".") == 0)
                        autoCreatedCount++;
                    else
                        manuallyCreatedCount++;
                }
            }
            catch(err){
                console.warn("Analytics failed: ", err);
            }
        }

        analytics.sendEvent("startupMeta", {
            startupTime,
            autoCreatedCount,
            hasManuallyCreated: manuallyCreatedCount == null ? null : (manuallyCreatedCount > 2)
        })
    }

    })();
});

// TODO: refactor this so that it's clearer where each
//       global variable is initialized/setup (should they be
//       global in the first place? Probably not...)
async function StartIDE() {
    IDECoreInitQueue.Schedule("IDECoreInit", async function IDECoreInitQueue (isCanceled){
        // Analytics setup
        try {
            // analytics is defined globally in editorMain
            analytics = new SimpleAnalytics(SKO.initializeProjectName);
        }
        catch(err){
            console.error(err);
        }

        // Interface setup
        createGutterSplitters();
        setupLanguageSelectionBox();
        setupIDEButtonEvents();

        // Create execution environment and project storage objects
        // These constructors don't _do_ anything important.
        executionEnviroment = new ExecutionEnvironment(document.getElementById("ExecutionEnvironment"));
        appStorage = new AppStorage();
        storedProject = new IDBStoredProject(null);
        unifiedFS = new UnifiedFS(storedProject, executionEnviroment);

        // Setup callbacks/listeners
        addErrorEventListeners();
        setupProgramExecutionEvents();
        disableCodeExecution();

        setupProjectConflictAndConfirmationModals();
        setupCodeEditorCallbacks();
        setupFilePanelAndEvents();

        setupMinifiedInterface();
    });

    if (SKO.autoOpenProject) {
        InitializeProjectQueue.Schedule("LoadProjectInit", async function InitializeProjectQueue (isCanceled){
            await isCanceled();

            try {
                await appStorage.attach();

                // find/create the project
                let projectID = null;

                // if loading/creating by name
                if (SKO.initializeProjectName){
                    let project = await appStorage.getProjectByName(SKO.initializeProjectName);

                    if (SKO.cleanProject && project){
                        await appStorage.access((s) => s.deleteProject(project.id));
                        await storedProject.deleteProject(project.id);
                        project = null;
                    }

                    if (!project) {
                        projectID = await appStorage.createProject(SKO.initializeProjectName, SKO.language);

                        if (analytics)
                            analytics.initSession({type:"create"});

                        if (!projectID) {
                            throw new Error("!projectID from SKO.initializeProjectName");
                        }
                    }
                    else {
                        projectID = project.id;

                        if (analytics)
                            analytics.initSession({type:"load"});
                    }
                }
                // if loading by ID
                else if (SKO.projectID){
                    projectID = SKO.projectID;

                    if (analytics)
                        analytics.initSession({type:"load"});
                }
                // otherwise load last open project, or create if first run
                else {
                    projectID = await appStorage.access(async (s)=>{
                        return s.getLastOpenProject();
                    })

                    // check if it still exists
                    let project = null;
                    if (projectID) {
                        project = await appStorage.getProject(projectID);

                        if (analytics)
                            analytics.initSession({type:"loadLast"});
                    }

                    if (!project) {
                        projectID = await appStorage.createProject(undefined, SKO.language);

                        if (analytics)
                            analytics.initSession({type:"create"});

                        if (!projectID) {
                            throw new Error("!projectID from end");
                        }
                    }
                }
                // Load and initialize it!
                if (!IDECriticalStorageFail)
                    await LoadProject(projectID, SKO.defaultInitializeProject ? null : function(){}, isCanceled);
            }
            catch(err) {
                IDECriticalStorageFail = true;
                reportCriticalError("Failed to load or create project - out of storage space?", err.toString(), err);
                return;
            }
        });
    }

    AddWindowListeners();

    // Focus the window, this is used in order to detect if the user clicks inside the iFrame containing the program
    window.focus();
}

StartIDE();
