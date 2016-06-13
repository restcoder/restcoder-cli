'use strict';


const ini = require('ini');
const fs = require('fs');
const Path = require('path');
const rcPath = Path.join(process.env.HOME || process.env.USERPROFILE, '.restcoderrc');

module.exports = {
  getSettings,
  updateSettings,
  isAuthenticated,
  getToken
};

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
  const settings = getSettings();
  return settings.user && settings.user.username && settings.user.token;
}

function getToken() {
  const settings = getSettings();
  return settings.user.token;
}
