'use strict';
var _ = require('lodash'),
	express = require('express');

module.exports = require('../appframe.js/appframe.js')().registerPlugin({
	dir: __dirname,
	name: "Express",
	namespace: "server",
	callback: true,
	exports: function(app, callback){
		app.server = express();
		app.server.set('x-powered-by', false);

		// setup express to handle error codes for better API responses
		app.server.response.success = function(code, data){
			var response = app.code(code);
			response.success = true;
			if(data){
				response.data = data;
			}
			return this.json(response);
		}
		app.server.response.fail = function(error, data){
			var response = app.code('server.generic_error'),
				checkError = app.maskErrorToCode(error);
			if(checkError !== false){
				response = checkError;
			}else if(typeof(error) === 'string'){
				console.log('string error', err);
				response = app.code(error);
			}else if(error instanceof app._failCode){
				response = _.pick(error, ['message', 'code', 'data']);
			}else if(error instanceof app._errorCode){
				if(this.statusCode === 200){
					this.status(500);
				}
				response = _.pick(error, ['message', 'code', 'data']);
				response.error = true;
			}else if(error && error.code){
				response = app.code(error.code);
			}

			response.success = false;
			if(data){
				response.data = data;
			}
			if(response.error === undefined){
				response.error = false;
			}
			return this.json(response);
		}


		// register express with appframe
		app.httpServer = app.server.listen(app.config.server.port, app.config.server.host, function(err){
			if(!err){
				var address = app.httpServer.address();
				app.info('Server online at %s:%s', address.address, address.port);
			}
			app.emit('app.register', 'express');
			return callback(err);
		});
		// track clients to gracefully close server
		var clients = {};
		app.httpServer.on('error', function(err){
			app.error('HTTP server error').debug(err);
		});
		app.httpServer.on('connection', function(client){
			client.id = app.random(64);
			clients[client.id] = client;
			client.once('close', function(){
				delete clients[client.id];
			});
		});
		app.once('app.close', function(){
			app.httpServer.close(function(){
				app.emit('app.deregister', 'express');
			});
			_.each(clients, function(client){
				client.destroy();
			});
		});
		app.emit('app.server_middleware');
		if(app.config.debug){
			app.server.use(function(req, res, next){
				app.info('REQ: ' +  req.originalUrl);
				return next();
			});
		}
		if(app.config.server.handle_error){
			app.on('app.ready', function(){
				app.server.use(function(err, req, res, next){
					if(err){
						app.error('Express Application Error').debug(err.stack || err);
						if(res.headersSent){
							return app.warn('Headers already sent, no error status sent');;
						}
						return res.fail(err);
					}
					return next();
				});
				app.server.use(function(req, res){
					app.debug('404 request: %s', req.originalUrl);
					return res.status(404).fail('server.status_404');
				});
			});
		}
	}
});
