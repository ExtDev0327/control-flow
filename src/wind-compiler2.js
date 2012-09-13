﻿(function () {
    "use strict";

    var Wind, _;
    
    var codeGenerator = (typeof eval("(function () {})") == "function") ?
        function (code) { return code; } :
        function (code) { return "false || " + code; };
        
    // support string type only.
    var stringify = (typeof JSON !== "undefined" && JSON.stringify) ?
        function (s) { return JSON.stringify(s); } :
        (function () {
            // Implementation comes from JSON2 (http://www.json.org/js.html)
        
            var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
            
            var meta = {    // table of character substitutions
                '\b': '\\b',
                '\t': '\\t',
                '\n': '\\n',
                '\f': '\\f',
                '\r': '\\r',
                '"' : '\\"',
                '\\': '\\\\'
            }
            
            return function (s) {
                // If the string contains no control characters, no quote characters, and no
                // backslash characters, then we can safely slap some quotes around it.
                // Otherwise we must also replace the offending characters with safe escape
                // sequences.

                escapable.lastIndex = 0;
                return escapable.test(s) ? '"' + s.replace(escapable, function (a) {
                    var c = meta[a];
                    return typeof c === 's' ? c :
                        '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                }) + '"' : '"' + s + '"';
            };
        })();
    
    function getPrecedence(ast) {
        switch (ast.type) {
            case "MemberExpression": // .
            case "dot": // .
            case "sub": // []
            case "call": // ()
                return 1;
            case "unary-postfix": // ++ -- - ~ ! delete new typeof void
            case "unary-prefix":
                return 2;
            case "var":
            case "BinaryExpression":
                switch (ast.operator) {
                    case "*":
                    case "/":
                    case "%":
                        return 3;
                    case "+":
                    case "-":
                        return 4;
                    case "<<":
                    case ">>":
                    case ">>>":
                        return 5;
                    case "<":
                    case "<=":
                    case ">":
                    case ">=":
                    case "instanceof":
                        return 6;
                    case "==":
                    case "!=":
                    case "===":
                    case "!==":
                        return 7;
                    case "&":
                        return 8;
                    case "^":
                        return 9;
                    case "|":
                        return 10;
                    case "&&":
                        return 11;
                    case "||":
                        return 12;
                }
            case "conditional":
                return 13;
            case "assign":
                return 14;
            case "NewExpression":
            case "new":
                return 15;
            case "Literal":
            case "Identifier":
            case "seq":
            case "stat":
            case "name":
            case "object":
            case "array":
            case "num":
            case "regexp":
            case "string":
            case "function":
            case "defun":
            case "for":
            case "for-in":
            case "block":
            case "while":
            case "do":
            case "if":
            case "break":
            case "continue":
            case "return":
            case "throw":
            case "try":
            case "switch": 
                return 0;
            default:
                return 100; // the lowest
        }
    }
    
    var isSubset = function (full, partial) {
        if (full === partial) return true;
        
        if (typeof full !== typeof partial) return false
        switch (typeof full) {
            case "string":
            case "number":
            case "boolean":
            case "undefined":
                return full === partial;
        }
        
        if (full === null && partial !== null) return false;
        if (full !== null && partial === null) return false;

        if (_.isArray(full)) {
            if (!_.isArray(partial)) return false;
            if (full.length != partial.length) return false;

            for (var i = 0; i < full.length; i++) {
                if (!isSubset(full[i], partial[i])) return false;
            }

            return true;
        }
        
        if (_.isArray(partial)) return false;
        
        var result = _.each(partial, function (key, value) {
            if (!(key in full)) return false;
            if (!isSubset(full[key], value)) return false;
        });
        
        if (result === false) return false
        
        return true;
    };

    var CodeWriter = function (indent) {
        this._indent = indent || "    ";
        this._indentLevel = 0;
        
        this.lines = [];
    }
    CodeWriter.prototype = {
        write: function (str) {
            if (str === undefined) return;
            
            if (this.lines.length == 0) {
                this.lines.push("");
            }

            this.lines[this.lines.length - 1] += str;
            return this;
        },
        
        writeLine: function () {
            this.write.apply(this, arguments);
            this.lines.push("");
            return this;
        },
        
        writeIndents: function () {
            var indents = new Array(this._indentLevel);
            for (var i = 0; i < this._indentLevel; i++) {
                indents[i] = this._indent;
            }
            
            this.write(indents.join(""));
            return this;
        }, 
        
        addIndentLevel: function (diff) {
            this._indentLevel += diff;
            return this;
        }
    };
    
    var SeedProvider = function () {
        this._seeds = {};
    }
    SeedProvider.prototype.next = function (key) {
        var value = this._seeds[key];
        if (value == undefined) {
            this._seeds[key] = 0;
            return 0;
        } else {
            this._seeds[key] = ++value;
            return value;
        }
    }
    
    var WindAstGenerator = function (builderName, seedProvider) {
        this._builderName = builderName;
        this._binder = Wind.binders[builderName];
        this._seedProvider = seedProvider || new SeedProvider();
    };
    WindAstGenerator.prototype = {
        generate: function (funcAst) {
            var rootAst = {
                type: "Function",
                name: funcAst.id ? funcAst.id.name : null,
                params: funcAst.params,
                body: { type: "Delay", children: [] }
            };

            this._generateStatements(funcAst.body.body, 0, rootAst.body.children);
            
            return rootAst;
        },
        
        _createBindAst: function (isReturn, name, assignee, expression) {
            return {
                type: "Bind",
                isReturn: isReturn,
                name: name,
                assignee: assignee,
                expression: expression,
                following: []
            };
        },
        
        _getBindAst: function (ast) {
            // $await(xxx);
            var exprStyle = {
                type: "ExpressionStatement",
                expression: {
                    type: "CallExpression",
                    callee: { type: "Identifier", name: this._binder }
                }
            };
            
            if (isSubset(ast, exprStyle)) {
                var args = ast.expression.arguments;
                if (args.length != 1) return;
                
                return this._createBindAst(false, "", null, args[0]);
            };
            
            // var a = $await(xxx);
            var varDeclStyle = {
                type: "VariableDeclaration",
                declarations: [ {
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                    },
                    init: {
                        type: "CallExpression",
                        callee: {
                            type: "Identifier",
                            name: this._binder
                        }
                    }
                } ]
            };
            
            if (isSubset(ast, varDeclStyle)) {
                var declarator = ast.declarations[0];
                var args = declarator.init.arguments;
                if (args.length != 1) return;

                return this._createBindAst(false, declarator.id.name, null, args[0]);
            };
            
            // a.b = $await(xxx)
            var assignStyle = {
                type: "ExpressionStatement",
                expression: {
                    type: "AssignmentExpression",
                    operator: "=",
                    right: {
                        type: "CallExpression",
                        callee: {
                            type: "Identifier",
                            name: this._binder
                        }
                    }
                }
            };
            
            if (isSubset(ast, assignStyle)) {
                var assignExpr = ast.expression;
                var args = assignExpr.right.arguments;
                if (args.length != 1) return;
                
                return this._createBindAst(false, "_$result$_", assignExpr.left, args[0]);
            }
            
            // return $await(xxx);
            var returnStyle = {
                type: "ReturnStatement",
                argument: {
                    type: "CallExpression",
                    callee: {
                        "type": "Identifier",
                        "name": "$await"
                    }
                }
            };
            
            if (isSubset(ast, returnStyle)) {
                var args = ast.argument.arguments
                if (args.length != 1) return;
                
                return this._createBindAst(true, "_$result$_", null, args[0]);
            }
        },
        
        _generateStatements: function (statements, index, children) {
            if (index >= statements.length) {
                children.push({ type: "Normal" });
                return;
            }
            
            var currStmt = statements[index];
            if (currStmt.type === "EmptyStatement") {
                this._generateStatements(statements, index + 1, children);
                return;
            }
            
            var bindAst = this._getBindAst(currStmt);
            
            if (bindAst) {
                children.push(bindAst);
                
                if (!bindAst.isReturn) {
                    this._generateStatements(statements, index + 1, bindAst.following);
                }
                
                return;
            }
            
            switch (currStmt.type) {
                case "ReturnStatement":
                case "BreakStatement":
                case "ContinueStatement":
                case "ThrowStatement":
                    children.push({ type: "Raw", statement: currStmt });
                    return;
            }
            
            this._generateAst(currStmt, children);
            
            if (children[children.length - 1].type === "Raw") {
                this._generateStatements(statements, index + 1, children);
                return;
            }
            
            if (index === statements.length - 1) return;
            
            var combineAst = {
                type: "Combine",
                first: { type: "Delay", children: [ children.pop() /* replace the last */ ] },
                second: { type: "Delay", children: [] }
            };
            
            children.push(combineAst);
            this._generateStatements(statements, index + 1, combineAst.second.children);
        },
        
        _noBinding: function (children) {
            if (!children) return true;
            if (children.length <= 0) return true;
            
            switch (children[children.length - 1].type) {
                case "Raw":
                case "Normal":
                    return true;
                default:
                    return false;
            }
        },
        
        _generateBodyStatements: function (body) {
            var bodyStatements = body.type == "BlockStatement" ? body.body : [ body ];
            
            var children = [];
            this._generateStatements(bodyStatements, 0, children);
            
            return children;
        },
        
        _generateAst: function (ast, children) {
            var generator = this._astGenerators[ast.type];
            if (!generator) {
                children.push({ type: "Raw", statement: ast });
                return;
            }
            
            generator.call(this, ast, children);
        },
        
        _astGenerators: {
            "WhileStatement": function (ast, children) {
                var bodyChildren = this._generateBodyStatements(ast.body);
                if (this._noBinding(bodyChildren)) {
                    children.push({ type: "Raw", statement: ast });
                    return;
                }
                
                children.push({
                    type: "While",
                    test: ast.test,
                    body: { type: "Delay", children: bodyChildren }
                });
            },
            
            "ForStatement": function (ast, children) {
                var bodyChildren = this._generateBodyStatements(ast.body);
                if (this._noBinding(bodyChildren)) {
                    children.push({ type: "Raw", statement: ast });
                    return;
                }
                    
                if (ast.init) {
                    children.push({ type: "Raw", statement: ast.init });
                }
                
                children.push({
                    type: "For",
                    test: ast.test,
                    update: ast.update,
                    body: { type: "Delay", children: bodyChildren }
                });
            },
            
            "IfStatement": function (ast, children) {
                var consequent = this._generateBodyStatements(ast.consequent);
                var alternate = ast.alternate ? this._generateBodyStatements(ast.alternate) : null;
                
                if (this._noBinding(consequent) && this._noBinding(alternate)) {
                    children.push({ type: "Raw", statement: ast });
                    return;
                }
                
                children.push({
                    type: "If",
                    test: ast.test,
                    consequent: consequent,
                    alternate: alternate
                });
            }
        }
    };
    
    var CodeGenerator = function (builderName, codeWriter, commentWriter, seedProvider) {
        this._builderName = builderName;
        this._binder = Wind.binders[builderName];
        this._seedProvider = seedProvider || new SeedProvider();
        
        this._codeWriter = codeWriter;
        this._commentWriter = commentWriter;
    }
    CodeGenerator.prototype = {
        _code: function () {
            this._codeWriter.write.apply(this._codeWriter, arguments);
            return this;
        },
        
        _codeLine: function () {
            this._codeWriter.writeLine.apply(this._codeWriter, arguments);
            return this;
        },
        
        _codeIndents: function () {
            this._codeWriter.writeIndents();
            return this;
        },
        
        _codeIndentLevel: function (diff) {
            this._codeWriter.addIndentLevel(diff);
            return this;
        },
        
        _comment: function () {
            this._commentWriter.write.apply(this._commentWriter, arguments);
            return this;
        },
        
        _commentLine: function () {
            this._commentWriter.writeLine.apply(this._commentWriter, arguments);
            return this;
        },
        
        _commentIndents: function () {
            this._commentWriter.writeIndents();
            return this;
        },
        
        _commentIndentLevel: function (diff) {
            this._commentWriter.addIndentLevel(diff);
            return this;
        },
        
        _both: function () {
            this._codeWriter.write.apply(this._codeWriter, arguments);
            this._commentWriter.write.apply(this._commentWriter, arguments);

            return this;
        },
        
        _bothLine: function () {
            this._codeWriter.writeLine.apply(this._codeWriter, arguments);
            this._commentWriter.writeLine.apply(this._commentWriter, arguments);
            
            return this;
        },
        
        _bothIndents: function () {
            this._codeWriter.writeIndents();
            this._commentWriter.writeIndents();
            
            return this;
        },
        
        _bothIndentLevel: function (diff) {
            this._codeWriter.addIndentLevel(diff);
            this._commentWriter.addIndentLevel(diff);
            
            return this;
        },
        
        _newLine: function () {
            this._codeWriter.writeLine.apply(this._codeWriter, arguments);
            this._commentWriter.writeLine(); // To Remove
            return this;
        },
        
        generate: function (windAst) {
            this._normalMode = false;
            this._builderVar = "_builder_$" + this._seedProvider.next("builderId");
            
            var funcName = windAst.name || "";
            var params = _.map(windAst.params, function (m) { return m.name; });
            
            this._code("(")._bothLine("function " + funcName + "(" + params.join(", ") + ") {");
            this._bothIndentLevel(1);
            
            this._codeIndents()._newLine("var " + this._builderVar + " = " + "Wind.builders[" + stringify(this._builderName) + "];");
            
            this._codeIndents()._newLine("return " + this._builderVar + ".Start(this,");
            this._codeIndentLevel(1);
            
            this._pos = { };
            
            this._bothIndents()._generateWind(windAst.body)._newLine();
            this._codeIndentLevel(-1);
            
            this._codeIndents()._newLine(");");
            this._bothIndentLevel(-1);
            
            this._bothIndents()._both("}")._code(")");
        },
        
        _generateWindStatements: function (statements) {
            for (var i = 0; i < statements.length; i++) {
                var stmt = statements[i];

                switch (stmt.type) {
                    case "Delay":
                        this._generateWindStatements(stmt.children);
                        break;
                    case "Raw":
                        this._generateRaw(stmt.statement);
                        break;
                    case "If":
                    case "Switch":
                        this._bothIndents()._generateWind(stmt)._newLine();
                        break;
                    default:
                        this._bothIndents()._code("return ")._generateWind(stmt)._newLine(";");
                        break;
                }
            }
        },
        
        _generateWind: function (ast) {
            var generator = this._windGenerators[ast.type];
            if (!generator) {
                debugger;
                throw new Error("Unsupported type: " + ast.type);
            }
            
            generator.call(this, ast);
            return this;
        },
        
        _windGenerators: {
            Delay: function (ast) {
                if (ast.children.length === 1) {
                    var child = ast.children[0];
                    switch (child.type) {
                        case "Delay":
                        case "Combine":
                        case "While":
                        case "For":
                        case "Normal":
                            this._generateWind(child);
                            return;
                    }
                    
                    if (child.type === "Raw" && 
                        child.statement.type === "ReturnStatement" &&
                        child.statement.argument === null) {
                        
                        this._generateWind(child);
                        return;
                    }
                }
                
                this._newLine(this._builderVar + ".Delay(function () {");
                this._codeIndentLevel(1);

                this._generateWindStatements(ast.children);
                this._codeIndentLevel(-1);

                this._codeIndents()._code("})");
            },
            
            Bind: function (ast) {
                var commentPrefix = "";
                if (ast.isReturn) {
                    commentPrefix = "return ";
                } else if (ast.name !== "") {
                    commentPrefix = "var " + ast.name + " = ";
                }
                
                this._code(this._builderVar + ".Bind(")._comment(commentPrefix + this._binder + "(")._generateRaw(ast.expression)._comment(");")._newLine(", function (" + ast.name + ") {");
                this._codeIndentLevel(1);
                
                if (ast.isReturn) {
                    this._codeIndents()
                        ._newLine("return " + this._builderVar + ".Return(" + ast.name + ");");
                } else {
                    if (ast.assignee) {
                        this._bothIndents()
                            ._generateRaw(ast.assignee)._bothLine(" = " + ast.name + ";");
                    }
                    
                    this._generateWindStatements(ast.following);
                }
                this._codeIndentLevel(-1);
                
                this._codeIndents()
                    ._code("})");
            },
            
            Normal: function (ast) {
                this._code(this._builderVar + ".Normal()");
            },
            
            Raw: function (ast) {
                this._generateRaw(ast.statement);
            },
        },
        
        /* Raw */
        
        _generateRawStatements: function (statements) {
            for (var i = 0; i < statements.length; i++) {
                this._generateRaw(statements[i]);
            }

            return this;
        },
        
        _generateRawBody: function (bodyAst) {
            if (bodyAst.type === "BlockStatement") {
                this._bothLine(" {");
                this._bothIndentLevel(1);
                
                this._generateRawStatements(bodyAst.body);
                this._bothIndentLevel(-1);
                
                this._bothIndents()._bothLine("}");
            } else {
                this._bothLine();
                this._bothIndentLevel(1);
                
                this._generateRaw(bodyAst);
                this._bothIndentLevel(-1);
            }
            
            return this;
        },
        
        _generateRawElements: function (elements) {
            for (var i = 0; i < elements.length; i++) {
                this._generateRaw(elements[i]);
                if (i < elements.length - 1) this._both(", ");
            }
            
            return this;
        },
        
        _generateRaw: function (ast) {
            var generator = this._rawGenerators[ast.type];
            if (!generator) {
                debugger;
                throw new Error("Unsupported type: " + ast.type);
            }
            
            generator.apply(this, arguments);
            return this;
        },
        
        _rawGenerators: {
            CallExpression: function (ast) {
                this._generateRaw(ast.callee)._both("(")._generateRawElements(ast.arguments)._both(")");
            },
            
            MemberExpression: function (ast) {
                this._generateRaw(ast.object);
                
                if (ast.computed) {
                    this._both("[");
                } else {
                    this._both(".");
                }
                
                this._generateRaw(ast.property);
                
                if (ast.computed) {
                    this._both("]");
                }
            },
            
            Identifier: function (ast) {
                this._both(ast.name);
            },
            
            IfStatement: function (ast) {
                this._bothIndents()._both("if (")._generateRaw(ast.test)._both(")");//._generateRawBody(ast.consequent);
                
                var consequent = ast.consequent;
                var alternate = ast.alternate;
                
                if (consequent.type === "BlockStatement") {
                    this._bothLine(" {");
                    this._bothIndentLevel(1);
                    
                    this._generateRawStatements(consequent.body);
                    this._bothIndentLevel(-1);
                    
                    this._bothIndents()._both("}");
                    
                    if (!alternate) {
                        this._bothLine();
                        return;
                    }
                    
                    throw new Error("Not supported yet");
                } else {
                    this._bothLine();
                    this._bothIndentLevel(1);
                    
                    this._generateRaw(consequent);
                    this._bothIndentLevel(-1);
                    
                    if (!alternate) {
                        return;
                    }
                    
                    throw new Error("Not supported yet");
                }
            },
            
            BlockStatement: function (ast) {
                this._bothIndents()._bothLine("{");
                this._bothIndentLevel(1);
                
                this._generateRawStatements(ast.body)
                this._bothIndentLevel(-1);
                
                this._bothIndents()._bothLine("}");
            },
            
            ReturnStatement: function (ast) {
                if (this._pos.inFunction) {
                    this._bothIndents()._both("return");
                    
                    if (ast.argument) {
                        this._both(" ")._generateRaw(ast.argument);
                    }
                        
                    this._bothLine(";");
                } else {
                    this._bothIndents()._comment("return")._code("return " + this._builderVar + ".Return(");

                    if (ast.argument) {
                        this._comment(" ")._generateRaw(ast.argument);
                    }
                    
                    this._commentLine(";")._codeLine(");");
                }
            },
            
            VariableDeclaration: function (ast, asExpr) {
                if (!asExpr) this._bothIndents();
                this._both(ast.kind)._both(" ");
                
                var decls = ast.declarations;
                for (var i = 0; i < decls.length; i++) {
                    var d = decls[i];
                    this._both(d.id.name + " = ")._generateRaw(d.init);
                    
                    if (i < decls.length - 1) this._both(", ");
                }
                
                if (!asExpr) this._bothLine(";");
            },
            
            NewExpression: function (ast) {
                this._both("new ")._generateRaw(ast.callee)._both("(")._generateRawElements(ast.arguments)._both(")");
            },
            
            Literal: function (ast) {
                this._both(stringify(ast.value));
            },
            
            ArrayExpression: function (ast) {
                if (ast.elements.length > 0) {
                    this._both("[ ")._generateRawElements(ast.elements)._both(" ]");
                } else {
                    this._both("[]");
                }
            },
            
            ForStatement: function (ast) {
                this._bothIndents()._both("for (");
                
                if (ast.init) {
                    this._generateRaw(ast.init, true);
                }
                this._both("; ");
                
                if (ast.test) {
                    this._generateRaw(ast.test);
                }
                this._both("; ");
                
                if (ast.update) {
                    this._generateRaw(ast.update);
                }
                
                this._both(")");
                
                this._generateRawBody(ast.body);
            },
            
            BinaryExpression: function (ast) {
                var left = ast.left, right = ast.right;
                
                if (getPrecedence(ast) < getPrecedence(left)) {
                    this._both("(")._generateRaw(left)._both(")");
                } else {
                    this._generateRaw(left);
                }
                
                this._both(" " + ast.operator + " ");
                
                if (getPrecedence(ast) <= getPrecedence(right)) {
                    this._both("(")._generateRaw(right)._both(")");
                } else {
                    this._generateRaw(right);
                }
            },
            
            UpdateExpression: function (ast) {
                if (ast.prefix) {
                    this._both(ast.operator);
                }
                
                this._generateRaw(ast.argument);
                
                if (!ast.prefix) {
                    this._both(ast.operator);
                }
            },
            
            ExpressionStatement: function (ast) {
                this._bothIndents()._generateRaw(ast.expression)._bothLine(";");
            },
            
            ObjectExpression: function (ast) {
                var properties = ast.properties;
                
                if (properties.length > 0) {
                    this._bothLine("{");
                    this._bothIndentLevel(1);
                
                    for (var i = 0; i < properties.length; i++) {
                        var prop = properties[i];
                        this._bothIndents()._both(stringify(prop.key.name) + ": ")._generateRaw(prop.value);
                        
                        if (i < properties.length - 1) {
                            this._both(",");
                        }
                        
                        this._bothLine();
                    }
                    this._bothIndentLevel(-1);
                    
                    this._bothIndents()._both("}");
                }
            }
        }
    };
    
    var Fn = Function, global = Fn('return this')();
    
    var merge = function (commentLines, codeLines) {
        var length = commentLines.length;
        
        var maxShift = 0;
        
        for (var i = 0; i < length; i++) {
            var matches = codeLines[i].match(" +");
            var spaceLength = matches ? matches[0].length : 0;
            
            var shift = commentLines[i].length - spaceLength + 10;
            if (shift > maxShift) {
                maxShift = shift;
            }
        }
        
        var shiftBuffer = new Array(maxShift);
        for (var i = 0; i < maxShift; i++) {
            shiftBuffer[i] = " ";
        }
        
        var shiftSpaces = shiftBuffer.join("");

        var buffer = [];
        for (var i = 0; i < length; i++) {
            var comment = commentLines[i]; 
            if (comment.replace(/ +/g, "").length > 0) {
                comment = "/* " + comment + " */   ";
            }
            
            var code = shiftSpaces + codeLines[i];
            
            buffer.push(comment);
            buffer.push(code.substring(comment.length));
            
            if (i != length - 1) {
                buffer.push("\n");
            }
        }
        
        return buffer.join("");
    }
    
    var compile = function (builderName, fn) {
        var esprima = (typeof require === "function") ? require("esprima") : global.esprima;
        var inputAst = esprima.parse("(" + fn.toString() + ")");
        var windAst = (new WindAstGenerator(builderName)).generate(inputAst.body[0].expression);
        
        console.log(windAst);
        
        var codeWriter = new CodeWriter();
        var commentWriter = new CodeWriter();
        (new CodeGenerator(builderName, codeWriter, commentWriter)).generate(windAst);
        
        var newCode = merge(commentWriter.lines, codeWriter.lines);
        console.log(newCode);
        
        return newCode;
    };
    
    // CommonJS
    var isCommonJS = !!(typeof require === "function" && typeof module !== "undefined" && module.exports);

    var defineModule = function () {
        _ = Wind._;

        Wind.define({
            name: "compiler2",
            version: "0.7.1",
            require: isCommonJS && require,
            dependencies: { core: "~0.7.0" },
            init: function () {
                Wind.compile = compile;
            }
        });
    };
    
    if (isCommonJS) {
        try {
            Wind = require("./wind-core");
        } catch (ex) {
            Wind = require("wind-core");
        }
        
        defineModule();
    } else {
        if (!global.Wind) {
            throw new Error('Missing the root object, please load "wind" component first.');
        }
        
        Wind = global.Wind;
        defineModule();
    }
})();