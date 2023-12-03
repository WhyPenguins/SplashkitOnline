"use strict";
let myTreeView = new TreeView(document.getElementById("fileView"), {"persistent":"node-persistent", "transient":"node-transient"});


// Attach callbacks for treeview GUI
myTreeView.addEventListener("nodeMoveRequest", function(e){
    if (e.FS.includes("transient"))
        executionEnviroment.rename(e.oldPath, e.newPath);
    if (e.FS.includes("persistent"))
        storedProject.rename(e.oldPath, e.newPath);
});

myTreeView.addEventListener("nodeDoubleClick", function(e){
    if (e.FS.includes("persistent"))
        FSviewFile(e.path,"text/plain");
});

myTreeView.addEventListener("folderUploadRequest", function(e){
    document.getElementById("fileuploader").dataset.uploadDirectory = e.path;
    document.getElementById("fileuploader").click();
});


// Attach to file system callbacks within the Execution Environment
executionEnviroment.addEventListener('onMovePath', function(e) {
    myTreeView.moveNode(e.oldPath, e.newPath, -1, "transient");
});

executionEnviroment.addEventListener('onMakeDirectory', function(e) {
    myTreeView.addDirectory(e.path, "transient");
});

executionEnviroment.addEventListener('onDeletePath', function(e) {
    myTreeView.deleteNode(e.path, "transient");
});

executionEnviroment.addEventListener('onOpenFile', function(e) {
    myTreeView.addFile(e.path, "transient");
});

// Attach to file system callbacks within the IDBStoredProject
storedProject.addEventListener('onMovePath', function(e) {
    //TODO: Get moving to specific index working again - ideally make it persistent as well
    myTreeView.moveNode(e.oldPath, e.newPath, -1, "persistent");
});

storedProject.addEventListener('onMakeDirectory', function(e) {
    myTreeView.addDirectory(e.path, "persistent");
});

storedProject.addEventListener('onDeletePath', function(e) {
    myTreeView.deleteNode(e.path, "persistent");
});

storedProject.addEventListener('onOpenFile', function(e) {
    myTreeView.addFile(e.path, "persistent");
});


storedProject.addEventListener("initialized", async function() {
    let fileTree = await storedProject.getFileTree();
    myTreeView.populatefileView(fileTree, "persistent");
});

storedProject.addEventListener("detached", function() {
    myTreeView.reset();
});