var JscexExtractor = function () { }
JscexExtractor.prototype = {
    _visitChildren: function (node) {
        this._visitAll(node.children);
    },

    _visitAll: function (nodes) {
        for (var i = 0; i < nodes.length; i++) {
            this._visit(nodes[i]);
        }
    },

    _visitCall: function (node) {
        try {
            var isEval = (node.children[0].value == "eval");
            var isJscexCompile = (node.children[1].children[0].children[0].getSource() == "Jscex.compile");

            if (isEval && isJscexCompile) {

                var end = node.end - 1;
                while (this._code[++end] != ')');
                while (this._code[++end] != ')');

                this._results.push({
                    start: node.start,
                    end: end,
                    builderName: node.children[1].children[0].children[1].children[0].value,
                    funcCode: node.children[1].children[0].children[1].children[1].getSource()
                });

                return;
            }
        } catch (ex) { }

        this._visitChildren(node);
    },

    _getToken: function (node) {
        return Narcissus.definitions.tokens[node.type];
    },

    _visit: function (node) {
        if (!node) return;

        var token = this._getToken(node);
        switch (token) {
            case "CALL":
                this._visitCall(node);
                break;
            case "SCRIPT":
            case "LIST":
            case "var":
            case "BLOCK":
            case "INDEX":
            case "OBJECT_INIT":
            case "ARRAY_INIT":
            case ".":
            case ">":
            case "<":
            case ">=":
            case "<=":
            case "=":
            case "++":
            case "--":
            case "!":
            case "+":
            case "-":
            case "*":
            case "/":
            case "?":
                this._visitChildren(node);
                break;
            case "IDENTIFIER":
                // this._visitChildren(node)
                this._visit(node.initializer);
                break;
            case "NUMBER":
            case "STRING":
            case "break":
            case "null":
            case "true":
            case "false":
                break;
            case ";":
                this._visit(node.expression);
                break;
            case "try":
                this._visit(node.tryBlock);
                this._visitAll(node.catchClauses);
                break;
            case "catch":
                this._visit(node.block);
                break;
            case "if":
                this._visit(node.thenPart);
                this._visit(node.elsePart);
                break;
            case "for":
                this._visit(node.setup);
                this._visit(node.condition);
                this._visit(node.update);
                this._visit(node.body);
                break;
            case "while":
            case "do":
            case "function":
                this._visit(node.body);
                break;
            case "return":
                this._visit(node.value);
                break;
            default:
               debugger;
               throw new Error("Do not support token: " + token);
        }
    },

    extract: function (ast) {
        this._results = [];
        this._code = ast.getSource();
        this._visit(ast);
        return this._results;
    }
};

if (typeof exports != "undefined") {
    exports.extract = function (ast) {
        return (new JscexExtractor()).extract(ast);
    }
}
