// capture string to hash from cli
var myArgs = process.argv.slice(2);
console.log('myArgs: ', myArgs);
var pass_to_check = myArgs[0];
var hash_to_compare = "$2a$10$x1qbLvzxv9lMuss/a8gafe30yLHXI9bIJ1IkWXuSBQTBzMg5KCNmm";

// Load the bcrypt module
var bcrypt = require('bcrypt');

// Let's assume it's stored in a variable called `hash`
var hash_true = bcrypt.compareSync(pass_to_check, hash_to_compare); // true
var hash_false = bcrypt.compareSync("not my password", hash_to_compare); // false

console.log(hash_true);
console.log(hash_false);
