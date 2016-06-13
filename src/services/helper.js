const Path = require('path');
const fs = require('fs');
const YAML = require('yamljs');
const os = require('os');
const platform  = os.platform();

module.exports = {
  parseProcfile,
  parseYaml,
};

function _parseFile(directory) {
  try {
    if (platform === 'win32') {
      const winPath = Path.join(directory, "Procfile");
      if (fs.existsSync(winPath)) {
        return fs.readFileSync(winPath, 'utf8');
      }
    }
    return fs.readFileSync(Path.join(directory, "Procfile"), 'utf8');
  } catch (ignore) {
    throw new Error("Procfile is missing!");
  }
}

function parseProcfile(directory) {
  var procfile = _parseFile(directory);
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

function parseYaml(directory) {
  var restcoderYaml;
  try {
    restcoderYaml = fs.readFileSync(Path.join(directory, "restcoder.yaml"), 'utf8');
  } catch (ignore) {
    throw new Error("restcoder.yaml is missing! Use `restcoder init` to generate it.");
  }
  const obj = YAML.parse(restcoderYaml);
  if (!obj.problemId) {
    throw new Error("File restcoder.yaml is malformed. The `problemId` property is missing.");
  }
  if (!obj.language) {
    throw new Error("File restcoder.yaml is malformed. The `language` property is missing.");
  }
  if (!obj.instances) {
    throw new Error("File restcoder.yaml is malformed. The `instances` property is missing.");
  }
  if (!obj.env) {
    obj.env = [];
  }
  
  return obj;
}