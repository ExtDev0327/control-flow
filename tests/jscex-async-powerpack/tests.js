"use strict";

var exports = (typeof window === "undefined") ? module.exports : window;

exports.setupTests = function (Jscex) {

    Jscex.logger.level = Jscex.Logging.Level.OFF;

    var Task = Jscex.Async.Task;

    Task.success = function (result) {
        return Task.create(function (t) {
            t.complete("success", result);
        });
    };

    Task.failure = function (error) {
        return Task.create(function (t) {
            t.complete("failure", error);
        });
    }

    Task.delay = function (timeout, error, result) {
        return Task.create(function (t) {
            return setTimeout(function () {
                if (error) {
                    t.complete("failure", error);
                } else {
                    t.complete("success", result);
                }
            }, timeout);
        });
    }

    describe("Task", function () {

        describe("#whenAll()", function () {

            it("should directly return an empty object with an empty object input", function () {
                Task.whenAll({ }).start().result.should.eql({ });
            });

            it("should directly return an empty array with an empty array input", function () {
                Task.whenAll([]).start().result.should.eql([]);
            });

            it("should directly return the result if the task is already succeeded", function () {
                var t = Task.success(100).start();
                Task.whenAll(t).start().result[0].should.equal(100);
            });

            it("should directly return the errors if the tasks are already faulted", function () {
                var errors = [ "error0", "error1" ];

                var t0 = Task.failure(errors[0]).start();
                var t1 = Task.failure(errors[1]).start();

                var aggErr = Task.whenAll(t0, t1).start().error;
                aggErr.children.length.should.equal(2);
                aggErr.children[0].should.equal(errors[0]);
                aggErr.children[1].should.equal(errors[1]);
            });

            it("should return an array of results with a serial of tasks", function (done) {
                this.timeout(100);

                var t0 = Task.delay(0, null, 1);
                var t1 = Task.delay(0, null, 2);

                Task.whenAll(t0, t1).start().addEventListener("success", function () {
                    this.result.should.eql([1, 2]);
                    done();
                });
            });

            it("should return an array of result with an array input", function (done) {
                this.timeout(100);

                var t0 = Task.delay(0, null, 1);
                var t1 = Task.delay(0, null, 2);

                Task.whenAll([t0, t1]).start().addEventListener("success", function () {
                    this.result.should.eql([1, 2]);
                    done();
                });
            });

            it("should return a hash of results with a hash input", function (done) {
                this.timeout(100);

                var t0 = Task.delay(0, null, 1);
                var t1 = Task.delay(0, null, 2);

                Task.whenAll({ r0: t0, r1: t1 }).start().addEventListener("success", function () {
                    this.result.should.eql({ r0: 1, r1: 2 });
                    done();
                });
            });

            it("should return the error when one of the task in array is failed", function (done) {
                this.timeout(100);

                var error = { };
                var t0 = Task.delay(0, error, null);
                var t1 = Task.delay(0, null, 1);

                Task.whenAll(t0, t1).start().addEventListener("failure", function () {
                    this.error.children.length.should.equal(1);
                    this.error.children[0].should.equal(error);
                    done();
                });
            });

            it("should return the error when one of the task in hash is failed", function (done) {
                this.timeout(100);

                var error = { };
                var t0 = Task.delay(0, null, 1);
                var t1 = Task.delay(0, error, null);

                Task.whenAll({ r0: t0, r1: t1 }).start().addEventListener("failure", function () {
                    this.error.children.length.should.equal(1);
                    this.error.children[0].should.equal(error);
                    done();
                });
            });

            it("should return the errors when both tasks in array are failed", function (done) {
                this.timeout(100);

                var errors = [ "error1", "error2" ];
                var t0 = Task.delay(0, errors[0]);
                var t1 = Task.delay(0, errors[1]);

                Task.whenAll(t0, t1).start().addEventListener("failure", function () {
                    this.error.children.should.eql(errors);
                    done();
                });
            });

            it("should return the errors when both tasks in hash are failed", function (done) {
                this.timeout(100);

                var errors = [ "error1", "error2" ];
                var t0 = Task.delay(0, errors[0]);
                var t1 = Task.delay(0, errors[1]);

                Task.whenAll({ t0: t0, t1: t1 }).start().addEventListener("failure", function () {
                    this.error.children.should.eql(errors);
                    done();
                });
            });

            it("should complete when both tasks in array are completed even the first one is failed", function (done) {
                this.timeout(100);

                var error = { };
                var t0 = Task.delay(0, error, null);
                var t1 = Task.delay(1, null, 10);

                Task.whenAll(t0, t1).start().addEventListener("failure", function () {
                    t0.status.should.equal("faulted");
                    t0.error.should.equal(error);

                    t1.status.should.equal("succeeded");
                    t1.result.should.equal(10);

                    this.error.children.length.should.equal(1);
                    this.error.children[0].should.equal(error);

                    done();
                });
            });

            it("should complete when both tasks in hash are completed even the first one is failed", function (done) {
                this.timeout(100);

                var error = { };
                var t0 = Task.delay(0, error, null);
                var t1 = Task.delay(1, null, 10);

                Task.whenAll({t0: t0, t1: t1}).start().addEventListener("failure", function () {
                    t0.status.should.equal("faulted");
                    t0.error.should.equal(error);

                    t1.status.should.equal("succeeded");
                    t1.result.should.equal(10);

                    this.error.children.length.should.equal(1);
                    this.error.children[0].should.equal(error);

                    done();
                });
            });

            it("should return the object graph the same as the input tasks", function (done) {
                this.timeout(100);

                var input = {
                    dataList: [
                        Task.delay(0, null, 1),
                        {
                            hello: Task.delay(0, null, "hello"),
                            world: Task.delay(0, null, "world"),
                            empty: 10
                        },
                        Task.delay(0, null, 2)
                    ],
                    value: Task.delay(0, null, 3),
                    empty: { }
                };

                Task.whenAll(input).start().addEventListener("success", function () {
                    this.result.should.eql({
                        dataList: [
                            1,
                            {
                                hello: "hello",
                                world: "world",
                                empty: { }
                            },
                            2
                        ],
                        value: 3,
                        empty: { }
                    });
                    done();
                });
            });
        });
    });
}