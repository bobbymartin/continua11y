var async = require('async');
var parse = require('url-parse');
var request = require("request");
var models = require("../models");

var Reporter = {

    start: function (githubData, travisData) {
        // initialize the commit in the database
        models.Repo.upsert({
            repo: githubData.id,
            repoName: travisData.repository,
            defaultBranch: githubData.default_branch
        }).then(function () {
            models.Commit.create({
                branch: travisData.branch,
                pullRequest: travisData.pull_request,
                commit: travisData.commit,
                shortCommit: travisData.commit.slice(0,6),
                commitMessage: travisData.commit_message,
                repo: githubData.id,
                repoName: travisData.repository
            }).then(function () {
                models.Commit.update({
                    latest: false
                },{
                    where: {
                        repo: githubData.id,
                        branch: travisData.branch,
                    }
                }).then(function () {
                    Reporter.calculate(githubData, travisData);
                });
            });
        });
    },

    calculate: function (githubData, travisData) {
        var overall = {"total": 0, "error": 0, "warning": 0, "notice": 0};
        async.forEachOfSeries(travisData.data, function (data, url, callback){
            overall.total += data.count.total;
            overall.error += data.count.error;
            overall.warning += data.count.warning;
            overall.notice += data.count.notice;
            url = parse(url, true);
            
            Reporter.saveURL(githubData, travisData, data, url);

            callback(null);
        }, function (err){
            if (err) {
                console.log("Error in iterating over URLs");
            }
            Reporter.saveCommit(githubData, travisData, overall);
            Reporter.saveRepo(githubData, travisData, overall);
            // Reporter.tellGitHub(githubData, travisData, overall);
        });
    },

    saveURL: function (githubData, travisData, data, url) {
        // record stats for each URL in the commit
        models.Url.create({
            path: url.pathname,
            commit: travisData.commit,
            repo: githubData.id,
            total: data.count.total,
            error: data.count.error,
            warning: data.count.warning,
            notice: data.count.notice
        });
    },

    saveCommit: function (githubData, travisData, overall) {
        // records overall stats for this commit
        models.Commit.update({
            total: overall.total,
            error: overall.error,
            warning: overall.warning,
            notice: overall.notice,
            latest: true
        },{
            where: {
                commit: travisData.commit
            }
        });
    },

    saveRepo: function (githubData, travisData, overall) {
        // check if repo is tracked
        models.Repo.upsert({
            repo: githubData.id,
            repoName: travisData.repository,
            defaultBranch: githubData.default_branch,
            total: overall.total,
            error: overall.error,
            warning: overall.warning,
            notice: overall.notice
        });
    },

    tellGitHub: function (githubData, travisData, overall) {
        var context = "";
        var message = "";
        if (travisData.pull_request === true){
            context = "continuous-integration/continua11y/pull";
        } else {
            context = "continuous-integration/continua11y/push";
        }
        var firstCommit = travisData.commit.slice(0,6);
        // var lastCommit = travisData.commit.slice(15,21);
        models.Commit.findOne({
            where: {
                repo: githubData.id,
                shortCommit: firstCommit
            }
        }).then(function (commit) {
            var change = commit.error - overall.error;
            if (change >= 0){
                message = "decreased accessibility errors by "+change;
            } else {
                message = "incrased accessibility errors by "+change;
            }
            request.post({
                uri: "https://api.github.com/repos/"+travisData.repository+"/statuses/"+travisData.commit,
                headers: {
                    "User-Agent": "continua11y",
                    "Authorization": "token "+process.env.GITHUB_TOKEN
                },
                json: true,
                body: {
                    "state": "success",
                    "target_url": "https://continua11y.herokuapp.com/"+travisData.repository+"/"+travisData.commit,
                    "description": message,
                    "context": context
                }
            }, function (err, res, body){
                if (err){
                    console.log(err);
                } else {
                    console.log("success: got "+res.statusCode);
                }
            });

        });
    }
};

module.exports = Reporter;