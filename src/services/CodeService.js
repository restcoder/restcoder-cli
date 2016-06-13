'use strict';

const _ = require('underscore');
const fs = require('fs');
const Path = require('path');
const mkdirp = require('mkdirp');
const ignore = require('ignore');
const inquirer = require('inquirer');
const AdmZip = require('adm-zip');
const io = require('socket.io-client');
const ApiService = require('./APIService');
const ConfigService = require('./ConfigService');
const helper = require('./helper');
const APIService = require('./APIService');

const SOCKET_URL = process.env.RESTCODER_CLI_LOCAL_MODE ? 'http://localhost:3500/cli' : 'https://api.restcoder.com/cli';
const MAX_FILES = 100;
const MAX_FILE_SIZE_KB = 100;


const supportedPlatforms = [
  { name: 'Node.js', value: 'nodejs' },
  { name: 'Python', value: 'python' },
  { name: 'Ruby', value: 'ruby' },
  { name: 'Java', value: 'java' },
  { name: '.NET', value: 'dotnet' },
];

prompt.message = '';
prompt.delimiter = '';


function _prompt(questions) {
  return new Promise((resolve) => {
    inquirer.prompt(questions, (answers) => {
      resolve(answers);
    });
  });
}

function _getFiles(dir, currentFiles) {
  currentFiles = currentFiles || [];
  const files = fs.readdirSync(dir);
  files.forEach(fileName => {
    const name = dir + '/' + fileName;
    if (fs.statSync(name).isDirectory()) {
      _getFiles(name, currentFiles);
    } else {
      currentFiles.push(name);
    }
  });
  return currentFiles;
}

function* initCode(problemId, directoryName) {
  console.log('Initializing source code...');
  const problem = yield APIService.getProblem(problemId);

  const directory = Path.join(process.cwd(), directoryName || problem.slug);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory);
  }
  const items = fs.readdirSync(directory);
  if (items.length) {
    throw new Error('Directory is not empty!');
  }

  const settings = ConfigService.getSettings();
  const answers = yield _prompt([{
    type: 'list',
    name: 'language',
    default: settings.defaultLanguage,
    message: 'Choose language',
    choices: supportedPlatforms
  }]);

  const language = answers.language;
  settings.defaultLanguage = answers.language;
  ConfigService.updateSettings(settings);
  const selectServices = problem.runtime.services.select;
  const pickedServices = {};
  if (selectServices) {
    const services = yield APIService.getServices();
    const servicesMap = _.indexBy(services, 'id');
    yield _.map(selectServices, (value, name) => function*() {
      if (_.isArray(value)) {
        const serviceAnswer = yield _prompt([{
          type: 'list',
          name: 'result',
          message: 'Choose ' + name,
          choices: value.map((item) => ({
            name: `${servicesMap[item].description} (${servicesMap[item].version})`,
            value: item
          }))
        }]);
        pickedServices[name] = serviceAnswer.result;
      }
    });
  }

  const result = yield ApiService.getCodeTemplate(language);
  _.each(result.files, file => {
    const fullPath = Path.join(directory, file.path);
    mkdirp.sync(Path.dirname(fullPath));
    fs.writeFileSync(fullPath, file.content, 'utf8');
  });
  const codeConfig = { problemId, language, services: selectServices };
  fs.writeFileSync(Path.join(directory, '.restcoderrc'), JSON.stringify(codeConfig, null, 4), 'utf8');

  console.log('SUCCESS!'.green);
}

