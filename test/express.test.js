'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { after, before, describe, it } = require('node:test');

const Spawnpoint = require('spawnpoint');

let app = null;
let baseUrl = null;

const getFreePort = function() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
};

const request = async function(urlPath, options = {}) {
	const init = { method: options.method || 'GET', headers: {} };
	if (options.body !== undefined) {
		init.headers['content-type'] = 'application/json';
		init.body = JSON.stringify(options.body);
	}
	const res = await fetch(baseUrl + urlPath, init);
	return { status: res.status, body: await res.json() };
};

before(async () => {
	const port = await getFreePort();
	app = new Spawnpoint({ cwd: path.join(__dirname, 'fixture'), configFile: '/app.js' });
	// the plugin refuses to boot without a port, and a fixed one would collide across parallel CI runs
	app.on('app.setup.loadConfig', () => {
		app.config.express.port = port;
	});
	await new Promise((resolve, reject) => {
		app.setup(err => (err ? reject(err) : resolve()));
	});
	baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
	app.httpServer.closeAllConnections();
	app.httpServer.close();
});

describe('app.server.validate', () => {
	it('strips unknown keys instead of rejecting them, using the configured options', async () => {
		const res = await request('/validate/body', { method: 'POST', body: { name: 'a', extra: true } });
		assert.equal(res.status, 200);
		assert.deepEqual(res.body.body, { name: 'a', count: 1 });
	});

	it('writes coerced values and defaults back onto the request', async () => {
		const res = await request('/validate/query?page=5&include=true');
		assert.equal(res.status, 200);
		assert.deepEqual(res.body.query, { page: 5, include: true });

		const defaults = await request('/validate/query');
		assert.deepEqual(defaults.body.query, { page: 1, include: false });
	});

	it('does not reject request sections the schema does not declare', async () => {
		const res = await request('/validate/undeclared/abc?page=2');
		assert.equal(res.status, 200);
		assert.deepEqual(res.body.params, { id: 'abc' });
		assert.deepEqual(res.body.query, { page: 2 });
	});

	it('reports every invalid field keyed by name without the section prefix', async () => {
		const res = await request('/validate/body', { method: 'POST', body: { count: 'many' } });
		assert.equal(res.status, 400);
		assert.equal(res.body.code, 'express.validation');
		assert.equal(res.body.success, false);
		assert.deepEqual(Object.keys(res.body.data.fields).sort(), ['count', 'name']);
		assert.equal(res.body.data.fields.name.type, 'any.required');
		assert.equal(res.body.data.fields.count.type, 'number.base');
		assert.equal(typeof res.body.data.fields.name.message, 'string');
	});

	it('lets route options override the configured defaults', async () => {
		const res = await request('/validate/strict', { method: 'POST', body: { name: 'a', extra: true } });
		assert.equal(res.status, 400);
		assert.equal(res.body.data.fields.extra.type, 'object.unknown');
	});

	it('responds with a validation failure when the schema itself throws', async () => {
		const res = await request('/validate/throws', { method: 'POST', body: { items: [{}, {}] } });
		assert.equal(res.status, 400);
		assert.equal(res.body.code, 'express.validation');
	});
});

describe('res.fail', () => {
	it('hides RethinkDB driver errors behind a generic 500', async () => {
		for (const route of ['/fail/reql', '/fail/cannot-read']) {
			const res = await request(route);
			assert.equal(res.status, 500, route);
			assert.equal(res.body.code, 'express.generic_error', route);
			assert.equal(res.body.error, true, route);
			assert.equal(res.body.success, false, route);
		}
	});

	it('still passes through spawnpoint fail codes', async () => {
		const res = await request('/fail/code');
		assert.equal(res.status, 404);
		assert.equal(res.body.code, 'test.not_found');
		assert.equal(res.body.error, false);
	});
});

describe('res.invalid', () => {
	it('accepts plain strings, code objects and empty messages', async () => {
		const res = await request('/invalid');
		assert.equal(res.status, 400);
		assert.deepEqual(res.body.data.fields, {
			plain: { message: 'Plain message.', type: 'custom_message' },
			coded: { message: 'Message from object.', type: 'custom_message' },
			empty: { message: null, type: 'custom_message' },
		});
	});
});
