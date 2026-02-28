// Written by a human, tidied by GLM 5 :)

// Cache of the debug macros file
let debugMacros = null;

// --- Utility Functions (Pure Logic) ---

// Parses Clang AST output (which may be multiple JSON objects) into a single array
function parseASTFromOutput(stdout) {
    stdout = stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}")+1);
    stdout.splice(0,0,"[");
    for(let i = 0; i < stdout.length ; i++){
        if (i < stdout.length && stdout[i] == "}" && stdout[i+1] == "{"){
            stdout.splice(i+1,0,",");
        }
    }
    stdout.push("]");
    return JSON.parse(stdout.join(""));
}

// Wraps code segments in USERCODE namespace to filter the AST
function wrapSourceInNamespace(sourceCode) {
    // TODO: Remove the regex, is brittle
    const pattern = /(?<!\/\*(?:.(?!\*\/))*)((#include[^\n]*\n|^)+)(.*?(?=(?:\/\/|\/\*)[^\n]*\n#include|\n#include|$))/gs;
    const namespacePrefix = "namespace USERCODE{";
    const namespaceSuffix = "}/*USERCODE*/";

    return sourceCode.replace(pattern, (match, p1, p2, p3) => {
        return p1 + namespacePrefix + p3 + namespaceSuffix;
    });
}

// Type parsing helpers
function extractBaseType(type) {
    let depth = 0;
    for (let i = 0; i < type.length; i++) {
        const c = type[i];
        if (/\w/.test(c)) continue;
        else if ("<[({".includes(c)) depth++;
        else if (">])}".includes(c)) depth--;
        else if (depth === 0) return type.slice(0, i);
    }
    return type;
}

/**
* Counts the number of **outermost array layers** in a C/C++ declarator.
* Works with pointers, parentheses, function pointers, etc.
*/
function countOuterArrayLayers(type) {
    type = type.trim();
    type = type.slice(extractBaseType(type));
    let count = 0;
    for (let i = 0; i < type.length; i++) {
        const c = type[i];
        if (/\w/.test(c)) continue;
        else if (c === '(') count = 0;
        else if (c === '[') count++;
        else if (c === ')') return count;
    }
    return count;
}

// Checks if an array initialization is empty and finds the relevant node for injection
function analyzeArrayInitialization(varDecl, arrayLevels) {
    let isEmpty = true;
    let currentNode = varDecl;

    for(let i = 0; i <= arrayLevels; i++) {
        let inner = currentNode.inner ?? currentNode.array_filler.slice(1);

        for (let x of inner) {
            if (x.kind == "ImplicitValueInitExpr" || x.kind == "CXXConstructExpr") continue;
            if (x.kind == "ExprWithCleanups") {
                i--;
                currentNode = x;
                break;
            }
            else if (x.kind == "InitListExpr") {
                currentNode = x;
                if (i == arrayLevels) isEmpty = false;
                break;
            }
            else {
                // Found a non-empty, non-list element
                return { isEmpty: false, targetNode: x };
            }
        }
    }
    return { isEmpty, targetNode: currentNode };
}

// String counting utility
function count(string, substr) {
    return string.split(substr).length - 1;
}

// --- Source Editor Class ---
class SourceEditor {
    constructor(source, lineOffset) {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();

        // Store source as Uint8Array
        this.source = this.encoder.encode(source);

        this.changes = []; // Stores [original_offset, byte_delta]

        this.originalSource = this.encoder.encode(source);
        this.prefixBytes = this.encoder.encode("namespace USERCODE{");
        this.lineOffset = lineOffset;
    }

    getResult() {
        return this.decoder.decode(this.source);
    }

    // Remaps an original UTF-8 offset to the current offset in the modified buffer
    reposition(x) {
        let pos = x;
        for (let change of this.changes) {
            // If the original offset is after (or at) a change, shift it by the delta
            if (x >= change[0])
                pos += change[1];
        }
        return pos;
    }

    // Helper to perform the insertion/deletion on the Uint8Array
    _spliceBytes(index, count, addBytes) {
        // Handle negative indices similar to standard splice/slice
        if (index < 0) {
            index = this.source.length + index;
            if (index < 0) index = 0;
        }

        const addLen = addBytes ? addBytes.length : 0;
        const newLength = this.source.length - count + addLen;
        const result = new Uint8Array(newLength);

        // Copy the part before the edit
        result.set(this.source.subarray(0, index));

        // Copy the inserted bytes (if any)
        if (addLen > 0) {
            result.set(addBytes, index);
        }

        // Copy the remaining part after the deleted section
        result.set(this.source.subarray(index + count), index + addLen);

        return result;
    }

    insert(x, str, erase = 0) {
        // Convert the string to be inserted to bytes immediately
        const insertBytes = this.encoder.encode(str);

        // Perform the edit at the remapped position
        this.source = this._spliceBytes(this.reposition(x), erase, insertBytes);

        // Record the change: [original_offset, byte_length_delta]
        this.changes.push([x, insertBytes.length - erase]);
    }

    select(start, end) {
        // Decode the selected byte range back into a string
        const startIdx = this.reposition(start);
        const endIdx = this.reposition(end);
        return this.decoder.decode(this.source.subarray(startIdx, endIdx));
    }

    // Calculates the SourceSpan using byte offsets.
    calculateSourceSpan(node) {
        if (!node.range) return "(SourceSpan{&__debug_current_filename,0,0,0,0})";
        if (node.range.begin.includedFrom) return null;

        let offsetStart = node.range.begin.offset;
        let offsetEnd = node.range.end.offset + node.range.end.tokLen;

        // Helper: Count occurrences of a byte (10 = '\n') up to a specific offset
        const countLines = (offset) => {
            let lines = 0;
            // subarray creates a view (no copy), iterating it is very fast
            const view = this.originalSource.subarray(0, offset);
            for (let i = 0; i < view.length; i++) {
                if (view[i] === 10) lines++;
            }
            return lines;
        };

        // Helper: Find the last occurrence of a byte (10 = '\n') before an offset
        const lastNewline = (offset) => {
            for (let i = offset - 1; i >= 0; i--) {
                if (this.originalSource[i] === 10) return i;
            }
            return -1;
        };

        let lineStart = countLines(offsetStart);
        let lineEnd = countLines(offsetEnd);

        // Calculate column based on distance from the last newline
        let startOfFirstLine = lastNewline(offsetStart);
        let colStart = offsetStart - startOfFirstLine - 1;

        // Adjust column if namespace injection occurred on this line
        // We check if the prefix exists exactly at index 1 in the byte array
        const namespaceIdx = this._indexOfSequence(this.originalSource, this.prefixBytes, startOfFirstLine);
        if (namespaceIdx === 1) {
            colStart -= this.prefixBytes.length;
        }

        let startOfLastLine = lastNewline(offsetEnd);
        let colEnd = offsetEnd - startOfLastLine - 1;

        return `(SourceSpan{&__debug_current_filename,${lineStart - this.lineOffset},${lineEnd - this.lineOffset},${colStart},${colEnd}})`;
    }

    // Helper to find a byte sequence (needle) in a Uint8Array (haystack) starting at offset
    _indexOfSequence(haystack, needle, offset) {
        const hLen = haystack.length;
        const nLen = needle.length;
        if (nLen === 0) return offset;

        // Naive search is acceptable for short needles like "namespace..."
        for (let i = offset; i <= hLen - nLen; i++) {
            let match = true;
            for (let j = 0; j < nLen; j++) {
                if (haystack[i + j] !== needle[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return i;
        }
        return -1;
    }
}

// --- AST Handlers ---

const astHandlers = {
    "VarDecl": (node, editor, context) => {
        if (node.storageClass == "extern")
            return;

        const { traverse } = context;
        const sourceSpan = editor.calculateSourceSpan(node);

        let arrayLevels = countOuterArrayLayers(node.type.qualType);
        let type = node.name + "[0]".repeat(arrayLevels);

        let noinit = `__TRACE_STACK_DECL_NO_INIT(${sourceSpan}, ${node.name}), (typename std::remove_reference<decltype(${type})>::type)`;
        let init   = `__TRACE_STACK_DECL_INIT(${sourceSpan}, ${node.name}), (typename std::remove_reference<decltype(${type})>::type)`;
        let aftercons = `, *${node.name}_____debug_cons = __TRACE_POST_CONSTRUCTION(${sourceSpan}, ${node.name})`;

        if (node.type.qualType == "const int") {
            noinit = "";
            init = "";
            aftercons = `, *${node.name}_____debug_cons = (__TRACE_STACK_DECL_INIT(${sourceSpan}, ${node.name}), __TRACE_POST_CONSTRUCTION(${sourceSpan}, ${node.name}))`;
        }

        let braceWrap = (x, depth) => (depth < arrayLevels) ? `{${x}}` : x;

        let exception = node.init == "call" && arrayLevels > 0 && node.inner && node.inner[0].kind == "CXXConstructExpr";// TODO: need to reason about this more and integrate it properly

        if (!node.init || exception) {
            let offset = node.range.end.offset + node.range.end.tokLen;
            editor.insert(offset, ` = ${braceWrap(`(${noinit}{})`, 0)}`);
        }
        else if (node.init == "c" || node.init == "list") {
            if (arrayLevels > 0) {
                // Handle Arrays
                const analysis = analyzeArrayInitialization(node, arrayLevels);
                const targetNode = analysis.targetNode;

                let offset = targetNode.range.begin.offset;
                if (analysis.isEmpty) offset += 1;

                editor.insert(offset, `(${init}`);
                if (analysis.isEmpty) editor.insert(offset, "{}");

                let end = targetNode.range.end.offset + targetNode.range.end.tokLen;
                if (analysis.isEmpty) end -= 1;
                editor.insert(end, `)`);

            } else {
                // Handle Non-Arrays
                let offset;
                if (node.init == "list" || node.init == "call")
                    offset = node.loc.offset + node.loc.tokLen;
                else
                    offset = node.inner[0].range.begin.offset;

                if (node.init == "list" || node.init == "call")
                    editor.insert(offset, ` = `);

                editor.insert(offset, `(${init}`);

                (node.inner ?? []).forEach(child => traverse(child, editor, context));

                let end = node.range.end.offset + node.range.end.tokLen;
                editor.insert(end, `)`);
            }
            let end = node.range.end.offset + node.range.end.tokLen;
            editor.insert(end, aftercons);

        } else if (node.init == "call") {
            let implicit = node.loc.offset == node.range.end.offset;
            let offset = node.loc.offset + node.loc.tokLen;
            editor.insert(offset, ` = (${implicit ? noinit : init}`);
            if (implicit) editor.insert(offset, "{}");

            (node.inner ?? []).forEach(child => traverse(child, editor, context));

            let end = node.range.end.offset + node.range.end.tokLen;
            if (!implicit) end += 1;
            editor.insert(end, `)`);
            if (!implicit) editor.insert(end, aftercons);
        }
    },

    // TODO: The array and non-array paths could likely be merged
    "CXXNewExpr": (node, editor, context) => {
        const sourceSpan = editor.calculateSourceSpan(node);

        if (node.isArray) {
            editor.insert(node.range.begin.offset, `(__TRACE_NEW_ARRAY(${sourceSpan}, ${node.initStyle?"true":"false"}, `);
            editor.insert(node.range.begin.offset + node.range.begin.tokLen, `, ${node.type.qualType}, `);
            editor.insert(node.inner[0].range.begin.offset, `,`);
            editor.insert(node.inner[0].range.end.offset + node.inner[0].range.end.tokLen, `,`);
            editor.insert(node.range.end.offset+node.range.end.tokLen, `))`);
        }
        else {
            if (node.initStyle) editor.insert(node.range.begin.offset, `finalize_heap_construction(${sourceSpan},`);
            editor.insert(node.range.begin.offset + node.range.begin.tokLen, `(trace_raw_allocation<typename std::remove_pointer<${node.type.qualType}>::type>(${sourceSpan}))`);
            if (node.initStyle) editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
        }
    },

    "CXXDeleteExpr": (node, editor, context) => {
        const sourceSpan = editor.calculateSourceSpan(node);
        editor.insert(node.range.begin.offset, `__TRACE_DELETE(${sourceSpan},`);
        editor.insert(node.range.begin.offset + node.range.begin.tokLen, `,`);
        if (node.inner) node.inner.forEach(i => context.traverse(i, editor, context));
        editor.insert(node.range.end.offset + node.range.end.tokLen, `)`);
    },

    "CallExpr": (node, editor, context) => {

        // Skip SplashKit COLOR_* macros
        if (node.range.begin.spellingLoc && node.range.begin.spellingLoc.file == "/include/splashkit/color.h")
            return;

        const sourceSpan = editor.calculateSourceSpan(node);
        editor.insert(node.range.begin.offset, `(FunctionCallPauseHack{${sourceSpan}}, __TRACE_EXPRESSION(${sourceSpan}, ${context.isInnerExpression},`);
        if (node.inner) node.inner.forEach(i => context.traverse(i, editor, context.markInner()));
        editor.insert(node.range.end.offset+node.range.end.tokLen, "))");
    },

    "CXXMemberCallExpr": (node, editor, context) => {
        // Same logic as CallExpr
        astHandlers["CallExpr"](node, editor, context);
    },

    "ArraySubscriptExpr": (node, editor, context) => {
        if (node.inner && node.inner[1]) context.traverse(node.inner[1], editor, context.markInner());
    },

    "BinaryOperator": (node, editor, context) => {
        const sourceSpan = editor.calculateSourceSpan(node);
        if (node.opcode.indexOf("=") == -1 || node.opcode == ">=" || node.opcode == "<=" || node.opcode == "==" || node.opcode == "!=") {
            editor.insert(node.range.begin.offset, `__TRACE_EXPRESSION(${sourceSpan}, ${context.isInnerExpression},`);
            node.inner.forEach(i => context.traverse(i, editor, context.markInner()));
            editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
        } else {
            editor.insert(node.range.begin.offset, `__TRACE_ASSIGNMENT(${sourceSpan},`);
            context.traverse(node.inner[0], editor, context.markInner());
            editor.insert(node.inner[0].range.end.offset+node.inner[0].range.end.tokLen, ",");
            editor.insert(node.inner[1].range.begin.offset, ",");
            context.traverse(node.inner[1], editor, context.markInner());
            editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
        }
    },

    "CompoundAssignOperator": (node, editor, context) => {
        // Delegate to BinaryOperator
        astHandlers["BinaryOperator"](node, editor, context);
    },

    "CXXOperatorCallExpr": (node, editor, context) => {
        let opcode = editor.select(node.inner[0].range.begin.offset, node.inner[0].range.end.offset + node.inner[0].range.end.tokLen);
        const sourceSpan = editor.calculateSourceSpan(node);

        if (opcode.indexOf("=") == -1 || opcode == ">=" || opcode == "<=" || opcode == "==" || opcode == "!=") {
            editor.insert(node.range.begin.offset, `__TRACE_EXPRESSION(${sourceSpan}, ${context.isInnerExpression},`);
            node.inner.forEach(i => context.traverse(i, editor, context.markInner()));
            editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
        }
        else {
            editor.insert(node.range.begin.offset, `__TRACE_ASSIGNMENT(${sourceSpan},`);

            context.traverse(node.inner[1], editor, context.markInner());

            editor.insert(node.inner[0].range.begin.offset, ",");
            editor.insert(node.inner[0].range.end.offset+node.inner[0].range.end.tokLen, ",");

            context.traverse(node.inner[2], editor, context.markInner());

            editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
        }
    },

    "UnaryOperator": (node, editor, context) => {
        const sourceSpan = editor.calculateSourceSpan(node);
        if (node.opcode == "++" || node.opcode == "--"){
            if (node.isPostfix) {
                editor.insert(node.range.begin.offset, `__TRACE_ASSIGNMENT(${sourceSpan},`);
                context.traverse(node.inner[0], editor, context.markInner());
                editor.insert(node.inner[0].range.end.offset+node.inner[0].range.end.tokLen, ",");
                editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
            } else {
                editor.insert(node.range.begin.offset, `__TRACE_ASSIGNMENT_PRE(${sourceSpan},`);
                editor.insert(node.inner[0].range.begin.offset, ",");
                context.traverse(node.inner[0], editor, context.markInner());
                editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
            }
        } else {
            editor.insert(node.range.begin.offset, `__TRACE_EXPRESSION(${sourceSpan}, ${context.isInnerExpression},`);
            node.inner.forEach(i => context.traverse(i, editor, context.markInner()));
            editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
        }
    },

    "CXXRecordDecl": (node, editor, context) => {
        handleRecordDecl(node, [], editor, context);
    },

    "ClassTemplateDecl": (node, editor, context) => {
        let templateParams = [];
        for (let t of node.inner) {
            if (t.kind == "TemplateTypeParmDecl" || t.kind == "NonTypeTemplateParmDecl")
                templateParams.push(t);
        }
        for (let t of node.inner) {
            if (t.kind == "CXXRecordDecl") {
                t.typedefDecls = node.typedefDecls;
                handleRecordDecl(t, templateParams, editor, context);
            }
        }
    },

    "IfStmt": (node, editor, context) => handleControlFlow(node, editor, context),
    "ForStmt": (node, editor, context) => handleControlFlow(node, editor, context),
    "WhileStmt": (node, editor, context) => handleControlFlow(node, editor, context),

    "CompoundStmt": (node, editor, context, dontTrackScope) => {
        const { traverse } = context;

        // later on we should have proper stack tracking
        // so we can make this more flexible
        let isMain = context.isMain??false;
        context.isMain = false;

        let start = editor.calculateSourceSpan({ range: { begin: node.range.begin, end: node.range.begin } });
        let end = editor.calculateSourceSpan({ range: { begin: node.range.end, end: node.range.end } });

        if (!dontTrackScope) {
            editor.insert(node.range.begin.offset + node.range.begin.tokLen, `__handle_debug_forced_break(); __break(${start});\n`);
            editor.insert(node.range.end.offset, `__break(${end});\n`);
        }

        // sometimes VarDecls are on their own...
        // so group them by their declaration if in the same statement
        // similarly TypedefDecl comes after CXXRecordDecl, merge these...
        let lastStart = null;
        let lastRecord = null;
        let stmts = [];
        for (let i of (node.inner ?? [])){
            if (i.kind == "DeclStmt") {
                lastStart = i.range.begin.offset;
                stmts.push(i);
            }
            else if (i.kind == "VarDecl") {
                if (lastStart == i.range.begin.offset) {
                    stmts[stmts.length - 1].inner.push(i);
                }
                else {
                    lastStart = i.range.begin.offset;
                    // fake DeclStmt
                    stmts.push({
                        kind: "DeclStmt",
                        inner: [i]
                    });
                }
            }
            else if (i.kind == "CXXRecordDecl" | i.kind == "ClassTemplateDecl") {
                lastRecord = i.range.begin.offset;
                i.typedefDecls = [];
                stmts.push(i);
            }
            else if (i.kind == "TypedefDecl") {
                if (i.range.begin.offset <= lastRecord) {
                    stmts[stmts.length - 1].typedefDecls.push(i);
                }
                else {
                    stmts.push(i);
                }
            }
            else {
                stmts.push(i);
            }
        }

        // now loop over the statements...
        for (let i of stmts){
            if (i.kind == "DeclStmt") {
                let trackers = "";
                for (let v of i.inner){
                    if (v.kind == "VarDecl" && v.storageClass != "extern")
                        trackers += `__SCOPED_VARIABLE_TRACKER(${v.name}, ${isMain?"true":"false"});\n`;
                }
                editor.insert(i.inner[0].range.begin.offset, trackers);
                for (let v of i.inner)
                    traverse(v, editor, context);
            }
            else {
                traverse(i, editor, context);
            }
        }
    },

    "ReturnStmt": (node, editor, context) => {
        const sourceSpan = editor.calculateSourceSpan(node);
        editor.insert(node.range.begin.offset + node.range.begin.tokLen, ` __TRACE_EXPRESSION(${sourceSpan}, ${context.isInnerExpression},`);
        if (node.inner) node.inner.forEach(i => context.traverse(i, editor, context));
        editor.insert(node.range.end.offset+node.range.end.tokLen, ")");
    },

    "NamespaceDecl" : (node, editor, context) => {
        // Almost same logic as CompoundStmt
        astHandlers["CompoundStmt"](node, editor, context, true);
    },

    "FunctionDecl" : (node, editor, context) => {
        if (node.inner) {
            if (node.name && node.name == "main")
                context.isMain = true;
            node.inner.forEach(child => context.traverse(child, editor, context));
        }
        context.isMain = false;
    },
};

// Helper for CXXRecordDecl (called by CXXRecordDecl and ClassTemplateDecl)
function handleRecordDecl(node, templateParams, editor, context) {
    const { traverse, predefs, declaredRecords } = context;

    let templateDefinition = "template<";
    let templateUsage = "<";
    if (templateParams.length == 0) {
        templateDefinition = "";
        templateUsage = "";
    } else {
        for (let param of templateParams) {
            if (param.kind=="TemplateTypeParmDecl") {
                templateDefinition += `${param.tagUsed} ${param.name},`;
            } else if (param.kind=="NonTypeTemplateParmDecl"){
                let theDecl = editor.select(param.range.begin.offset, param.range.end.offset+param.range.end.tokLen);
                templateDefinition += `${theDecl},`;
            }
            templateUsage += `${param.name},`;
        }
        templateDefinition = templateDefinition.slice(0, -1)+">\n";
        templateUsage = templateUsage.slice(0, -1)+">\n";
    }

    if (node.inner) {
        for (let i of node.inner){
            if (i.kind == "CXXMethodDecl" || i.kind == "CXXConstructorDecl"){
                traverse(i, editor, context);
            }
        }
    }

    let fields = [];
    if (node.inner) {
        for (let i of node.inner){
            if (i.kind == "FieldDecl") fields.push(i.name);
        }
    }

    let typenameCode = "";
    let memoryStructureCode = "";

    if (!declaredRecords.has(node.name)) {
        typenameCode = `${templateDefinition}
            REGISTER_TYPE_NAME(${node.name}${templateUsage})
        `;
        declaredRecords.set(node.name, {});
    }

    let specialization = "";
    if (templateDefinition == "") {
        templateDefinition = "template<>";
        specialization = `<${node.name}>`;
    }

    if (node.inner) {
        memoryStructureCode = `
            ${templateDefinition} inline std::string emit_memory_record${specialization}(const ${node.name}${templateUsage}& t){
                std::stringstream ss;
                ${fields.map((x) => `    ss << emit_memory_record(t.${x});`).join("\n")}
                return ss.str();
            }
            ${templateDefinition} inline std::string emit_structure_record${specialization}(std::string name, const ${node.name}${templateUsage}& t){
                return emit_structure_wrap(name, t, ""
                    ${fields.map((x) => `+ emit_structure_record("${x}", t.${x})`).join("\n")}
                );
            }
        `;
    }

    let sourceSpan = editor.calculateSourceSpan(node);

    // If it was from an include, place it in a spare spot near the top
    if (sourceSpan == null) {
        let location = context.namespaceIncludesLength; // Use length of the header injection
        predefs.value += typenameCode;
        editor.insert(location, memoryStructureCode);
    } else {
        // otherwise place it directly after the struct
        let location = node.range.end.offset+node.range.end.tokLen;
        if (node.typedefDecls.length > 0)
            location = node.typedefDecls[node.typedefDecls.length-1].range.end.offset + node.typedefDecls[node.typedefDecls.length-1].range.end.tokLen;
        editor.insert(location, ";"+typenameCode+memoryStructureCode);
    }
}

// Helper for control flow statements
function handleControlFlow(node, editor, context) {
    const { traverse } = context;

    editor.insert(node.range.begin.offset, "{");

    let first = node.inner[0];
    if (first.kind == "DeclStmt") {
        let trackers = "";
        for (let i of first.inner){
           if (i.kind == "VarDecl") trackers += `__SCOPED_VARIABLE_TRACKER(${i.name}, false);\n`;
        }
        editor.insert(node.range.begin.offset, trackers);
    }

    for (let i of node.inner.slice(0, -1)) traverse(i, editor, context);

    let body = node.inner[node.inner.length-1];
    editor.insert(body.range.begin.offset, "{");
    traverse(body, editor, context);

    let extension = 0;
    if (body.kind == "CompoundStmt") extension = 1;

    editor.insert(body.range.end.offset + body.range.end.tokLen + extension, ";}");
    editor.insert(node.range.end.offset + node.range.end.tokLen + extension, ";}");
}

function preprocessNode(node) {
    // Normalize the range fields a bit
    for (let n of ([node].concat(node.inner??[]))) {
        // If this was a macro expansion, use the expansion loc
        if (n.range &&
            n.range.begin &&
            n.range.begin.expansionLoc &&
            !n.range.begin.offset
        ) {
            n.range.begin.offset = n.range.begin.expansionLoc.offset;
            n.range.begin.tokLen = n.range.begin.expansionLoc.tokLen;
        }
        // The begin and end can be different somehow
        if (n.range &&
            n.range.end &&
            n.range.end.expansionLoc &&
            !n.range.end.offset
        ) {
            n.range.end.offset = n.range.end.expansionLoc.offset;
            n.range.end.tokLen = n.range.end.expansionLoc.tokLen;
        }
    }
}





async function preprocessDebugSourceCode(name, source, promiseChannel){

    // Start the debug macro file downloading if it hasn't already
    if (!debugMacros)
        debugMacros = fetch("compilers/cxx/SplashKitOnlineDebugMacros.h").then((x)=>x.text());

    await promiseChannel.postMessage("setupUserCode", {
        codeFiles : [{ name: name, source: source }]
    });

    // 1. Syntax Check
    // This way the user receives a sane error message normally
    // Any errors after this are our fault :)
    let syntaxOut = (await promiseChannel.postMessage("compileObject", {
        arguments: ['-fsyntax-only', '-idirafter/lib/clang/16.0.4/include/', '-fdiagnostics-color=always', name],
        outputName: null
    }));

    if (syntaxOut.blob == null) return { name: name+".o", output: null };

    // 2. Namespace Wrapping
    // This is done so later on we can filter the AST by USERCODE,
    // without which the AST is 150mb, which is insane.
    // With the filtering it's down to a few hundred kilobytes, worth
    // the extra complexity I think...
    let namespacedSource = wrapSourceInNamespace(source);

    const namespaceIncludes = `
    #define splashkit_lib USERCODE::HIDDEN// really sorry about this...
    #include "splashkit.h"
    #undef types_hpp
    #undef splashkit_lib
    #include <splashkit.h>
    `;

    namespacedSource = namespaceIncludes+namespacedSource;

    // 3. Fetch AST
    await promiseChannel.postMessage("setupUserCode", {
        codeFiles : [{ name: name, source: namespacedSource }]
    });

    let astOut = (await promiseChannel.postMessage("compileObject", {
        arguments: ['-Xclang', '-ast-dump=json', '-fsyntax-only', '-Xclang', '-ast-dump-filter=USERCODE', '-idirafter/lib/clang/16.0.4/include/', '-fdiagnostics-color=always', name],
        outputName: null,
        options: {silent: true}
    }));

    if (astOut.blob == null) return { name: name+".o", output: null };

    let ASTs = parseASTFromOutput(astOut.stdout);

    // 4. Macro Injection
    let editor = new SourceEditor(namespacedSource, count(namespaceIncludes, "\n"));

    // Context passed to all handlers
    const context = {
        namespaceIncludesLength: namespaceIncludes.length,
        predefs: { value: `
            #define REGISTER_TYPE_NAME(...) inline std::string get_type_name_specific(const __VA_ARGS__& x){return #__VA_ARGS__;};

            static std::string __debug_current_filename = __FILE__;
            `
        },
        declaredRecords: new Map(),
        traverse: null, // Assigned below to allow recursion
        isInnerExpression: false,
        markInner: function(){
            if (this.isInnerExpression)
                return this;
            return {
                namespaceIncludesLength: this.namespaceIncludesLength,
                predefs: this.predefs,
                declaredRecords: this.declaredRecords,
                traverse: this.traverse,
                isInnerExpression: true,
                markInner: this.markInner
            };
        }
    };

    // The recursive traversal function
    const traverse = (node, ed, ctx) => {
        if (node.isImplicit) return;

        preprocessNode(node);

        // Check for specific handler
        if (astHandlers[node.kind]) {
            astHandlers[node.kind](node, ed, ctx);
        }
        // Default recursion for container nodes
        else {
            const lookInside = ["DeclStmt", "ExprWithCleanups", "CXXMethodDecl", "CXXConstructorDecl", "ImplicitCastExpr", "DoStmt", "MaterializeTemporaryExpr", "CXXBindTemporaryExpr"];
            if (lookInside.indexOf(node.kind) >= 0 && node.inner) {
                node.inner.forEach(child => traverse(child, ed, ctx));
            }
        }
    };

    context.traverse = traverse;

    for (let AST of ASTs) traverse(AST, editor, context);

    // 5. Finalize Source
    let processedSource = `
    #include <splashkit.h>
    ${context.predefs.value}
    #include "SplashKitOnlineDebugMacros.h"
    `+editor.getResult();

    processedSource = processedSource.replaceAll(namespaceIncludes, "");
    processedSource = processedSource.replaceAll("namespace USERCODE{", "");
    processedSource = processedSource.replaceAll("}/*USERCODE*/", "");

    await promiseChannel.postMessage("setupUserCode", {
        codeFiles : [{
            name: "code/SplashKitOnlineDebugMacros.h",
            source: await debugMacros
        }]
    });

    return {
        processedSource: processedSource
    };
}


export {preprocessDebugSourceCode};














// misc

function testCountOuterArrayLayers(countOuterArrayLayers) {
    const tests = [
        // Simple arrays
        ["int[3]", 1],
        ["int[3][4]", 2],
        ["int[3][4][5]", 3],

        // Pointer vs array
        ["int*", 0],
        ["int*[3]", 1],
        ["int (*[10])", 1],
        ["int (*)[10]", 0],

        // Function pointer scenarios
        ["int (*(*fp)(void))[10]", 0],
        ["int (*fp(void))[10]", 0],
        ["int (*fp[5])(void)", 1],
        ["int (*(*arr[3])(void))[5]", 1],
        ["int (*(*(*fp)(void))[5])(void)", 0],

        // Nested pointer madness
        ["int (**[5])[7]", 1],
        ["int (*(**[5])[7])[9]", 1],

        // Templates + arrays
        ["std::array<int,3>[4]", 1],
        ["std::vector<int>[4][5]", 2],

        // No arrays
        ["int", 0],
        ["int (*)(void)", 0],

        // Extreme cases
        ["int (*(*(*arr[2])(void))[3])[4]", 1], // array of pointers to functions returning pointer to array
        ["int (*(*(*(*arr[2])[5])(void))[3])[4]", 1], // nested arrays & functions
        ["int (*(*(*(*arr[2])[5])(void))[3][7])[4]", 1], // deeper nested
        ["int (*(*(*(*(*arr[2])[5])(void))[3])[7])[4]", 1], // more...
        ["int (*(*(*(*(*(*arr[2])[5])(void))[3])[7])[2])[4]", 1],
        ["int[3][4][5][6]", 4], // normal multi-d array
        ["int (*[3][4])", 2],    // array of arrays of pointers
        ["int (**[3][4])", 2],   // double pointers in arrays
        ["int (*(*[3])[4])", 1], // mix of pointer & array parentheses
        ["int ((((*[2]))[3])[4])", 1], // nested parens
        ["int ((((*(*[2]))[3])[4]))", 1],
    ];

    let failures = 0;

    for (const [type, expected] of tests) {
        const result = countOuterArrayLayers(type);
        const ok = result === expected;
        console.log(`${ok ? "PASS" : "FAIL"} | ${type} → ${result} (expected ${expected})`);
        if (!ok) failures++;
    }

    console.log("\nDone.");
    if (failures) console.log(`❌ ${failures} failure(s).`);
    else console.log("✅ All tests passed.");
}
