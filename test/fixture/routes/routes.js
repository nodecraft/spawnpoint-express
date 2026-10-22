'use strict';
module.exports = function(app) {
	const echo = function(req, res) {
		return res.json({ body: req.body, query: req.query, params: req.params });
	};

	app.server.post('/validate/body', app.server.validate({
		body: {
			name: app.joi.string().required(),
			count: app.joi.number().integer().default(1),
		},
	}), echo);

	app.server.get('/validate/query', app.server.validate({
		query: {
			page: app.joi.number().integer().default(1),
			include: app.joi.boolean().default(false),
		},
	}), echo);

	// params are present on the request but not declared in the schema
	app.server.get('/validate/undeclared/:id', app.server.validate({
		query: {
			page: app.joi.number().integer(),
		},
	}), echo);

	app.server.post('/validate/strict', app.server.validate({
		body: {
			name: app.joi.string(),
		},
	}, { allowUnknown: false, stripUnknown: false }), echo);

	app.server.post('/validate/throws', app.server.validate({
		body: {
			items: app.joi.array().items(app.joi.object()).unique((first, second) => first.nested.value === second.nested.value),
		},
	}), echo);

	app.server.get('/fail/reql', function(req, res) {
		const err = new Error('Primary replica unavailable');
		err.name = 'ReqlOpFailedError';
		return res.fail(err);
	});

	app.server.get('/fail/cannot-read', function(req, res) {
		return res.fail(new Error('Cannot perform read: primary replica for shard ["", +inf) not available'));
	});

	app.server.get('/fail/code', function(req, res) {
		return res.status(404).fail(app.failCode('test.not_found'));
	});

	app.server.get('/invalid', function(req, res) {
		return res.invalid({
			plain: 'Plain message.',
			coded: { code: 'test.not_found', message: 'Message from object.' },
			empty: null,
		});
	});
};
