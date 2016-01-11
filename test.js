'use strict';

//var ignore = require('ignore');
//var file = 
//`node_modules
//env_settings
//
//#ignore all files that start with a dot
//.*`;
//
//var ig = ignore({}).addPattern(file.split("\n"));
//
//var files = ["app.js", "node_modules", "env_settings", ".idea"];
//
//console.log(files.filter(ig.createFilter()));

var co = require("co");
var CodeService = require("./services/CodeService");

co(function* () {
    yield CodeService.initCode(__dirname + "/test", 100, "nodejs2");
}).catch(e => {
    console.log(e.stack);
    process.exit();
});
