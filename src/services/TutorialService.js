'use strict';
const Path = require('path');
const fs = require('fs');

// Exports
module.exports = {
  init
};

function* init(directoryName) {
  const directory = Path.join(process.cwd(), directoryName || 'restcoder-tutorial');
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
  const sourceApp = (
`
var http = require('http');

http.createServer(function (req, res) {
  if (req.url === '/test') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'it works!' }))
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Route not found!');
  }
}).listen(process.env.PORT);

`);
  fs.writeFileSync(Path.join(directory, 'app.js'), sourceApp, 'utf8');

  const sourceProcfile = 'web: node app.js';
  fs.writeFileSync(Path.join(directory, 'Procfile'), sourceProcfile, 'utf8');


  const sourceYaml = (
`#
# Warning: this is a sample problem, you cannot submit it to RestCoder!
#
problemId: -1
language: nodejs
instances:
  web: 1
`);
  fs.writeFileSync(Path.join(directory, 'restcoder.yaml'), sourceYaml, 'utf8');
  console.log('Tutorial problem has been initialized successfully!'.green);
  console.log('Type ' + '$ cd restcoder-tutorial'.red + ' to change your current working directory');
  console.log('Type ' + ('$ restcoder start'.red) + ' to start a created application');
}
