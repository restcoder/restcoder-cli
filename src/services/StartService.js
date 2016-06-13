'use strict';

const helper = require('./helper');
const Path = require('path');
const events = require('events');
const _ = require('underscore');
const fork = require('child_process').fork;
const startProcesses = require('foreman/lib/proc').start;

const display = require('foreman/lib/console').Console;
display.wrapline = process.stdout.columns - display.padding - 7;
display.trimline = 0;


// Exports
module.exports = {
  start
};

const emitter = new events.EventEmitter();

function _createProxy(port, size) {
  fork(Path.join(__dirname, 'proxy.js'), [], {
    env: {
      HOST: 'localhost',
      PORT: port,
      UPSTREAM_HOST: 'localhost',
      UPSTREAM_PORT: port + 1,
      UPSTREAM_SIZE: size
    }
  });
  display.Alert('Starting Proxy Server [%s] %s -> (%d-%d)', 'web', port, port + 1, port + size);
}

function start(port, directory) {
  const problemConfig = helper.parseYaml(directory);
  const processes = helper.parseProcfile(directory);
  const currentProcess = _.pluck(processes, 'name');
  const requiredProcess = _.keys(problemConfig.instances);
  const missing = _.difference(requiredProcess, currentProcess);
  const extra = _.difference(currentProcess, requiredProcess);

  if (missing.length) {
    throw new Error(`Process "${missing[0]}" is missing in your Procfile`);
  }
  if (extra.length) {
    throw new Error(`Process "${extra[0]}" is not allowed. Please remove it from your Procfile`);
  }
  const processMap = {};
  _.each(processes, (proc) => {
    processMap[proc.name] = proc.command;
  });

  const envConfig = require('dotenv').config({
    path: Path.join(directory, '.env'),
    silent: true
  });

  problemConfig.env.forEach((name) => {
    if (!process.env[name]) {
      if (envConfig) {
        throw new Error(`Environmental variable "${name}" is not set. Please add it to the .env file.`);
      }
      throw new Error(`Environmental variable "${name}" is not set. Did you forget to create an .env file?`);
    }
  });
  if (problemConfig.env.length) {
    console.log('Using environmental variables:');
    problemConfig.env.forEach((name) => {
      console.log(`${name}=${process.env[name]}`);
    });
  }

  let webPort = port;
  if (problemConfig.instances.web > 1) {
    webPort++;
    _createProxy(port, problemConfig.instances.web);
  } else {
    display.Alert('Starting [web] ' + webPort);
  }

  startProcesses(processMap, problemConfig.instances, envConfig, webPort, emitter);
}
