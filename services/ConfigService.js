'use strict';


var ini = require('ini');
var fs = require('fs');
var Path = require('path');
var rcPath = Path.join(process.env.HOME || process.env.USERPROFILE, ".restskillrc");

function getSettings() {
    try {
        return ini.parse(fs.readFileSync(rcPath, 'utf-8'));
    } catch (ignore) {
        return {};
    }
}

function updateSettings(settings) {
    fs.writeFileSync(rcPath, ini.stringify(settings));
}

function isAuthenticated() {
    var settings = getSettings();
    return settings.user && settings.user.username && settings.user.password;
}

module.exports = {
    getSettings,
    updateSettings,
    isAuthenticated
};