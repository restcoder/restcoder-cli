'use strict';


var status = require('node-status');
var console = status.console();


//var total = status.addItem("total", {
//    color:'cyan',
//    count: 25,
//    label: "total"
//});

var failed = status.addItem("failed", {
    color: 'red',
    label: 'failed'
});

var passed = status.addItem("passed", {
    color: 'green',
    label: 'passed'
});

var progress = status.addItem({
    name: 'testing',
    color: 'cyan',
    type: [
        function (item) {
            return `${item.count} of 25`;
        }, 'bar', 'percentage'],
})


console.log("Testing...")

var it = 500;
var times = 0;
var runner = function () {
    times++;
    progress.inc();

    if (times % 15 === 14) {
        console.log("TEST", times, "FAIL".red);
        failed.inc();
        status.stop();
        return;
    } else {
        console.log("TEST", times, "OK".green);
        passed.inc();
    }
    //if (times % 2 === 0)
    //    pizza.inc()
    //if (times % 10 === 0) {
    //    console.log("Logging something arbirtrary", total.count, err_count.count)
    //}
    if (times < 25) {
        setTimeout(runner, it)
    } else {
        status.stop();
    }
}

status.start({invert: false});
runner()