function* submit(directory) {
  let codeConfig;
  try {
    codeConfig = fs.readFileSync(Path.join(directory, '.restcoderrc'), 'utf8');
  } catch (e) {
    throw new Error('Invalid directory. File .restcoderrc is missing.');
  }
  try {
    codeConfig = JSON.parse(codeConfig);
  } catch (e) {
    throw new Error('File .restcoderrc is malformed.');
  }
  if (!codeConfig.problemId) {
    throw new Error('File .restcoderrc is malformed. The problemId property is missing.');
  }
  if (!codeConfig.language) {
    throw new Error('File .restcoderrc is malformed. The language property is missing.');
  }
  const version = detectVersion(codeConfig.language, directory);
  const processes = helper.parseProcfile(directory);
  console.log('Packing source code...');
  let ignoreFile;
  try {
    ignoreFile = fs.readFileSync(Path.join(directory, '.restcoderignore'), 'utf8');
  } catch (e) {
    ignoreFile = '';
  }
  const ig = ignore({}).addPattern(ignoreFile.split('\n'));
  const files = _getFiles(directory).filter(ig.createFilter());
  if (!files.length) {
    throw new Error('0 files to upload');
  }
  console.log(`Found ${files.length} file(s)`);
  if (files.length > MAX_FILES) {
    throw new Error(`Cannot upload more than ${MAX_FILES} files`);
  }
  const zip = new AdmZip();
  files.forEach(fullPath => {
    const relativePath = fullPath.replace(directory, '').replace(/^[\/\\]/, '');
    const stat = fs.statSync(fullPath);
    if (stat.size / 1024 > MAX_FILE_SIZE_KB) {
      throw new Error(`file ${fullPath} has size ${stat.size / 1024}KB. Max allowed size is ${MAX_FILE_SIZE_KB}KB.`);
    }
    zip.addFile(relativePath, fs.readFileSync(fullPath));
  });
  console.log(_fixMessageColors('Packing source code... Success'));

  const submission = {
    language: {
      name: codeConfig.language,
      version
    },
    processes,
    services: codeConfig.services
  };

  console.log('Submitting source code...');
  const result = yield ApiService.submitCode(codeConfig.problemId, submission, zip.toBuffer());
  console.log(_fixMessageColors('Submitting source code... Success'));
  console.log(('Problem: '.bold + result.problemName).yellow);
  console.log(('Language: '.bold + result.language + '@' + result.languageVersion).yellow);
  console.log(('Services: '.bold + result.usedServices).yellow);

  console.log('Waiting for tester...');
  const prefix = 'tester: '.cyan;

  yield new Promise((resolve) => {
    const socket = io(SOCKET_URL + '?token=' + ConfigService.getToken());
    let test;
    socket.on('connect', () => {
      socket.emit('join', { submissionId: result.submissionId });
    });

    socket.on('progress', (data) => {
      switch (data.type) {
        case 'PREPARING':
          console.log(prefix + 'Preparing...');
          break;
        case 'INSTALL':
          console.log(prefix + 'Installing dependencies...');
          break;
        case 'INSTALL_OK':
          console.log(prefix + _fixMessageColors('Installing dependencies... Success'));
          break;
        case 'INSTALL_LOG':
          // TODO
          break;
        case 'READY':
          console.log(prefix + "Starting apps. Waiting for 'READY'...");
          break;
        case 'READY_OK':
          console.log(prefix + _fixMessageColors("Starting apps. Waiting for 'READY'... Success"));
          break;
        case 'READY_TIMEOUT':
          console.log(prefix + "Timeout! Your application didn't write READY to stdout.".red);
          console.log(prefix + 'Result: ' + 'FAIL'.red);
          resolve();
          break;
        case 'BEFORE_START':
          console.log(prefix + 'Initializing unit tests...');
          break;
        case 'START':
          console.log(prefix + `Running ${data.totalTests.toString().cyan} test(s)`);
          break;
        case 'TEST_RESULT':
          test = data.data;
          switch (test.result) {
            case 'PENDING':
              console.log(prefix + test.name + ': running...');
              break;
            case 'FAIL':
              console.log(prefix + test.name + ': ' + 'FAIL'.red);
              console.log(prefix + `Reason: ${test.userErrorMessage}`.red);
              break;
            case 'PASS':
              console.log(prefix + test.name + ': ' + 'PASS'.green);
              break;
            default:
              break;
          }
          break;
        case 'OPERATION_ERROR':
          console.log(prefix + (`Error: ${data.msg} (ref: ${data.referId})`).red);
          if (data.stdout) {
            console.log(prefix + 'See stdout log: ' + data.stdout);
          }
          if (data.stderr) {
            console.log(prefix + 'See stderr log: ' + data.stderr);
          }
          resolve();
          break;
        case 'ERROR':
          console.log(prefix + (`Internal Server Error (ref: ${data.referId})`).red);
          resolve();
          break;
        case 'END':
          console.log(prefix + 'Result: ' + (data.passed ? 'PASS'.green : 'FAIL'.red));
          resolve();
          break;
        default:
          break;
      }
    });
  });
}


function _fixMessageColors(msg) {
  msg = msg.replace('Success', 'Success'.green);
  return msg;
}


function detectVersion(language, directory) {
  let exec;
  let packagejs;
  let gemfile;
  let runtime;
  let properties;
  switch (language) {
    case 'nodejs':
      try {
        packagejs = fs.readFileSync(Path.join(directory, 'package.json'), 'utf8');
      } catch (e) {
        throw new Error('package.json is missing!');
      }
      try {
        packagejs = JSON.parse(packagejs);
      } catch (e) {
        throw new Error('Cannot parse package.json. Invalid JSON object.');
      }
      if (packagejs.engines && packagejs.engines.node) {
        return packagejs.engines.node;
      }
      console.log('WARN!'.yellow, 'nodejs version is not defined in package.json. Latest version will be used.');
      return '*';
    case 'ruby':
      try {
        gemfile = fs.readFileSync(Path.join(directory, 'gemfile'), 'utf8');
      } catch (e) {
        throw new Error('Gemfile is missing!');
      }
      exec = /^ruby '(.+?)'/m.exec(gemfile);
      if (exec) {
        return exec[1];
      }
      console.log('WARN!'.yellow, 'ruby version is not defined in Gemfile. Latest version will be used.');
      return '*';
    case 'python':
      try {
        runtime = fs.readFileSync(Path.join(directory, 'runtime.txt'), 'utf8');
      } catch (e) {
        throw new Error('runtime.txt is missing!');
      }
      exec = /^python-(.+?)$/m.exec(runtime);
      if (exec) {
        return exec[1];
      }
      console.log('WARN!'.yellow, 'python version is not defined in runtime.txt. 2.7 version will be used.');
      return '2.7';
    case 'java':
      try {
        properties = fs.readFileSync(Path.join(directory, 'system.properties'), 'utf8');
      } catch (e) {
        throw new Error('system.properties is missing!');
      }
      exec = /^java\.runtime\.version=(.+?)$/m.exec(properties);
      if (exec) {
        return exec[1];
      }
      console.log('WARN!'.yellow, 'java version is not defined in system.properties. 1.8 version will be used.');
      return '1.8';
    case 'dotnet':
      return '*';
    default:
      throw new Error('Unsupported language: ' + language);
  }
}


module.exports = {
  initCode,
  submit
};
