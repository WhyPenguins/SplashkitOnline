"use strict";

// A very hacky converter from C++ to JavaScript
// The folly of trying to pass something as complex as C++
// with a handful of regexes is acknowledged.

// Not intended to completely convert ( though it can in many cases),
// and is designed to do as little actual parsing as possible.

// If we do decide to do a proper transpiler, this should be done
// by actually parsing C++ to an AST (though this is easier said than done).
// For now, it would be best if this wasn't extended too much further.
function cpp_to_js(source){

	// This regex is quite beautiful is it not?
	// Note it deliberately fails for pointers/references, since we
	// can't handle them properly.
	let find_variable_declarations = /([{};(]\s*(?:\/\/[\S \t]*\n|\s)*)(const\s+|)(\w+)(?<!return)\s*(?:<(.*)>|\s)\s*(((?=((?:\w+)\s*(?:\[.*\]|)\s*(?:=[^;]*(?:,|)\s*|(?:,|(?=;))\s*)))\7)+)(?=;)/gm;

	// Not attempting to handle comments inside here
	function split_variable_declarations(decl){
		let decls = [];
		let in_body = false;
		let decl_name = "";
		let decl_body = "";
		let bracket_count = 0;
		for (let i = 0; i < decl.length; i ++){
			if (decl[i] == '('){
				bracket_count++;
			}
			if (decl[i] == ')'){
				bracket_count--;
			}
			if (decl[i] == '{'){
				bracket_count++;
			}
			if (decl[i] == '}'){
				bracket_count--;
			}
			if (decl[i] == '['){
				bracket_count++;
			}
			if (decl[i] == ']'){
				bracket_count--;
			}
			if (decl[i] == '=' && bracket_count == 0){
				in_body = true; continue;
			}
			if (decl[i] == ',' && bracket_count == 0){
				decls.push({name:decl_name, body:decl_body});
				decl_name = "";
				decl_body = "";
				in_body = false;
				continue;
			}
			if (in_body)
				decl_body += decl[i];
			else if (decl[i] != ' ')
				decl_name += decl[i];
		}
		if (decl_name != '')
			decls.push({name:decl_name, body:decl_body});

		return decls;
	}

	let known_enums = [];
	let default_enums = {};
	let known_structs = [];

	function get_type_is_js_value_type(type, is_array){
		if (is_array)
			return false;
		if (type.endsWith("int")
			|| type.endsWith("double")
			|| type.endsWith("float")
			|| type.endsWith("long")
			|| type.endsWith("string")
			|| type.endsWith("bool")
		)
			return true;
		return false;
	}
	function get_constructor_for_type(type, template_type, array_dims){
		if (array_dims != null && array_dims.length > 0){
			if (type == "char")
				return "\"\"";
			return "new Array("+array_dims+")";
		}

		let con = "undefined";

		if (type.endsWith("int")
			|| type.endsWith("double")
			|| type.endsWith("float")
			|| type.endsWith("long")
		)
			con = "0";
		else if (known_enums.includes(type))
			con = default_enums[type]
		else if (type.endsWith("string") || type.endsWith("char*"))
			con = "\"\"";
		else if (type.endsWith("bool"))
			con = "false";
		else if (type == "vector")
			con = "[]/*"+template_type+"*/";
		else
			con = "new "+type+"()";

		return con;
	}
	function get_array_filler(name, type, template_type, array_dims){
		if (type == "char")return "";
		if (array_dims == null)return "";
		let ret = "        for(let i = 0; i < "+array_dims+"; i ++)\n"
		ret += "            "+name+"[i] = " + get_constructor_for_type(type, template_type, array_dims.slice(1))+";\n";
		//ret += "        }\n"
		return ret;
	}

	// Add an 'end of statement' to begin with.
	source = ";" + source;

	source = source.replaceAll("std::", "");
	source = source.replace(/(^[\t ]*)(#define\s+)([a-zA-Z0-9_]+)(\s+)([^\n]+)/gm, "$1const /**/ $3$4=$4$5;");
	source = source.replace(/(^[\t ]*)(#)/gm, "//$1$2");
	source = source.replace(/([};]\s*(\/\/[\S \t]*\n|\s)*)(using)/gm, "$1//$3");


	source = source.replace(/([{};]\s*(?:\/\/[\S \t]*\n|\s)*)enum\s*([\w_]+)\s*{([\w\s_,]+)}/gm, function(match, ws1, name, enums){
		let enum_names = enums.split(",");

		known_enums.push(name);
		default_enums[name] = enum_names[0];

		let result = "let ";

		enums = []
		for (let i = 0; i < enum_names.length; i ++){
			enums.push(enum_names[i] + " = " + String(i));
		}
		return ws1 + "let " + enums.join(", ")
	});

	source = source.replace(/(?:typedef|)(\s+)(struct|class)\s+([a-zA-Z0-9_]+)\s*{([\s\S]*?)}\s*([a-zA-Z0-9_]+|)\s*;/gm,
	function(match, ws1, structOrClass, name, body, typedef, offset, string, group){
		if (typedef == "") typedef == undefined;

		name = (typedef!="")? typedef : name;

		known_structs.push(name);

		let fields = [];
		let struct_con = "";

		body = "{};" + body;

		body = body.replace(find_variable_declarations,
			function(match, ws1, constOrNot, type, template_params, declarations, tmp1, tmp2, offset, string, group){
				let string_until_now = string.slice(0,offset+ws1.length);

				let outside_function = (string_until_now.match(/{/g).length-string_until_now.match(/}/g).length)==0;
				if (!outside_function){
					return match;
				}

				let decls = split_variable_declarations(declarations);
				let this_decl = "";
				let this_fill = "";
				for (let i = 0; i < decls.length ; i ++){
					//match, name, array sizes
					let pulled_apart = decls[i].name.match(/(\w*)(?:\[([\s\S]*)\]|)/);
					let name = pulled_apart[1];

					let array_dims = null;
					if (pulled_apart.length > 1 && pulled_apart[2]!=undefined && pulled_apart[2] != "")
						array_dims = pulled_apart[2].split(",");

					let con = decls[i].body.replace("{","[").replace("}","]");
					let array_filler = "";
					if (con == ""){
						con = get_constructor_for_type(type, template_params, array_dims);
						array_filler = get_array_filler("this."+name, type, template_params, array_dims);
					}

					this_decl += "this."+name+" = "+con+";"
					this_fill += array_filler;
				}
				struct_con += "        " + this_decl + "\n" + this_fill;

				return ws1.replace(/\s*/g," ");
		});

		body = body.slice(3);

		return ws1 + "class " + name + "{" + "constructor(){\n"+struct_con+"    }" + body + "};"
	});

	let source_offset = 0;
	let positions_of_function_bodies_and_ref_params = []
	source = source.replace(/([{};]\s*(?:\/\/[\S \t]*\n|\s)*)([a-zA-Z0-9_]+)(?<!else)(\s+)([a-zA-Z0-9_]+)(\s*\()([^)]*)(\))/gm,
		function(match, ws1, return_type, ws2, name, bracket1, parameters , bracket2, offset, string, group){
			let decls = parameters.split(",");

			let new_parameters = [];

			let ref_params = [];

			for (let i = 0; i < decls.length ; i ++){
				if (decls[i] == '')
					continue;
				//match, type, ws1, pointer/ref, ws2, name, array
				let pulled_apart = decls[i].match(/(\w+)(\s*)([&*]*)(\s*)(\w*)(\[\w*\]|)/);

				if (pulled_apart[3].length > 0 && pulled_apart[3][pulled_apart[3].length-1] == "&")
					ref_params.push(pulled_apart[5])

				let type = "/*"+pulled_apart[1]+pulled_apart[3]+pulled_apart[6]+"*/";

				new_parameters.push(type+pulled_apart[5]/*+" = "+con+""*/);
			}

			positions_of_function_bodies_and_ref_params.push({pos: offset+source_offset+ws1.length, ref_params:ref_params});
			let ret = ws1 + "function" + ws2 + name + bracket1 + new_parameters.join(", ") + bracket2;
			source_offset += ret.length - match.length;
			return ret;
	});

	// Replace reference assignments in functions
	// Iterate in reverse since we do change the string as we go.
	for(let i = positions_of_function_bodies_and_ref_params.length-1; i >= 0; i --){
		let func = positions_of_function_bodies_and_ref_params[i];

		// First find the extend of the function body
		// First find the start:
		let pos = func.pos;
		let start = null;
		let end = null;
		let brace_count = 0;
		while(pos < source.length){
			if (source[pos] == '{'){
				start = pos + 1;
				brace_count +=1;
				break;
			}
			if (source[pos] == ';'){
				break;
			}
			pos += 1;
		}
		if (start == null)
			continue;
		pos = start;
		while(pos < source.length){
			if (source[pos] == '{')
				brace_count += 1;
			if (source[pos] == '}'){
				brace_count -= 1;
				if (brace_count == 0){
					end = pos;
					break;
				}
			}
			pos += 1;
		}
		if (end == null)
			continue;

		let body = source.slice(start, end);
		body = body.replace(/([{};]\s*(?:\/\/[\S \t]*\n|\s)*)([a-zA-Z0-9_]+)(?:\s*)=(?:\s*)([^;]*)(?=;)/gm,
			function(match, ws1, variable, assignment){

			if (func.ref_params.includes(variable)){
				return ws1 + "Object.assign("+variable+", "+assignment+")";
			}

			return match;
		});
		source = source.slice(0, start) + body + source.slice(end);

	}

	source = source.replace(/([{};]\s*(\/\/[\S \t]*\n|\s)*)([a-zA-Z0-9_]+)(?<!else)(\s+)([a-zA-Z0-9_]+)(\s*\(.*\))(?=;)/gm, "$1//$3$4$5$6");

	source = source.replace(find_variable_declarations,
		function(match, ws1, constOrNot, type, template_params, declarations, tmp1, tmp2, offset, string, group){

			let decl = [];
			let array_filler = "";

			let decls = split_variable_declarations(declarations);
			for (let i = 0; i < decls.length ; i ++){
				//match, name, array sizes
				let pulled_apart = decls[i].name.match(/(\w*)(?:\[([\s\S]*)\]|)/);
				let name = pulled_apart[1];

				let array_dims = null;
				if (pulled_apart.length > 1 && pulled_apart[2]!=undefined && pulled_apart[2] != "")
					array_dims = pulled_apart[2].split(",");

				let con = decls[i].body.replace("{","[").replace("}","]");
				if (con == ""){
					con = get_constructor_for_type(type, template_params, array_dims);
					array_filler += get_array_filler(name, type, template_params, array_dims);
				}

				decl.push(""+name+" = "+con+"");
			}
			if (array_filler != "")
				array_filler = "\n" + array_filler.slice(0,-1);
			return ws1 + "let " + decl.join(", ") + array_filler;
	});


	source = source.replace(/([{};]\s*(\/\/[\S \t]*\n|\s)*)(cout\s*<<\s*)([^;}]*)/gm, "$1$2console.log($4)");
	source = source.replace(/\s*<<\s*endl\s*\)/gm, ")");
	source = source.replace(/(\W)(<<)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1,$3");
	source = source.replace(/(\W)(not)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1!$3");
	source = source.replace(/(\W)(and)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1&&$3");
	source = source.replace(/(\W)(or)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1||$3");

	source = source.replace(/(\W)(push_back)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1push$3");
	source = source.replace(/(\W)(to_string)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1String$3");
	source = source.replace(/(\W)(endl)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1'\\n'$3");
	source = source.replace(/(\W)(flush)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1''$3");
	source = source.replace(/(\W)([0-9]+.[0-9]*)f(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)/gm, "$1$20$3");

	source = source.replace(/(for\s*)\((.*):(.*)\)/gm,
		function(match, _for, defin, looper){
				looper = looper.replace("{","[").replace("}","]");

				//match, type/name, name/nothing
				let pulled_apart = defin.match(/(\w*)\s*(\w*)/);
				console.log(pulled_apart);
				name = pulled_apart[1];
				if (pulled_apart.length > 1 && pulled_apart[2]!=undefined && pulled_apart[2] != "")
					name = (pulled_apart[1] != ""?"let ":"") + pulled_apart[2];
				return _for + "(" + name + " of "+ looper+")";
		});

	for (let struct of known_structs){
		source = source.replace(new RegExp(`(\W)`+struct+`\(\)(\W)(?=(?:[^"\r\n]*"[^"]*")*[^"\r\n]*$)`, 'g'), "$1new "+struct+"()$3");
	}


	return source.slice(1);
}