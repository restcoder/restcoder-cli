'use strict';

var baseUrl = "http://localhost:3500";

var request = require('superagent-promise')(require('superagent'), Promise);

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

function* getCodeTemplate(problemId, platform) {
    var res = yield _wrap(request.get(`${baseUrl}/cli-api/v1/problems/${problemId}/code-templates/${platform}`));
    return res.body;
}

module.exports = {
    getCodeTemplate
};