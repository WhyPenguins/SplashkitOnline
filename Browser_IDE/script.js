var editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
    mode: "text/javascript",
    theme: "dracula",
    lineNumbers: true,
    autoCloseBrackets: true,
})

var width = window.innerWidth
var input = document.getElementById("input")
var output = document.getElementById("output")
var run = document.getElementById("run")
editor.setSize(0.7 * width, "500")

var option = document.getElementById("inlineFormSelectPref")

option.addEventListener("change", function () {
    if (option.value == "Javascript") {
        editor.setOption("mode", "text/javascript")
    }
})

// Sherap's work starts here
// Modified by Sean
var code;

run.addEventListener("click", async function () {
    code = {
        code: editor.getValue(),
        input: input.value,
        lang: option.value
    }
    console.log(code)
    /*var oData = await fetch("http://localhost:8000/compile", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(code)
    })
    var d = await oData.json()
    output.value = d.output
    console.log(d.output);*/
	eval(code.code);
})
// Sherap's work ends here

