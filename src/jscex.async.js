/****************************
 * type Async = {
 *     start: function(function (type, value, target) { ... }) { ... }
 *     cancel: function() { ... }
 * }
 ****************************/

Jscex.AsyncBuilder = function () { }

Jscex.AsyncBuilder.prototype.Bind = function (task, onNormal) {
    return {
        start: function (callback) {
            task.start.call(this, function (type, value, target) {
                if (type == "normal") {
                    try {
                        var nextTask = onNormal.call(this, value);
                        nextTask.start.call(this, callback);
                    } catch (ex) {
                        callback.call(this, "throw", ex);
                    }
                } else {
                    callback.call(this, type, value, target);
                }
            });
        }
    };
};

Jscex.AsyncBuilder.prototype.Loop = function (condition, update, body) {
    return {
        start: function (callback) {
            var loop = function (result, skipUpdate) {
                try {
                    if (update && !skipUpdate) {
                        update.call(this);
                    }

                    if (condition.call(this)) {
                        body.start.call(this, function (type, value, target) {
                            if (type == "throw") {
                                callback.call(this, "throw", value);
                            } else {
                                loop.call(this);
                            }
                        });
                    } else {
                        callback.call(this, "normal", result);
                    }

                } catch (ex) {
                    callback.call(this, "throw", ex);
                }
            }
            
            loop.call(this, null, true);
        }
    };
}

Jscex.AsyncBuilder.prototype.Start = function (_this, generator) {
    return {
        start: function (callback) {
            try {
                var task = generator.call(_this);
                task.start.call(_this, callback);
            } catch (ex) {
                callback.call(_this, "throw", ex);
            }
        }
    };
};

Jscex.AsyncBuilder.prototype.Delay = function (generator) {
    return {
        start: function (callback) {
            try {
                var task = generator.call(this);
                task.start.call(this, callback);
            } catch (ex) {
                callback.call(this, "throw", ex);
            }
        }
    };
};

Jscex.AsyncBuilder.prototype.Combine = function (t1, t2) {
    return {
        start: function (callback) {
            t1.start.call(this, function (type, value, target) {
                if (type == "normal") {
                    try {
                        t2.start.call(this, callback);
                    } catch (ex) {
                        callback.call(this, "throw", ex);
                    }
                } else {
                    callback.call(this, type, value, target);
                }
            });
        }
    };
}

Jscex.AsyncBuilder.prototype.Return = function (result) {
    return {
        start: function (callback) {
            callback.call(this, "normal", result);
        }
    };
};

Jscex.AsyncBuilder.prototype.binder = "$await";

var $async = new Jscex.AsyncBuilder();

Jscex.Async = {
    sleep: function (delay) {
        return {
            start: function (callback) {
                var _this = this;
                setTimeout(
                    function () { callback.call(_this, "normal"); },
                    delay);
            }
        };
    },
    
    startImmediately: function (task) {
        task.start(function () {});
    },
    
    start: function(task) {
        setTimeout(function() {
            Jscex.Async.startImmediately(task);
        }, 0);
    },
    
    // only support "normal"
    parallel: function(tasks) {
        var tasksClone = [];
        for (var i = 0; i < tasks.length; i++) {
            tasksClone.push(tasks[i]);
        }
        
        return {
            start: function (callback) {
                var done = 1;
                var results = [];
                
                var checkFinished = function (index, r) {
                    if (arguments.length > 0) {
                        results[index] = r;
                    }

                    done--;
                    if (done <= 0) {
                        callback("normal", results);
                    }
                }
                
                var callbackFactory = function (index) {
                    return function (type, value, target) {
                        checkFinished(index, value);
                    };
                }
                
                for (var i = 0; i < tasksClone.length; i++) {
                    done++;
                    tasksClone[i].start(callbackFactory(i));
                }
                
                checkFinished();
            }
        };
    },

    onEventAsync: function (ele, ev) {
        return {
            start: function (callback) {
                var _this = this;
                var eventName = "on" + ev;

                var handler = function(ev) {
                    ele[eventName] = null;
                    callback.call(_this, "normal", ev);
                }

                ele[eventName] = handler;
            }
        };
    }
};

