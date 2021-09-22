"use strict"

var express = require('express');
var app = express();
var http = require('http');
var path = require('path');
var server = http.Server(app);
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var bcrypt = require('bcrypt');
var io = require('socket.io')(server, {pingInterval: 1500});

const DbManager = require('./server_side/main_modules/dbManager.js');
const Game = require('./server_side/main_modules/Game.js');

const saltRounds = 10;
const gameURL = '/game';
const planetURL = gameURL + '/planet';
const mapURL = gameURL + '/map';
const reportURL = gameURL + '/report';
const messageURL = gameURL + '/message';
const researchURL = gameURL + '/research';
var tokens = [];
//switch to jwt token at some point for authentication?
var token_timeouts = {};
var dbManager = new DbManager();
var game = new Game(dbManager, io);
const root = __dirname;

app.set('port', 8080);
app.use('/client_side', express.static(root + '/client_side'));// Routing

app.use(bodyParser.urlencoded({ extended: false }));

app.use(cookieParser());

app.get('/', function(req, res) {
	res.sendFile(path.join(root + '/client_side', 'pages/index.html'));
});

app.post('/register', function(req, res) {
	var { username, password } = req.body;
	
	if (password != '' && username != '') {
		var query = "SELECT password FROM players WHERE username = ?";
		dbManager.execute_query(query, [username]).then(results => {
			if (results.length == 1) {
				res.sendStatus(401);
			} else {
				bcrypt.hash(password, saltRounds, function(err, hash) {
					if (err) {
						throw err;
					}
					query = "INSERT INTO players (username, password, system_id, space_object_id, res_last_update) VALUES ( ? , ? , ? , ? , UNIX_TIMESTAMP())";
					dbManager.execute_query(query, [username, hash, 1, 2]).then(() => {
						res.sendStatus(200);
					}).catch(err => { throw err });
				});
			}
		}).catch(err => {
			throw err;
		});
	}
});

app.post('/login', function(req, res) {
	var { username, password } = req.body;
	
	var query = "SELECT password FROM players WHERE username = ?";
	dbManager.execute_query(query, [username]).then(results => {
		if (results.length == 1) {
			bcrypt.compare(password, results[0].password, function(err, passwordsMatch) {
				if (err) { throw err; }
				if (passwordsMatch) {
					//Client saves username as token, which is then sent from client to the server to authorize actions sent through socket for every action. If players object does not have attribute equal to token, then action is not executed and user is redirected back to login page instead
					if (!is_valid_token(username)) {
						tokens.push(username);
					}
					//res.cookie('token', username, { maxAge: 900000 });
					//increased for debugging purposes
					res.cookie('token', username, { maxAge: 9000000000 });
					//Would use redirect, however according to answers from stack overflow, when using ajax, express redirect does not work and has to be created from client's side instead
					res.send(req.protocol + '://' + req.get('host') + planetURL);
				} else {
					res.sendStatus(401);
				}
			});
		} else {
			res.sendStatus(401);
		}
	}).catch(err => {
		throw err;
	});
});

app.get(planetURL, function(req,res) {
	if (req.cookies !== undefined && req.cookies.token !== undefined) {
		if (is_valid_token(req.cookies.token)) {
			res.sendFile(path.join(root + '/client_side', 'pages/planet.html'));
		} else {
			res.clearCookie('token');
			res.redirect(303, '/');
		}
	} else {
		res.redirect(303, '/');
	}
});

app.get(mapURL, function(req,res) {
	if (req.cookies !== undefined && req.cookies.token !== undefined) {
		if (is_valid_token(req.cookies.token)) {
			res.sendFile(path.join(root + '/client_side', 'pages/map.html'));
		} else {
			res.clearCookie('token');
			res.redirect(303, '/');
		}
	} else {
		res.redirect(303, '/');
	}
});

app.get(messageURL, function(req,res) {
	if (req.cookies !== undefined && req.cookies.token !== undefined) {
		if (is_valid_token(req.cookies.token)) {
			res.sendFile(path.join(root + '/client_side', 'pages/message.html'));
		} else {
			res.clearCookie('token');
			res.redirect(303, '/');
		}
	} else {
		res.redirect(303, '/');
	}
});

app.get(researchURL, function(req,res) {
	if (req.cookies !== undefined && req.cookies.token !== undefined) {
		if (is_valid_token(req.cookies.token)) {
			res.sendFile(path.join(root + '/client_side', 'pages/research.html'));
		} else {
			res.clearCookie('token');
			res.redirect(303, '/');
		}
	} else {
		res.redirect(303, '/');
	}
});

app.get(reportURL, function(req,res) {
	if (req.cookies !== undefined && req.cookies.token !== undefined) {
		if (is_valid_token(req.cookies.token)) {
			res.sendFile(path.join(root + '/client_side', 'pages/report.html'));
		} else {
			res.clearCookie('token');
			res.redirect(303, '/');
		}
	} else {
		res.redirect(303, '/');
	}
});

