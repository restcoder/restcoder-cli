'use strict';

const baseUrl = process.env.RESTCODER_CLI_LOCAL_MODE ? "http://localhost:3500" : 'http://api.restcoder.com';
const request = require('superagent-promise')(require('superagent'), Promise);
const ConfigService = require("./ConfigService");

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
    e.message = "API error: " + e.message;
    throw e;
  }
}

function* login(username, password) {
  var res = yield _wrap(request.post(`${baseUrl}/api/v1/login`).send({ username, password }));
  return res.body;
}


function* getCodeTemplate(language) {
  var res = yield _wrap(request.get(`${baseUrl}/api/v1/code-templates/${language}`));
  return res.body;
}

function* getProblem(problemId) {
  var res = yield _wrap(request.get(`${baseUrl}/api/v1/problems/${problemId}`));
  return res.body;
}

function* getServices() {
  var res = yield _wrap(request.get(`${baseUrl}/api/v1/services`));
  return res.body;
}

function* submitCode(problemId, submission, file) {
  var req = request
    .post(`${baseUrl}/api/v1/problems/${problemId}/submit`)
    .set("authorization", `Bearer ${ConfigService.getToken()}`)
    .attach('file', file, "app.zip")
    .field('submission', JSON.stringify(submission));
  var res = yield _wrap(req);
  return res.body;
}
