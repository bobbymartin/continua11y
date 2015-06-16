var express = require("express");
var https = require("https");
var bodyParser = require("body-parser");
var pg = require("pg");
var badge = require('gh-badges');
var processReport = require("./lib/report.js");

var app = express();
app.set('view engine', 'jade');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));

var enableCORS = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    // intercept OPTIONS method
    if ('OPTIONS' === req.method) {
        res.send(200);
    }
    else {
        next();
    }
};

app.use(enableCORS);

// TODO: switch pg to use prepared statements: https://github.com/brianc/node-postgres/wiki/Prepared-Statements

var conString = process.env.DATABASE_URL || "postgres://localhost/postgres";
pg.connect(conString, function (err, client, done){
    if (err) {
        console.log(err);
    }

    // both repo_name and repo_id used because the name can change but id stays the same
    client.query("CREATE TABLE IF NOT EXISTS results(repo_name text UNIQUE NOT NULL, repo_id int UNIQUE NOT NULL, total int, error int, warning int, notice int);", function(err, result) {
        done();
        if (err) {
            return console.error('error running query', err);
        }
    });
});

app.get("/", function (req, res){
        pg.connect(conString, function (err, client, done){
        if (err) {
            console.log(err);
        } else {
            client.query("SELECT * FROM results;", function (err, result){
                done();
                if (result.rows.length === 0){
                    // TODO: Setup instructions if new

                    res.send("No reports run yet");
                } else {
                    res.render('index', {repos: result.rows});
                }
            });
        }
    });
});

app.get("/repo/:account/:repo.svg", function (req, res){
    pg.connect(conString, function (err, client, done){
        if (err) {
            console.log(err);
        } else {
            client.query("SELECT * FROM results WHERE repo_name = '"+req.params.account + "/" + req.params.repo+"'", function (err, result){
                done();
                var summary;
                var color;
                if (result.rows.length === 0){
                    badge({ text: [ "accessible", "unknown" ], colorscheme: "lightgrey" },
                        function(svg, err) {
                            res.set('Content-Type', 'image/svg+xml');
                            res.send(svg);
                    });
                } else {
                    if (result.rows[0].error > 20){
                        summary = "no";
                        color = "red";
                    } else if (10 > result.rows[0].error > 0){
                        summary = "almost";
                        color = "yellow";
                    } else {
                        summary = "yes";
                        color = "brightgreen";
                    }
                    badge({ text: [ "accessible", summary ], colorscheme: color },
                        function(svg, err) {
                            res.set('Content-Type', 'image/svg+xml');
                            res.send(svg);
                    });
                }
            });
        }
    });
});

app.get("/repo/:account/:repo", function (req, res){
    // TODO: view completed and in-progress jobs
    pg.connect(conString, function (err, client, done){
        if (err) {
            console.log(err);
        } else {
            client.query("SELECT repo_id FROM results WHERE repo_name = '"+req.params.account + "/" + req.params.repo+"'", function (err, result){
                done();
                client.query("SELECT * FROM repo_"+result.rows[0].repo_id+";", function (err, result){
                    if (result.rows.length === 0){
                        // TODO: Setup instructions if new

                        res.send("I don't know that repo");
                    } else {
                        res.render('report', {results: result.rows, repo: req.params.account + "/" + req.params.repo});
                    }
                });
            });
        }
    });
});

app.get("/commit/:account/:repo/:commit", function (req, res){
    // TODO: view completed and in-progress jobs
    pg.connect(conString, function (err, client, done){
        if (err) {
            console.log(err);
        } else {
            client.query("SELECT repo_id FROM results WHERE repo_name = '"+req.params.account + "/" + req.params.repo+"'", function (err, result){
                done();
                client.query("SELECT * FROM commit_"+result.rows[0].repo_id+"_"+req.params.commit+";", function (err, result){
                    if (result.rows.length === 0){
                        // TODO: Setup instructions if new

                        res.send("I don't know that repo");
                    } else {
                        res.render('commit', {results: result.rows, repo: req.params.account + "/" + req.params.repo, commit: req.params.commit});
                    }
                });
            });
        }
    });
});

app.get("/api/:account/:repo", function (req, res){
    // TODO: view completed and in-progress jobs
    pg.connect(conString, function (err, client, done){
        if (err) {
            console.log(err);
        } else {
            client.query("SELECT * FROM results WHERE repo = '"+req.params.account + "/" + req.params.repo+"'", function (err, result){
                done();
                if (result.rows.length === 0){
                    // TODO: Setup instructions if new

                    res.send("I don't know that repo");
                } else {
                    res.send({results: result.rows});
                }
            });
        }
    });
});

app.post("/incoming", bodyParser.json({limit: '50mb'}), function (req, res){

    res.send("ok");
    console.log("received new report from travis for "+req.body.repository);
    https.get({
        hostname: "api.github.com",
        path: "/repos/"+req.body.repository,
        headers: {"User-Agent": "continua11y"}
    }, function (res){
        var githubBody = "";
        res.on('data', function(d) {
            githubBody += d;
        });
        res.on('end', function() {
            githubBody = JSON.parse(githubBody);
            console.log("repo id: "+githubBody.id);
            processReport(githubBody, req.body);
        });
    });
});

app.use(function (req, res) {
    res.status(400);
    res.render('404.jade');
});

app.use(function (req, res) {
    res.status(500);
    res.render('500.jade');
});

var server = app.listen(process.env.PORT || 3000, function() {

    var host = server.address().address;
    var port = server.address().port;

    console.log('Listening at http://%s:%s', host, port);
});