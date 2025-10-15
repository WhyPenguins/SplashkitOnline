#
#   NOTE: ENSURE /Browser_IDE/setup.js MAINTAINS PARITY
#

import zipfile
import urllib.request
import os

splashKitOnlinePath = "https://whypenguins.github.io/SplashkitOnline/"
clangWasmPath = "https://github.com/WhyPenguins/splashkit-online-clang-wasm/"

js_runtime_dir = "./runtimes/javascript/bin/"
cxx_compiler_dir = "./compilers/cxx/bin/"
cxx_runtime_dir = "./runtimes/cxx/bin/"

def download(repo_path, src, dst):
    print("Downloading " + src + "...")
    urllib.request.urlretrieve(repo_path + src, dst + os.path.basename(src))

# Language-agnostic files
download(splashKitOnlinePath, "splashkit/splashkit_autocomplete.json", "./splashkit/")

# JS files
download(splashKitOnlinePath, "runtimes/javascript/bin/SplashKitBackendWASM.js", js_runtime_dir)
download(splashKitOnlinePath, "runtimes/javascript/bin/SplashKitBackendWASM.wasm", js_runtime_dir)

# C++ files
download(clangWasmPath, "releases/download/release%2Fmain/release.zip", cxx_compiler_dir)
download(splashKitOnlinePath, "compilers/cxx/bin/wasi-sysroot.zip", cxx_compiler_dir)
download(splashKitOnlinePath, "runtimes/cxx/bin/SplashKitBackendWASMCPP.js", cxx_runtime_dir)
download(splashKitOnlinePath, "runtimes/cxx/bin/SplashKitBackendWASMCPP.worker.js", cxx_runtime_dir)

# Unpack and delete compiler.zip
print("Extracting " + cxx_compiler_dir + "compiler.zip" + "...")
with zipfile.ZipFile(cxx_compiler_dir + "compiler.zip", 'r') as zip:
    zip.extractall(cxx_compiler_dir)
os.remove(cxx_compiler_dir + "compiler.zip")
