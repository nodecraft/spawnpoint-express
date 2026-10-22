'use strict';
const path = require('node:path');

module.exports = {
	name: 'spawnpoint-express-test',
	plugins: [path.join(__dirname, '../../spawnpoint-express.js')],
	autoload: [{ name: 'routes', folder: '/routes' }],
	signals: false,
	catchExceptions: false,
	secrets: false,
	log: { format: '' },
};
