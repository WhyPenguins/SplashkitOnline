"use strict";

// global object that can be used to configure the IDE

let SKO = (function(){
    let page_url = new URL(window.location.href);

    // parse raw parameters as well
    var parsedRawParams = {};
    // just remove the ?, split by &, then split by = and assign each piece
    page_url.search.slice(1).split("&").forEach(function(param){
        var pieces = param.split("=");
        parsedRawParams[pieces[0]] = pieces[1];
    });

    function getEnvParam(paramName, _default=null, decode=true){
        if (decode)
            return page_url.searchParams.get(paramName) ?? _default;
        else
            return parsedRawParams[paramName] ?? _default;
    }

    function ensureNumber(param, _default){
        if (param == "")
            return _default;
        param = Number(param);
        if (Number.isNaN(param))
            return _default;
        return param;
    }

    let isPreview =   (page_url.pathname.indexOf("/pr-previews/") >= 0)
                   || (page_url.pathname.indexOf("/branch-previews/") >= 0);

    // I feel like there might be too many here, perhaps they can be rationalized better?
    // ^ I agree
    return {
        language: getEnvParam("language", "C++", false), /*don't decode, so + remains + rather than a space*/
        initializeProjectName: getEnvParam("initializeProjectName"), // ensures a project with this name exists - loads if already exists, otherwise creates
        cleanProject: getEnvParam("cleanProject", "off") == "on", // deleted everything in the project at start
        autoOpenProject: getEnvParam("autoOpenProject", "on", true) == "on", // whether to automatically load a project (for instance the last one opened)
        defaultInitializeProject: getEnvParam("defaultInitializeProject", "on", true) == "on", // whether to initialize created projects with default files/folders, or leave empty
        projectID: getEnvParam("project"), // load this projectID (exclusive of initializeProjectName and defaultInitializeProject)
        useCompressedBinaries: getEnvParam("useCompressedBinaries", "on", true) == "on",
        useMinifiedInterface: getEnvParam("useMinifiedInterface") == "on",
        useEmbeddedInterface: getEnvParam("useEmbeddedInterface") == "on",
        theme: getEnvParam("theme", "dracula"),
        enableDebugging: getEnvParam("enableDebugging") == "on",
        enableSingleStepping: getEnvParam("enableSingleStepping") == "on",
        forceStepLineHighlighting: getEnvParam("forceStepLineHighlighting") == "on",
        forceStepLineHighlightingInner: getEnvParam("forceStepLineHighlightingInner") == "on",
        stepLineHighlightingDelay: ensureNumber(getEnvParam("stepLineHighlightingDelay", "50"), 50),
        handExecutionMode: getEnvParam("handExecutionMode", ""),//"", faithful, clean, realtime
        handExecutionWidth: ensureNumber(getEnvParam("handExecutionWidth", ""), 550),
        handExecutionHeight: ensureNumber(getEnvParam("handExecutionHeight", ""), 300),
        isPRPreview: getEnvParam("isPRPreview", isPreview ? "on" : "off") == "on",
    };
})();
