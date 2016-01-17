'use strict';

var _ = require("underscore");
var fs = require('fs');
var Path = require('path');
var ApiService = require("./APIService");
var mkdirp = require('mkdirp');
var ignore = require('ignore');
var AdmZip = require('adm-zip');
var MAX_FILES = 100;
var MAX_FILE_SIZE_KB = 200;


function _getFiles(dir, currentFiles){
    currentFiles = currentFiles || [];
    var files = fs.readdirSync(dir);
    files.forEach(fileName => {
        var name = dir + '/' + fileName;
        if (fs.statSync(name).isDirectory()){
            _getFiles(name, currentFiles);
        } else {
            currentFiles.push(name);
        }
    });
    return currentFiles;
}

function* initCode(directory, problemId, language) {
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
    var codeConfig = {problemId, language};
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
    var ignoreFile= "";
    try {
        ignoreFile = fs.readFileSync(Path.join(directory, ".restskill_ignore"), 'utf8');
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
            throw new Error(`file ${fullPath} has size ${stat.size/1024}KB. Max allowed size is ${MAX_FILE_SIZE_KB}KB.`);
        }
        zip.addFile(relativePath, fs.readFileSync(fullPath));
    });

    var submission = {
        language: {
            name: codeConfig.language,
            version: detectVersion(codeConfig.language, directory)
        },
        processes: parseProcfile(directory)
    };
    yield ApiService.submitCode(codeConfig.problemId, submission, zip.toBuffer());
}

function parseProcfile(directory) {
    var procfile;
    try {
        procfile = fs.readFileSync(Path.join(directory, "Procfile"), 'utf8');
    } catch (ignore) {
        throw new Error("Procfile is missing!");
    }
    var processes = [];
    procfile.split("\n", line => {
        line = line.trim();
        if (!line) {
            return;
        }
        var split = line.split(":");
        var name = split.shift();
        var command = split.join(":");
        processes.push({name, command});
    });
    return processes;
}

function detectVersion(language, directory) {
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
                throw new Error("Cannot package.json. Invalid JSON object.");
            }
            if (packagejs.engines && packagejs.engines.node) {
                return packagejs.engines.node;
            }
            console.log("WARN!".orange, "nodejs version is not defined in package.json. Latest version will be used.");
            return "*";
        default:
            throw new Error("Unsupported language: " + language);
    }
}


module.exports = {
    initCode,
    submit
};