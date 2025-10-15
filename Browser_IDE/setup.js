/*
    NOTE: MAINTAIN PARITY WITH /Browser_IDE/setup.py
*/

const request = require('request');
const fs = require('fs');
const extract = require('extract-zip');
const path = require('path');

class RequiredFile {
    constructor(repoPath, src, dst, onDownload = async () => {}){
        this.repoPath = repoPath;
        this.src = src;
        this.dst = dst;
        this.onDownload = onDownload;
    }

    async download(){
        console.log("Downloading " + this.src + "...");

        const dstFilePath = this.dst + "/" + path.basename(this.src);
        let file = fs.createWriteStream(dstFilePath);

        let requestPromise = new Promise((resolve, reject) => {
            let req = request(this.repoPath + this.src);
            req.pipe(file);
            file.on('finish', () => {
                resolve();
            });
            file.on('error', () => {
                reject();
            });
        });

        await requestPromise;

        await this.onDownload();

        let closePromise = new Promise((resolve, reject) => {
            file.close((err) => {
                if(err != null) reject();
                resolve();
            });
        });

        await closePromise;

    }
}

const splashKitOnlinePath = "https://whypenguins.github.io/SplashkitOnline/"
const clangWasmPath = "https://github.com/WhyPenguins/splashkit-online-clang-wasm/"

const jsRuntimeDir = "runtimes/javascript/bin"
const cxxCompilerDir = "compilers/cxx/bin"
const cxxRuntimeDir = "runtimes/cxx/bin"

const requiredFiles = [
    // Language-agnostic files
    new RequiredFile(splashKitOnlinePath, "splashkit/splashkit_autocomplete.json", "splashkit"),
    
    // JS files
    new RequiredFile(splashKitOnlinePath, "runtimes/javascript/bin/SplashKitBackendWASM.js", jsRuntimeDir),
    new RequiredFile(splashKitOnlinePath, "runtimes/javascript/bin/SplashKitBackendWASM.wasm", jsRuntimeDir),

    // C++ files
    new RequiredFile(clangWasmPath, "releases/download/release%2Fmain/release.zip", cxxCompilerDir, async () => {
        // Unpack and delete release.zip
        console.log("Extracting " + cxxCompilerDir + "/release.zip" + "...");
        await extract(cxxCompilerDir + "/release.zip", {dir: path.resolve(cxxCompilerDir)});
        fs.unlinkSync(cxxCompilerDir + "/release.zip");
        console.log("Extracted " + cxxCompilerDir + "/release.zip");
    }),
    new RequiredFile(splashKitOnlinePath, "compilers/cxx/bin/wasi-sysroot.zip.lzma", cxxCompilerDir),
    new RequiredFile(splashKitOnlinePath, "runtimes/cxx/bin/SplashKitBackendWASMCPP.js", cxxRuntimeDir),
    new RequiredFile(splashKitOnlinePath, "runtimes/cxx/bin/SplashKitBackendWASMCPP.worker.js", cxxRuntimeDir)
];

exports.run = async function(){

    let alreadyExists = requiredFiles.filter((reqFile) => {
        return fs.existsSync(reqFile.dst + "/" + path.basename(reqFile.src));
    });

    if(alreadyExists.length > 0){
        return;
    }

    console.log("Setting up SplashKit Online pre-built dependencies...");

    await Promise.all(requiredFiles.map((reqFile) => {
        return (async () => {
            await reqFile.download();
        })();
    }));

    console.log("SplashKit Online setup complete!");
}
