const fs = require('fs');
const Path = require('path');
const cp = require('child_process');

module.exports = {
  setVariable,
};

const services = {
  postgres: {
    name: 'POSTGRES_URL',
    template: 'postgres://postgres:@{ip}:5432/postgres'
  }
};

function _getDockerIp() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return 'localhost';
  }
  const lines = cp.execSync('docker-machine ls --filter state=running').toString().trim().split('\n');
  if (lines.length === 1) {
    throw new Error('Docker machine is not running! You can start it by `docker-machine start default`');
  }
  const machineLine = lines[1]; // first line is header
  const machineName = machineLine.split(' ')[0].trim();
  return cp.execSync('docker-machine ip ' + machineName).toString().trim();
}

function* setVariable(directory, name) {
  _getDockerIp();
  const rcConfig = Path.join(directory, 'restcoder.yaml');
  const env = Path.join(directory, '.env');
  if (!fs.existsSync(rcConfig)) {
    throw new Error('File restcoder.yaml does not exist! You must execute this command under the root directory of your project.');
  }
  const service = services[name.toLowerCase()];
  if (!service) {
    throw new Error(`${name} is not supported`);
  }
  if (!fs.existsSync(env)) {
    console.log('.env file does not exist. Creating...');
  }
  let envContent = fs.readFileSync(env, 'utf8');
  envContent = envContent.split('\n').filter((line) => {
    // remove existing setting
    const trimComments = line.split('#')[0];
    const varName = trimComments.split('=')[0].trim();
    return varName !== service.name;
  }).join('\n');
  const value = service.template.replace('{ip}', _getDockerIp());
  const line = `${service.name}=${value}`;
  envContent += '\n' + line;
  fs.writeFileSync(env, envContent.trim());
  console.log('Added to .env:');
  console.log('   ' + line);
}
