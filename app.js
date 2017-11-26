var fs = require('fs');
var http = require('http');
var url = require('url');
var auth = require('basic-auth');
var bcrypt = require('bcrypt');

if (!process.env.DYNDNS_ZONEFILE_LOCATION) {
    console.log("ERROR: No dns zonefile location given.\n" +
                "Please provide DYNDNS_ZONEFILE_LOCATION environment variable.\n");
    process.exit(1);
} else {
    var zonefile_location = process.env.DYNDNS_ZONEFILE_LOCATION;
    fs.stat(zonefile_location, function (err, stats){
        if (err) {
            // Directory doesn't exist or something.
            console.log('ERROR: ' + zonefile_location + ' does not exist.');
            process.exit(1);
        }
        if (!stats.isDirectory()) {
            // This isn't a directory!
            console.log('ERROR: ' + zonefile_location + ' is not a directory.');
            process.exit(1);
        }
    });
}

// import the dyndns logic
var dyndns2 = require('./dyndns2');

// AUTHENTICATION
// keeping it simple -- single user, one auth token, stored as bcrypt hash
// generated with hashpass.js like: `node hashpass.js 'my-p4$$w0rd'`
// No username -- treat the password like a token like duckdns.org does.
var token_hash = '$2a$10$4.Gk9owJXxLUqWpQrXGYkuSidjHHhlZHO3wfEPlx0e2/O1JtlnIhG';

// VALID API PATHS
var valid_paths = ["/nic/update","/v3/update","/nic/delete","/v3/delete"];


var server = http.createServer(function (req, res) {
    var credentials = auth(req)
    var req_path = url.parse(req.url).pathname;
    if (!credentials || !bcrypt.compareSync(credentials.pass, token_hash)) {
        // Access denied
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="example"')
        res.end('bad')
    } else if ( valid_paths.indexOf(req_path) < 0 ) {
        // Incorrect request path
        console.log(req_path);
        // HTTP Status: 404 : NOT FOUND
        // Content Type: text/plain
        res.writeHead(404, {'Content-Type': 'text/html'});
        res.end('<h1>404 Not Found</h1>');
    } else {
        // Access authorized, a proper API path used
        // now we can execute the dyndns logic:
        dyndns2.handle(req, res);
    }
})

// Listen
server.listen(3000)
