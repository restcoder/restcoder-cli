'use strict';

const _ = require("underscore");
const fs = require('fs');
const Path = require('path');
const mkdirp = require('mkdirp');
const ignore = require('ignore');
const AdmZip = require('adm-zip');
const io = require('socket.io-client');
const ApiService = require("./APIService");
const ConfigService = require("../services/ConfigService");

const SOCKET_URL = process.env.RESTCODER_CLI_LOCAL_MODE ? "http://localhost:3500/cli" : 'http://api.restcoder.com/cli';
const MAX_FILES = 100;
const MAX_FILE_SIZE_KB = 200;


function _getFiles(dir, currentFiles) {
  currentFiles = currentFiles || [];
  var files = fs.readdirSync(dir);
  files.forEach(fileName => {
    var name = dir + '/' + fileName;
    if (fs.statSync(name).isDirectory()) {
      _getFiles(name, currentFiles);
    } else {
      currentFiles.push(name);
    }
  });
  return currentFiles;
}

function* initCode(directory, problemId, language, services) {
  var items = fs.readdirSync(directory);
  if (items.length) {
    throw new Error("Directory is not empty!");
  }
  var result = yield ApiService.getCodeTemplate(language);
  _.each(result.files, file => {
    var fullPath = Path.join(directory, file.path);
    mkdirp.sync(Path.dirname(fullPath));
    fs.writeFileSync(fullPath, file.content, 'utf8');
  });
  var codeConfig = { problemId, language, services };
  fs.writeFileSync(Path.join(directory, ".restcoderrc"), JSON.stringify(codeConfig, null, 4), 'utf8');
}

function* submit(directory) {
  var codeConfig;
  try {
    codeConfig = fs.readFileSync(Path.join(directory, ".restcoderrc"), 'utf8');
  } catch (ignore) {
    throw new Error("Invalid directory. File .restcoderrc is missing.");
  }
  try {
    codeConfig = JSON.parse(codeConfig);
  } catch (ignore) {
    throw new Error("File .restcoderrc is malformed.");
  }
  if (!codeConfig.problemId) {
    throw new Error("File .restcoderrc is malformed. The problemId property is missing.");
  }
  if (!codeConfig.language) {
    throw new Error("File .restcoderrc is malformed. The language property is missing.");
  }
  var version = detectVersion(codeConfig.language, directory);
  var processes = parseProcfile(directory);
  console.log("Packing source code...");
  var ignoreFile = "";
  try {
    ignoreFile = fs.readFileSync(Path.join(directory, ".restcoderignore"), 'utf8');
  } catch (ignore) {

  }
  var ig = ignore({}).addPattern(ignoreFile.split("\n"));
  var files = _getFiles(directory).filter(ig.createFilter());
  if (!files.length) {
    throw new Error("0 files to upload");
  }
  console.log(`Found ${files.length} file(s)`);
  if (files.length > MAX_FILES) {
    throw new Error(`Cannot upload more than ${MAX_FILES} files`);
  }
  var zip = new AdmZip();
  files.forEach(fullPath => {
    var relativePath = fullPath.replace(directory, "").replace(/^[\/\\]/, "");
    var stat = fs.statSync(fullPath);
    if (stat.size / 1024 > MAX_FILE_SIZE_KB) {
      throw new Error(`file ${fullPath} has size ${stat.size / 1024}KB. Max allowed size is ${MAX_FILE_SIZE_KB}KB.`);
    }
    zip.addFile(relativePath, fs.readFileSync(fullPath));
  });
  console.log(_fixMessageColors("Packing source code... Success"));

  var submission = {
    language: {
      name: codeConfig.language,
      version: version
    },
    processes: processes,
    services: codeConfig.services
  };

  console.log("Submitting source code...");
  var result = yield ApiService.submitCode(codeConfig.problemId, submission, zip.toBuffer());
  console.log(_fixMessageColors("Submitting source code... Success"));
  console.log(('Problem: '.bold + result.problemName).yellow);
  console.log(('Language: '.bold + result.language + '@' + result.languageVersion).yellow);
  console.log(('Services: '.bold + result.usedServices).yellow);

  console.log("Waiting for tester...");
  var prefix = "tester: ".cyan;

  yield new Promise(function (resolve) {
    var socket = io(SOCKET_URL + "?token=" + ConfigService.getToken());
    socket.on("connect", function () {
      socket.emit("join", { submissionId: result.submissionId });
    });

    socket.on("progress", function (data) {
      switch (data.type) {
        case "PREPARING":
          console.log(prefix + "Preparing...");
          break;
        case "INSTALL":
          console.log(prefix + "Installing dependencies...");
          break;
        case "INSTALL_OK":
          console.log(prefix + _fixMessageColors("Installing dependencies... Success"));
          break;
        case "INSTALL_LOG":
          //TODO
          break;
        case "READY":
          console.log(prefix + "Starting apps. Waiting for 'READY'...");
          break;
        case "READY_OK":
          console.log(prefix + _fixMessageColors("Starting apps. Waiting for 'READY'... Success"));
          break;
        case "READY_TIMEOUT":
          console.log(prefix + "Timeout! Your application didn't write READY to stdout.".red);
          console.log(prefix + "Result: " + "FAIL".red);
          resolve();
          break;
        case "BEFORE_START":
          console.log(prefix + "Initializing unit tests...");
          break;
        case "START":
          console.log(prefix + `Running ${data.totalTests.toString().cyan} test(s)`);
          break;
        case "TEST_RESULT":
          var test = data.data;
          switch (test.result) {
            case "PENDING":
              console.log(prefix + test.name + ": running...");
              break;
            case "FAIL":
              console.log(prefix + test.name + ": " + "FAIL".red);
              console.log(prefix + `Reason: ${test.userErrorMessage}`.red);
              break;
            case "PASS":
              console.log(prefix + test.name + ": " + "PASS".green);
              break;
          }
          break;
        case "OPERATION_ERROR":
          console.log(prefix + (`Error: ${data.msg} (ref: ${data.referId})`).red);
          if (data.stdout) {
            console.log(prefix + `See stdout log: ` + data.stdout);
          }
          if (data.stderr) {
            console.log(prefix + `See stderr log: ` + data.stderr);
          }
          resolve();
          break;
        case "ERROR":
          console.log(prefix + (`Internal Server Error (ref: ${data.referId})`).red);
          resolve();
          break;
        case "END":
          console.log(prefix + "Result: " + (data.passed ? "PASS".green : "FAIL".red));
          resolve();
          break;
      }
    });
  });
}


