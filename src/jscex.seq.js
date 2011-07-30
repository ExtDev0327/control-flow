Jscex.Seq = { };

(function () {

    var SeqBuilder = function () { }

    var Iterator = Jscex.Seq.Iterator = function (delegate) {
        this._delegate = delegate;
    }
    Iterator.prototype.moveNext = function () {

        var step = this._delegate();
        if (step) {
            this._delegate = step.nextDelegate;
            this.current = step.item;
            return true;
        } else {
            delete this._delegate;
            delete this.current;
            return false;
        }
    }

    var TempStep = null;

    SeqBuilder.prototype = {
        "binder": "$yield",

        "Start": function (_this, step) {

            var delegate = function () {
                TempStep = null;
                step.next(_this, function () { });

                var tempStep = TempStep;
                TempStep = null
                return tempStep;
            }

            return new Jscex.Seq.Iterator(delegate);
        },

        "Bind": function (value, generator) {
            return {
                "next": function (_this, callback) {
                    TempStep = {
                        item: value,
                        nextDelegate: function () {
                            TempStep = null;
                            callback("normal");

                            var tempStep = TempStep
                            TempStep = null;
                            return tempStep;
                        }
                    };
                }
            };
        }
    }

    for (var m in Jscex.builderBase) {
        SeqBuilder.prototype[m] = Jscex.builderBase[m];
    }

    Jscex.builders["seq"] = new SeqBuilder();

})();
