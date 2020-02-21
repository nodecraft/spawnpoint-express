'use strict';
const path = require('path'),
	fs = require('fs'),
	http = require('http'),
	https = require('https');

const _ = require('lodash'),
	express = require('express'),
	bodyParser = require('body-parser'),
	helmet = require('helmet'),
	compression = require('compression');

module.exports = require('spawnpoint').registerPlugin({
	dir: __dirname,
	name: "Express",
	namespace: "express",
	callback: true,
	exports: function(app, callback){
		const config = app.config[this.namespace];
		const appNS = config.namespace.server,
			serverNS = config.namespace.httpServer;

		_.each(config.hoist, function(value, library){
			if(value && !app[library]){
				app[library] = require(library);
			}
		});
		app[appNS] = express();

		app[appNS].set('x-powered-by', false);

		// prevent cross site JSON
		app[appNS].response.secureJSON = function(data){
			return this.type('json').end(")]}',\n" + JSON.stringify(data));
		};

		// setup express to handle error codes for better API responses
		app[appNS].response.success = function(code, data){
			const response = app.code(code);
			response.success = true;
			if(data){
				response.data = data;
			}
			return this.json(response);
		};
		app[appNS].response.fail = function(error, data){
			let response = app.code('express.generic_error');
			const checkError = app.maskErrorToCode(error);
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
			}else if(error && error.code !== undefined && error.message !== undefined && error.success !== undefined){
				return this.json(error);
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
		};

		// register express with spawnpoint
		const ready = function(err){
			if(!err){
				const address = app[serverNS].address();

				if(config.port){
					app.info('Server online at %s:%s', address.address, address.port);
				}else if(config.file){
					app.info('Server online via %s', config.file);
				}else{
					app.info('Server online!');
				}
			}
			app.emit('app.register', 'express');
			return callback(err);
		};

		if(config.https && config.certs){
			app[serverNS] = https.createServer(_.defaults(config.httpsOptions, {
				key: fs.readFileSync(app.cwd + config.certs.key),
				cert: fs.readFileSync(app.cwd + config.certs.cert)
			}), app[appNS]);

			// Code referenced from https://github.com/nodejs/node/issues/4464#issuecomment-357975317
			app[serverNS].setCerts = function(certs){
				if(certs && certs.cert && _.has(app[serverNS], '_sharedCreds.context.setCert')){
					app[serverNS]._sharedCreds.context.setCert(certs.cert);
				}else{
					app.warn('Failed to live set SSL certificate');
				}
				if(certs && certs.key && _.has(app[serverNS], '_sharedCreds.context.setKey')){
					app[serverNS]._sharedCreds.context.setKey(certs.key);
				}else{
					app.warn('Failed to live set SSL Key');
				}
			};
		}else{
			app[serverNS] = http.createServer(app[appNS]);
		}

		if(config.port && config.host){
			app[serverNS].listen(config.port, config.host, ready);
		}else if(config.port){
			app[serverNS].listen(config.port, ready);
		}else if(config.file){
			if(fs.existsSync(config.file)){
				fs.unlinkSync(config.file);
			}
			const mask = process.umask(0);
			app[serverNS].listen(config.file, function(){
				process.umask(mask);
				ready();
			});
		}else{
			throw new Error('No port, host, or file set to listen');
		}
		// track clients to gracefully close server
		const clients = {},
			requests = {};
		app[serverNS].on('error', function(err){
			app.error('HTTP server error').debug(err);
		});
		app[serverNS].on('connection', function(client){
			client.id = app.random(64);
			clients[client.id] = client;
			client.once('close', function(){
				delete clients[client.id];
			});
		});
		app.once('app.close', function(){
			app[serverNS].close(function(){
				app.emit('app.deregister', 'express');
			});
			let lastCount = null;
			const attemptClose = function(){
				const openReqs = Object.keys(requests).length;
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
			app.on('express.request_finish', attemptClose);
			attemptClose();
		});

		// handle ready
		if(config.waitForReady){
			app.emit('express.middleware', function(req, res, next){
				if(!app.status.running){
					return next(app.failCode('express.not_ready'));
				}
				return next();
			});
		}

		// setup body parsers
		if(config.bodyParser){
			_.each(config.bodyParser, function(opts, key){
				app.info('Enabling body parser: %s.', key);
				app[appNS].use(bodyParser[key](opts));
			});
		}
		if(config.helmet){
			if(typeof(config.helmet) === 'object'){
				if(config.helmet.contentSecurityPolicy && config.helmet.contentSecurityPolicy.generateNonces){
					const range = _.range(config.helmet.contentSecurityPolicy.generateNonces);
					app[appNS].use(function(req, res, next){
						const nonces = [];
						_.each(range, function(){
							nonces.push(app.random(20));
						});
						res.locals._nonces = nonces;
						return next();
					});
					_.each(range, function(i){
						if(config.helmet.contentSecurityPolicy.directives && config.helmet.contentSecurityPolicy.directives.scriptSrc){
							config.helmet.contentSecurityPolicy.directives.scriptSrc.push(function(req, res){
								if(!res.locals._nonces || !res.locals._nonces[i]){ return; }
								return "'nonce-" + res.locals._nonces[i] + "'";
							});
						}
					});
				}
				_.each(config.helmet, function(helmitConfig, module){
					if(helmitConfig === false){
						return;
					}
					if(!helmet[module]){ return app.error('Invalid helmet module [%s]', module); }
					if(helmitConfig === true){
						return app[appNS].use(helmet[module]());
					}
					return app[appNS].use(helmet[module](helmitConfig));
				});
			}else{
				app[appNS].use(helmet());
			}
		}

		// setup validation errors
		const fieldRegex = new RegExp("(" + config.validation.dataTypes.join('|') + ")\\.(.*)");
		app[appNS].validate = function(schema, options){
			options = options || {};
			options = _.defaults(options, config.validation.options);
			return function(req, res, next){
				const data = {};
				_.each(schema, function(v, key){
					data[key] = {};
				});
				config.validation.dataTypes.forEach(function(type){
					if(_.keys(req[type]).length > 0){
						data[type] = req[type];
					}
				});
				app.joi.validate(data, schema, options, function(err, results){
					if(err){
						const errors = {};
						err.details.forEach(function(item){
							const name = fieldRegex.exec(item.path.join('.'));
							if(name && name[1] && name[2]){
								errors[name[2]] = {
									message: item.message,
									type: item.type
								};
							}
						});
						// catch validation
						return res.status(400).fail('express.validation', {
							fields: errors
						});
					}
					_.each(results, function(value, key){
						req[key] = value;
					});
					return next();
				});
			};
		};
		app[appNS].use(function(req, res, next){
			res.invalid = function(fields){
				const errors = {};
				_.each(fields, function(message, field){
					errors[field] = {
						type: 'custom_message',
						message: typeof(message) === 'object' && message.message || message
					};
				});
				return res.status(400).fail('express.validation', {
					fields: errors
				});
			};
			return next();
		});

		// track requests open/close
		app[appNS].use(function(req, res, next){
			req.spawnpoint_namespace = appNS;
			req.id = app.random(128) + '-' + req.originalUrl;
			requests[req.id] = true;
			app.emit('express.request_open', req);
			if(app.config.debug && config.logRequests){
				app.info('> ' + req.method + ': ' + req.originalUrl);
			}
			const cleanup = function(){
				delete requests[req.id];
				app.emit('express.request_finish', req);
			};
			res.on('finish', cleanup);
			res.on('close', cleanup);
			return next();
		});

		if(config.compression){
			if(typeof(config.compression) === 'object'){
				app[appNS].use(compression(config.compression));
			}else{
				app[appNS].use(compression());
			}
		}
		if(config.static){
			_.each(config.static, function(opts, folder){
				app[appNS].use(express.static(path.join(app.cwd + folder), opts));
			});
		}

		const middleware = function(path, fn){
			if(path && !fn){
				return app[appNS].use(path);
			}
			app[appNS].use(path, fn);
		};

		app.on('express.middleware', middleware);
		app.on('express.middleware.' + appNS, middleware);
		if(config.handleError){
			app.once('app.ready', function(){
				app[appNS].use(function(err, req, res, next){
					if(err){
						app.error('Express Application Error').debug(err.stack || err);
						if(res.headersSent){
							return app.warn('Headers already sent, no error status sent');
						}
						return res.fail(err);
					}
					return next();
				});
				app[appNS].use(function(req, res){
					app.debug('404 request: %s', req.originalUrl);
					return res.status(404).fail('express.status_404');
				});
			});
		}
	}
});
