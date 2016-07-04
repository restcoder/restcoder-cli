'use strict';

const baseUrl = process.env.RESTCODER_API_URL || (process.env.RESTCODER_CLI_LOCAL_MODE ? 'http://localhost:3500' : 'https://api.restcoder.com');
const request = require('superagent-promise')(require('superagent'), Promise);
const ConfigService = require('./ConfigService');

module.exports = {
  getCodeTemplate,
  login,
  submitCode,
  getProblem,
  getServices,
};

function* _wrap(req) {
  try {
    return yield req.end();
  } catch (e) {
    if (e.response && e.response.body.error) {
      e.message = e.response.body.error;
    }
    e.message = 'API error: ' + e.message;
    throw e;
  }
}

function* login(username, password) {
  const res = yield _wrap(request.post(`${baseUrl}/api/v1/login`).send({ username, password }));
  return res.body;
}


function* getCodeTemplate(language) {
  const res = yield _wrap(request.get(`${baseUrl}/api/v1/code-templates/${language}`));
  return res.body;
}

function* getProblem(problemId) {
  const res = yield _wrap(request.get(`${baseUrl}/api/v1/problems/${problemId}`));
  return res.body;
}

function* getServices() {
  const res = yield _wrap(request.get(`${baseUrl}/api/v1/services`));
  return res.body;
}

function* submitCode(problemId, submission, file) {
  const req = request
    .post(`${baseUrl}/api/v1/problems/${problemId}/submit`)
    .set('authorization', `Bearer ${ConfigService.getToken()}`)
    .attach('file', file, 'app.zip')
    .field('submission', JSON.stringify(submission));
  const res = yield _wrap(req);
  return res.body;
}
