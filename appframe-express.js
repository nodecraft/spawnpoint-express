'use strict';
var _ = require('lodash'),
	express = require('express'),
	bodyParser = require('body-parser');

module.exports = require('appframe')().registerPlugin({
	dir: __dirname,
	name: "Express",
	namespace: "express",
	callback: true,
	exports: function(app, callback){
		app.joi = require('joi');
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
		app.httpServer = app.server.listen(app.config.express.port, app.config.express.host, function(err){
			if(!err){
				var address = app.httpServer.address();
				app.info('Server online at %s:%s', address.address, address.port);
			}
			app.emit('app.register', 'express');
			return callback(err);
		});
		// track clients to gracefully close server
		var clients = {},
			requests = {};
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
			var lastCount = null;
			var attemptClose = function(){
				var openReqs =  Object.keys(requests).length;
				if(lastCount !== null && lastCount === openReqs){
					return;
				}
				lastCount = openReqs;
				if(openReqs < 1){
					_.each(clients, function(client){
						client.destroy();
					});
				}else{
					app.info('Waiting on %s request(s) to complete', openReqs);
				}
			};
			app.on('server.request_finish', attemptClose);
			attemptClose();
		});

		// setup body parsers
		if(app.config.express.bodyParser){
			_.each(app.config.express.bodyParser, function(opts, key){
				app.info('Enabling body parser: %s.', key);
				app.server.use(bodyParser[key](opts));
			});
		}

		// setup validation errors
		var fieldRegex = new RegExp("(" + app.config.express.validation.dataTypes.join('|') + ")\\.(.*)");
		app.server.validate = function(schema, options){
			options = options || {};
			options = _.defaults(options, app.config.express.validation.options);
			return function(req, res, next){
				var data = {};
				app.config.express.validation.dataTypes.forEach(function(type){
					if(_.keys(req[type]).length > 0){
						data[type] = req[type];
					}
				});
				app.joi.validate(data, schema, options, function(err, results){
					if(err){
						var errors = {};
						err.details.forEach(function(item){
							var name = fieldRegex.exec(item.path);
							if(name && name[1] && name[2]){
								errors[name[2]] = {
									message: item.message,
									type: item.type
								};
							}
						});
						// catch validation
						return res.status(400).fail('server.validation', {
							fields: errors
						});
					}
					_.each(results, function(value, key){
						req[key] = value;
					});
					return next();
				});
			}
		}
		app.server.use(function(req, res, next){
			res.invalid = function(fields){
				var errors = {};
				_.each(fields, function(message, field){
					errors[field] = {
						type: 'custom_message',
						message: typeof(message) == 'object' && message.message || message
					};
				});
				return res.status(400).fail('server.validation', {
					fields: errors
				});
			}
			return next();
		});

		// track requests open/close
		app.server.use(function(req, res, next){
			req.id = app.random(128) + '-' + req.originalUrl;
			requests[req.id] = true;
			app.emit('server.request_open', req.id);
			if(app.config.debug){
				app.info('> REQ: ' +  req.originalUrl, req.id);
			}
			var cleanup = function(){
				delete requests[req.id];
				app.emit('server.request_finish', req.id);
			};
			res.on('finish', cleanup);
			res.on('close', cleanup);
			return next();
		});
		app.on('server.middleware', function(fn){
			app.server.use(fn);
		});
		if(app.config.express.handleError){
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
