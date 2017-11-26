// capture string to hash from cli
var myArgs = process.argv.slice(2);

// we only care about the first argument, which should be password to hash
// password should be passed in single quotes to protect special characters
// like: $ node hashpass.js 'my-p4$$w0rd'
var pass_to_hash = myArgs[0];
console.log(pass_to_hash);


// Load the bcrypt module
var bcrypt = require('bcrypt');
// Generate a salt
var salt = bcrypt.genSaltSync(10);
// Hash the password with the salt
var hash = bcrypt.hashSync(pass_to_hash, salt);

console.log(hash);