app.use(function(req, res){
	res.redirect('/');
});

// Starts the server
server.listen(8080, function() {
	console.log('Starting server on port 8080');
	game.setup_game();
});

io.use((socket, next) => {
	if (socket.handshake.auth.token !== undefined && tokens.findIndex(token => token == socket.handshake.auth.token) != -1) {
		socket.username = socket.handshake.auth.token;
		socket.token = socket.handshake.auth.token;
		next();
	} else {
		next(new Error("Authentication failed"));
	}
});

// Add the WebSocket handlers
io.on('connection', socket => {
	socket.on('planet_datapack_request', () => {
		dbManager.get_starter_datapack(socket.username).then(datapack => { socket.emit('starter_datapack', JSON.stringify(datapack)); });
	});

	socket.on('upgrade_building', building => {
		dbManager.upgrade_building(socket.username, building).catch(e => {
			if (e != 'Not enough resources to upgrade building') {
				throw e;
			}
		});
	});

	socket.on('fetch_building_details', data => {
		dbManager.get_building_details(data).then(results => { socket.emit('building_fetch_result', results[0]);});
	});

	socket.on('cancel_building_update', building => {
		dbManager.cancel_building_update(socket.username, building);
	});

	socket.on('downgrade_building', building => {
		dbManager.downgrade_building(socket.username, building);
	});

	socket.on('map_datapack_request', (layout) => {
		game.addPlayer(socket, socket.username).then(() => {
			socket.gameAdded = true;
			game.get_map_datapack(layout, socket.username).then(result => {socket.emit('map_datapack', JSON.stringify(result))});
		});
	});

	socket.on('build_units', (units) => {
		dbManager.build_units(socket.username, units).catch(e => {
			if (e != 'Not enough resources to build all units' && e != 'Invalid units input received') {
				throw e;
			}
		});
	});

	socket.on('request', (...args) => {
		var request_id = args[0];
		var passed_args = args.slice(1);
		if (request_id === 'restart') {
			restart_server(socket, passed_args[0]);
		} else {
			game.process_request(socket.username, request_id, passed_args);
		}
	});

	socket.on('set_movepoint', (x, y) => {
		game.set_movepoint(socket.username, x, y);
	});

	socket.on('assign_fleet', (object_type, object_id) => {
		game.assign_fleet(socket.username, object_type, object_id);
	});

	socket.on('send_expedition', (units, length_type) => {
		game.send_expedition(socket.username, units, length_type);
	});

	socket.on('report_datapack_request', () => {
		dbManager.get_report_datapack(socket.username).then(datapack => { socket.emit('report_datapack', JSON.stringify(datapack)); });
	});

	socket.on('load_report', report_id => {
		dbManager.get_report_details(report_id).then(report_details => { socket.emit('report_details', JSON.stringify(report_details)); });
	});

	socket.on('reports_displayed', timestamp => {
		dbManager.mark_reports_displayed(socket.username, timestamp);
	});

	socket.on('report_read', report_id => {
		dbManager.mark_report_displayed(report_id);
	});

	socket.on('research_datapack_request', () => {
		dbManager.get_research_datapack(socket.username).then(datapack => { socket.emit('research_datapack', JSON.stringify(datapack)); });
	});

	socket.on('disconnect', () => {
		//When the player is switching between pages (map, planet, etc.,), they got the set amount of time specified in the timeout to reconnect before getting logged out
		token_timeouts[socket.token] = setTimeout(function() { tokens.splice(tokens.findIndex(token => token == socket.username), 1); }.bind(this), 12000);
		if (socket.gameAdded !== undefined) {
			game.removePlayer(socket.username);
			socket.gameAdded = undefined;
		}
	});
});

//does not refresh the cache of the code for main.js -> any changes in main.js will not be loaded when restarting through FE
function restart_server(socket, layout) {
	var token;
	if (socket !== undefined) {
		token = socket.token;
	}
	delete require.cache[require.resolve('./server_side/main_modules/Game.js')];
	delete require.cache[require.resolve('./server_side/main_modules/dbManager.js')];
	const DbManager = require('./server_side/main_modules/dbManager.js');
	const Game = require('./server_side/main_modules/Game.js');
	dbManager = new DbManager();
	game.stop();
	game = new Game(dbManager, io);
	game.setup_game().then(() => {
		if (socket !== undefined) {
			game.addPlayer(socket, token).then(() => {
				socket.gameAdded = true;
				game.get_map_datapack(layout, socket.username).then(result => {socket.emit('map_datapack', JSON.stringify(result))});
			});
		}
	});
}

function is_valid_token(p_token) {
	var isValid_token = tokens.findIndex(token => token == p_token) != -1
	if (isValid_token) {
		var timeout = token_timeouts[p_token];
		clearTimeout(timeout);
	}
	return isValid_token;
}