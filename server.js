'use-strict';

// Dependencies
var connect = require('connect');
var serveStatic = require('serve-static');
var program = require('commander');

// Arguments
program.version('0.0.1');
program.option('-p, --port <port>', 'Port to listen on', parseInt);
program.parse(process.argv);

if (!program.port) {
    throw new Error('--port required');
}

connect().use(serveStatic(__dirname)).listen(program.port);
