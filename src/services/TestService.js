'use strict';
const Path = require('path');
const fs = require('fs');
const helper = require('./helper');
const spawnSync = require('child_process').spawnSync;
const tmp = require('tmp');

// Exports
module.exports = {
  test
};

function _createEnv(url) {
  const str = (
    `{
  "id": "c72fd33a-ae8d-1759-2f40-16881845c6c1",
  "name": "RestCoder",
  "values": [
    {
      "key": "URL",
      "value": "${url}",
      "type": "text",
      "enabled": true
    }
  ],
  "timestamp": 1465890570419,
  "synced": false,
  "syncedFilename": "",
  "team": null,
  "isDeleted": false
}`);
  const tmpData = tmp.fileSync();
  fs.writeFileSync(tmpData.fd, str, 'utf8');
  return tmpData.name;
}


function test(url, directory) {
  const problemConfig = helper.parseYaml(directory);
  const newmanPath = Path.join(__dirname, '../../node_modules/newman/bin/newman');
  const args = [
    '-u',
    'https://www.getpostman.com/collections/' + problemConfig.postmanCollectionId,
    '-e',
    _createEnv(url)
  ];
  spawnSync(newmanPath, args, {
    stdio: 'inherit'
  });
}