import { dotnet } from './wwwroot/_framework/dotnet.js';

const loadDotNet = async () => {
    const { setModuleImports, getAssemblyExports, getConfig } = await dotnet
        .withDiagnosticTracing(false)
        .withApplicationArgumentsFromQuery()
        .create();

    setModuleImports('main.js', {
        window: {
            location: {
                href: () => globalThis.window.location.href
            }
        },
        SplashKitBackendWASM: {
            write_line,
            refresh_screen,
            open_window,
            fill_ellipse: () => {
                // Research how to declare a JS object in C#
                fill_ellipse(color_black(), 260, 260, 200, 200);
            }
        }
    });

    const config = getConfig();
    const exports = await getAssemblyExports(config.mainAssemblyName);
    return exports;
};

const CompileAndRun = async (code) => {
    try {
        const exports = await loadDotNet();
        const result = await exports.CSharpCodeRunner.CompileAndRun(code);
        const outputElement = document.querySelector('#output');
        outputElement.textContent = result;
    } catch (error) {
        console.error('Error during code execution:', error);
    }
};

const runButton = document.querySelector('#run');
const textArea = document.querySelector('#code');
runButton.addEventListener('click', () => CompileAndRun(textArea.value));

document.addEventListener("compileAndRun", (ev) => {
    CompileAndRun(ev.detail.program[0].source);
});
