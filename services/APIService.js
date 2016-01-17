'use strict';

const baseUrl = "http://localhost:3500";
const request = require('superagent-promise')(require('superagent'), Promise);
const ConfigService = require("./ConfigService");

module.exports = {
    getCodeTemplate,
    login,
    submitCode
};

function* _wrap(req) {
    try {
        return yield req.end();
    } catch (e) {
        if (e.response && e.response.body.error) {
            e.message = e.response.body.error;
        }
        throw e;
    }
}

function* login(username, password) {
    var res = yield _wrap(request.post(`${baseUrl}/api/v1/login`).send({username, password}));
    return res.body;
}


function* getCodeTemplate(language) {
    var res = yield _wrap(request.get(`${baseUrl}/cli-api/v1/code-templates/${language}`));
    return res.body;
}

function* submitCode(problemId, submission, file) {
    var req = request
        .post(`${baseUrl}/cli-api/v1/problems/${problemId}/submit`)
        .set("Authentication", `Bearer ${ConfigService.getToken()}`)
        .attach('file', file)
        .field('submission', JSON.stringify(submission));
    var res = yield _wrap(req);
    return res.body;
}