function _fixMessageColors(msg) {
  msg = msg.replace("Success", "Success".green);
  return msg;
}

function parseProcfile(directory) {
  var procfile;
  try {
    procfile = fs.readFileSync(Path.join(directory, "Procfile"), 'utf8');
  } catch (ignore) {
    throw new Error("Procfile is missing!");
  }
  var processes = [];
  procfile.split("\n").forEach(line => {
    line = line.trim();
    if (!line) {
      return;
    }
    var split = line.split(":");
    var name = split.shift();
    var command = split.join(":");
    processes.push({ name, command });
  });
  if (!processes.length) {
    throw new Error("Procfile is empty");
  }
  return processes;
}

function detectVersion(language, directory) {
  let exec;
  switch (language) {
    case "nodejs":
      let packagejs;
      try {
        packagejs = fs.readFileSync(Path.join(directory, "package.json"), 'utf8');
      } catch (ignore) {
        throw new Error("package.json is missing!");
      }
      try {
        packagejs = JSON.parse(packagejs);
      } catch (ignore) {
        throw new Error("Cannot parse package.json. Invalid JSON object.");
      }
      if (packagejs.engines && packagejs.engines.node) {
        return packagejs.engines.node;
      }
      console.log("WARN!".yellow, "nodejs version is not defined in package.json. Latest version will be used.");
      return "*";
    case "ruby":
      let gemfile;
      try {
        gemfile = fs.readFileSync(Path.join(directory, "gemfile"), 'utf8');
      } catch (ignore) {
        throw new Error("Gemfile is missing!");
      }
      exec = /^ruby '(.+?)'/m.exec(gemfile);
      if (exec) {
        return exec[1];
      } else {
        console.log("WARN!".yellow, "ruby version is not defined in Gemfile. Latest version will be used.");
      }
      return "*";
    case "python":
      let runtime;
      try {
        runtime = fs.readFileSync(Path.join(directory, "runtime.txt"), 'utf8');
      } catch (ignore) {
        throw new Error("runtime.txt is missing!");
      }
      exec = /^python-(.+?)$/m.exec(runtime);
      if (exec) {
        return exec[1];
      } else {
        console.log("WARN!".yellow, "python version is not defined in runtime.txt. 2.7 version will be used.");
      }
      return "2.7";
    case "java":
      let properties;
      try {
        properties = fs.readFileSync(Path.join(directory, "system.properties"), 'utf8');
      } catch (ignore) {
        throw new Error("system.properties is missing!");
      }
      exec = /^java\.runtime\.version=(.+?)$/m.exec(properties);
      if (exec) {
        return exec[1];
      } else {
        console.log("WARN!".yellow, "java version is not defined in system.properties. 1.8 version will be used.");
      }
      return "1.8";
    case "dotnet":
      return '*';
    default:
      throw new Error("Unsupported language: " + language);
  }
}


module.exports = {
  initCode,
  submit
};