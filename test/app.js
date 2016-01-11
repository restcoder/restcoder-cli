'use strict';


//put all your env variables in env_settings file
if (process.env.RESTSKILL_ENV !== "1") {
    require('dotenv').load({path: "env_settings"});
}

var express = require('express');
var app = express();

//your app goes here

app.listen(process.env.PORT, function () {
    console.log('READY');
});