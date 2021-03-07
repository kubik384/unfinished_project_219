"use strict"

var mysql = require('mysql');
var Utils = require('./utils.js');
var utils = new Utils();
var all_resource_types = 'pop, food, timber, metals, coal, oil, kerosene, hydrogen, uranium';
var resourceTable = all_resource_types.split(', ');
var buildings = require('./../game_properties/buildings.json');
var space_objects = require('./../game_properties/space_objects.json');
var galaxies = require('./../game_properties/galaxies.json');
var units = require('./../game_properties/units.json');

class DbManager {
    constructor() {
        //Credentials for connecting to the db 
        this.con = mysql.createConnection({
            host: "localhost",
            user: "root",
            password: null,
            port: 3308,
            database: "improvisationalDB"
        });
        this.con.connect( err => { if (err) throw err; });
    }

    /**
     * 
     * @param {String} username 
     * @param {String|Array} p_resources Accepts in following formats: 'resource, resource, ..' OR [resource, resource, ..]
     * @param {Number} amount
     */
    update_resource(username, p_resources, amount = 0) {
        return new Promise((resolve,reject) => {
            var resource_generator = buildings.find(b => b.building_id == 2);
            this.update_building_level(username, resource_generator.building_id).then(() => {
                var query = `SELECT p.player_id, UNIX_TIMESTAMP(p.res_last_update) AS last_update, pb.level
                FROM player_buildings pb
                INNER JOIN players p ON p.player_id = pb.player_id
                WHERE p.username = ? AND pb.building_id = ?`;
                this.con.query(query, [username, resource_generator.building_id], function (err, results) {
                    if (err) reject(err);

                    var res_production = resource_generator.level_details.find(ld => ld.level == results[0].level).production;
                    var resources = p_resources == 'all' ? resourceTable : p_resources;
                    var set_to = '';
                    
                    if (!Array.isArray(resources)) {
                        resources = resources.split(', ');
                    }
                    
                    for (var i = 0; i < resources.length; i++) {
                        set_to += resources[i] + ' = ' + resources[i] + ' + ' + ((res_production[resources[i]] === undefined ? 0 : res_production[resources[i]]) * (utils.get_timestamp() - results[0].last_update) + amount) + ' , ';
                    }
                    set_to += 'res_last_update = NOW()';

                    var query = "UPDATE players SET " + set_to + " WHERE player_id = ?";
                    this.con.query(query, [results[0].player_id], function (err) {
                        if (err) reject(err);
                        resolve();
                    });
                }.bind(this));
            });
        });
    }

    /**
     * @param {String} username Player's username
     * @param {String} p_resource Can be exact resource or use 'all' to get all resource values
     * @param {Boolean} update Default value is false. If true, will update the resource values with produced resources and then return the resource values
     * returns in {resource: amount, ..} format
     */
    get_resource(username, p_resource, update = false) {
        return new Promise((resolve,reject) => {
            var resources = p_resource == 'all' ? all_resource_types : p_resource;
            if (update) {
                this.update_resource(username, p_resource);
            }

            var query = 'SELECT ' + resources + ' FROM players WHERE username = ?';

            this.con.query(query, [username], function (err, results) {
                if (err) reject(err);
                resolve(results[0]);
            });
        });
    }

    upgrade_building(username, p_building) {
        return new Promise((resolve,reject) => {
            this.update_resource(username, 'all').then(function() {
                this.update_building_level(username, p_building).then(function() {
                    var b_index = buildings.findIndex(building => building.name == p_building);
                    var query = `SELECT p.*, pb.update_start, pb.level
                    FROM player_buildings pb
                    INNER JOIN players p ON p.player_id = pb.player_id
                    WHERE p.username = ? AND pb.building_id = ?`;
                    this.con.query(query, [username, buildings[b_index].building_id], function (err, results) {
                        if (err) reject(err);
                        if (results.length > 0) {
                            var l_index;
                            if (buildings[b_index].level_details[results[0].level] == results[0].level) {
                                l_index = results[0].level;
                            } else {
                                l_index = buildings[b_index].level_details.findIndex(level_detail => level_detail.level == results[0].level)
                            }
                            query = `UPDATE player_buildings pb 
                                INNER JOIN players p ON p.player_id = pb.player_id
                                SET `;
                            for (const resource in buildings[b_index].level_details[l_index].upgrade_cost) {
                                if (results[0][resource] < buildings[b_index].level_details[l_index].upgrade_cost[resource]) {
                                    reject('Not enough resources to upgrade building');
                                } else {
                                    query += `p.${resource} = p.${resource} - ${buildings[b_index].level_details[l_index].upgrade_cost[resource]}, `
                                }
                                query += `pb.update_start = NOW()
                                WHERE p.player_id = ? AND pb.building_id = ? AND pb.update_start IS NULL`;
                            }
                            if (results[0].update_start === null) {
                                this.con.query(query, [results[0].player_id, buildings[b_index].building_id], function (err) {
                                    if (err) reject(err);
                                    resolve();
                                });
                            }
                        }
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        });
    }

    cancel_building_update(username, p_building) {
        return new Promise((resolve,reject) => {
            this.update_building_level(username, p_building).then(function() {
                var b_index = buildings.findIndex(building => building.name == p_building);
                var query = `SELECT p.player_id, pb.level, pb.update_start, pb.downgrade
                FROM player_buildings pb
                INNER JOIN players p ON p.player_id = pb.player_id
                WHERE p.username = ? AND pb.building_id = ?`;
                this.con.query(query, [username, buildings[b_index].building_id], function (err, results) {
                    if (err) reject(err);
                    if (results.length > 0) {
                        if (results[0].update_start !== null) {
                            if (results[0].downgrade) {
                                query = `UPDATE player_buildings pb 
                                INNER JOIN players p ON p.player_id = pb.player_id
                                SET 
                                    pb.update_start = NULL,
                                    pb.downgrade = 0
                                    WHERE p.player_id = ? AND pb.building_id = ? AND pb.level > 0 AND pb.update_start IS NOT NULL AND pb.downgrade = 1`;
                                this.con.query(query, [results[0].player_id, buildings[b_index].building_id, results[0].level], function (err) {
                                    if (err) reject(err);
                                    resolve();
                                });
                            } else {
                                var l_index;
                                if (buildings[b_index].level_details[results[0].level] == results[0].level) {
                                    l_index = results[0].level;
                                } else {
                                    l_index = buildings[b_index].level_details.findIndex(level_detail => level_detail.level == results[0].level)
                                }
                                query = `UPDATE player_buildings pb 
                                INNER JOIN players p ON p.player_id = pb.player_id
                                SET `;

                                for (const resource in buildings[b_index].level_details[l_index].upgrade_cost) {
                                    query += `p.${resource} = p.${resource} + ${buildings[b_index].level_details[l_index].upgrade_cost[resource]}, `;
                                }
                                query += `pb.update_start = NULL
                                WHERE p.player_id = ? AND pb.building_id = ? AND pb.level = ? AND pb.update_start IS NOT NULL`;
                                this.con.query(query, [results[0].player_id, buildings[b_index].building_id, results[0].level], function (err) {
                                    if (err) reject(err);
                                    resolve();
                                });
                            }
                        }
                    }
                }.bind(this));
            }.bind(this));
        });
    }

    downgrade_building(username, p_building) {
        return new Promise((resolve,reject) => {
            this.update_building_level(username, p_building).then(function() {
                var b_index = buildings.findIndex(building => building.name == p_building);
                var query = `UPDATE player_buildings pb 
                INNER JOIN players p ON p.player_id = pb.player_id
                SET 
                    pb.update_start = NOW(),
                    pb.downgrade = 1
                WHERE p.username = ? AND pb.building_id = ? AND pb.level > 0 AND pb.update_start IS NULL`;
                this.con.query(query, [username, buildings[b_index].building_id], function (err) {
                    if (err) reject(err);
                    resolve();
                });
            }.bind(this));
        });
    }

    /**
     * Returns result(s) in following format [{player_id, building_id, level, update_start(in UNIX timestamp), upgrade_time}, ..]
     * @param {String} username Username of the player
     * @param {String} p_building Building name 'all' can be used to get all buildings from the player
     */
    get_player_building_details(username, p_building, passingId = false) {
        return new Promise((resolve,reject) => {
            this.update_building_level(username, p_building).then(function () {
                var building_id;
                var query = `SELECT pb.player_id, pb.building_id, pb.level, pb.downgrade,
                UNIX_TIMESTAMP(pb.update_start) AS update_start
                FROM player_buildings pb
                INNER JOIN players p ON p.player_id = pb.player_id
                WHERE p.username = ?`;
                if (p_building != 'all') {
                    if (passingId) {
                        building_id = p_building;
                    } else {
                        building_id = buildings.find(building => building.name == p_building).building_id;
                    }
                    query += ' AND pb.building_id = ?';
                }
                this.con.query(query, [username, building_id], function (err, results) {
                    if (err) reject(err);
                    if (p_building != 'all') {
                        resolve(results[0]);
                    }
                    resolve(results);
                });
            }.bind(this));
        });
    }

    update_building_level(username, p_building, passingId = false) {
        return new Promise((resolve,reject) => {
            var query = `SELECT p.player_id, UNIX_TIMESTAMP(pb.update_start) AS update_start, pb.level, pb.building_id, pb.downgrade
                FROM player_buildings pb
                INNER JOIN players p ON p.player_id = pb.player_id
                WHERE p.username = ? AND pb.update_start IS NOT NULL`;
            if (p_building != 'all') {
                if (passingId) {
                    query += ' AND pb.building_id = ' + p_building;
                } else {
                    var b_index = buildings.findIndex(building => building.name == p_building);
                    query += ' AND pb.building_id = ' + (b_index + 1);
                }
            }
            this.con.query(query, [username], function (err, results) {
                if (err) reject(err);
                if (results.length > 0) {
                    var execute_query = false;
                    var query = `UPDATE player_buildings pb
                    INNER JOIN players p ON p.player_id = pb.player_id
                        SET 
                        pb.level = IF (pb.downgrade = 0, pb.level + 1, pb.level - 1),
                        pb.update_start = NULL,
                        pb.downgrade = 0
                    WHERE p.player_id = ? AND pb.building_id IN (`;
                    for (var i = 0; i < results.length; i++) {
                        var b_index;
                        var l_index;
                        if (buildings[results[i].building_id - 1].building_id == results[i].building_id) {
                            b_index = results[i].building_id - 1;
                        } else {
                            b_index = buildings.findIndex(building => building.building_id == results[i].building_id);
                        }

                        if (buildings[b_index].level_details[results[i].level] == (results[i].level - results[i].downgrade)) {
                            l_index = results[i].level;
                        } else {
                            l_index = buildings[b_index].level_details.findIndex(level_detail => level_detail.level == (results[i].level - results[i].downgrade));
                        }
                        if ((utils.get_timestamp() - results[i].update_start - buildings[b_index].level_details[l_index].upgrade_time) > 0) {
                            query += results[i].building_id + ',';
                            execute_query = true;
                        }
                    }
                    if (execute_query) {
                        query = query.slice(0, query.length - 1);
                        query += ')';
                        this.con.query(query, [results[0].player_id], function (err) {
                            if (err) reject(err);
                            resolve();
                        });
                    }
                }
                resolve();
            }.bind(this));
        });
    }

    /**
     * Returns results in following format [{building_id, name, level_details: [{level, upgrade_time, wood_cost, dirt_cost, iron_cost, pop_cost}, upgrade time, ..]}, ..]
     * @param {Array} p_buildings in format [{building_id, level}]. Level can be an array of levels.
     */
    get_building_details(p_buildings) {
        return new Promise((resolve) => {
            var building_details = [];
            var b_index = -1;
            for (var i = 0; i < p_buildings.length; i++) {
                if (!Array.isArray(p_buildings[i].level)) {
                    p_buildings[i].level = [p_buildings[i].level];
                }

                //Buildings are stored in an array. If they are stored storted by building_id, then building with id 1 should be stored at the index 0, id 2 at the index 1, ..
                if (buildings[p_buildings[i].building_id - 1].building_id == p_buildings[i].building_id) {
                    b_index = p_buildings[i].building_id - 1;
                } else {
                    b_index = buildings.findIndex(building => building.building_id == p_buildings[i].building_id);
                }
                building_details.push({building_id: buildings[b_index].building_id, name: buildings[b_index].name, level_details: []});
                for (var j = 0; j < p_buildings[i].level.length; j++) {
                    var l_index = buildings[b_index].level_details.findIndex(level_detail => level_detail.level == p_buildings[i].level[j]);
                    if (l_index != -1) {
                        building_details[i].level_details.push(buildings[b_index].level_details[l_index]);
                    }
                }
            }
            resolve(building_details);
        });
    }

    /**
     * Returns results in following format [{space_object_id, image, x, y, rot, width, height}, ..]
     */
    get_space_objects() {
        return new Promise((resolve,reject) => {
            var query = `SELECT space_object_id, x, y, rot, width, height, image_id
            FROM space_objects`;
            this.con.query(query, function (err, results) {
                if (err) reject(err);
                var b_index = -1;
                for (var i = 0; i < results.length; i++) {
                    if (space_objects[results[i].image_id - 1].space_object_id == results[i].image_id) {
                        b_index = results[i].image_id - 1;
                    } else {
                        b_index = space_objects.findIndex(space_object => space_object.space_object_id == results[i].image_id);
                    }
                    results[i].image = space_objects[b_index].image;
                }
                resolve(results);
            });
        });
    }

    /**
     * Returns results in following format [{galaxy_id, image, x, y, width, height}, ..]
     */
    get_galaxies() {
        return new Promise((resolve,reject) => {
            var query = `SELECT * FROM galaxies`;
            this.con.query(query, function (err, results) {
                if (err) reject(err);
                var b_index = -1;
                for (var i = 0; i < results.length; i++) {
                    if (galaxies[results[i].image_id - 1].galaxy_id == results[i].image_id) {
                        b_index = results[i].image_id - 1;
                    } else {
                        b_index = galaxies.findIndex(galaxy => galaxy.galaxy_id == results[i].image_id);
                    }
                    results[i].image = galaxies[b_index].image;
                }
                resolve(results);
            });
        });
    }

    /**
     * Returns results in following format [{unit_id, name, cost, build_time}, ..]
     * @param {Array} p_units in format [{unit_id}]
     */
    get_unit_details(p_units) {
        return new Promise((resolve) => {
            var unit_details = [];
            var u_index = -1;
            for (var i = 0; i < p_units.length; i++) {
                //Units are stored in an array. If they are stored storted by unit_id, then unit with id 1 should be stored at the index 0, id 2 at the index 1, ..
                if (units[p_units[i].unit_id - 1].unit_id == p_units[i].unit_id) {
                    u_index = p_units[i].unit_id - 1;
                } else {
                    u_index = units.findIndex(unit => unit.unit_id == p_units[i].unit_id);
                }
                unit_details.push(units[u_index]);
            }
            resolve(unit_details);
        });
    }

    /**
     * Returns results in following format [{building_id, name, level_details: [{level, upgrade_time, wood_cost, dirt_cost, iron_cost, pop_cost}, upgrade time, ..]}, ..]
     * @param {string} username username of the user the data is supposed to be loaded for
     * @param {string} p_unit Either a singular unit to get the data for or all of the unit data for the selected user
     */
    get_player_units(username, p_unit) {
        return new Promise((resolve,reject) => {
            var query = `SELECT pu.* 
            FROM player_units pu
            INNER JOIN players p ON p.player_id = pu.player_id
            WHERE p.username = ?`;
            if (p_unit != 'all') {
                var u_index = units.findIndex(unit => unit.name == p_unit);
                query += ' AND pu.unit_id = ' + (u_index + 1);
            }
            this.con.query(query, [username] ,function (err, results) {
                if (err) reject(err);
                resolve(results);
            });
        });
    }

    update_player_unit_que(username) {
        return new Promise((resolve,reject) => {
            this.get_player_unit_ques(username, 'all').then(function(player_unit_ques) {
                for (var i = 0; i < player_unit_ques.length; i++) {
                    if (player_unit_ques[i].count == 0) {
                        continue;
                    }
                    var unit_build_time = units.find(unit => unit.unit_id == player_unit_ques[i].unit_id).build_time;
                    var updated_count = player_unit_ques[i].count - Math.floor((utils.get_timestamp() - player_unit_ques[i].calculated_timestamp) / unit_build_time);
                    updated_count = updated_count > 0 ? updated_count : 0;
                    var created_units = (updated_count - player_unit_ques[i].count) + player_unit_ques[i].count;
                    var time_remainder = updated_count < 1 ? 0 : (utils.get_timestamp() - player_unit_ques[i].calculated_timestamp) % unit_build_time;
                    
                    var query = `UPDATE player_unit_ques puq
                    INNER JOIN players p ON p.player_id = puq.player_id
                    SET 
                        puq.count = ?,
                        puq.calculated_timestamp = NOW() - ?
                    WHERE p.username = ?`;
                    
                    this.con.query(query, [updated_count, time_remainder, username], function (err) {
                        if (err) reject(err);
                    }).then(function() {
                        query = `UPDATE player_units pu
                        INNER JOIN players p ON p.player_id = pu.player_id
                        SET pu.count = ?
                        WHERE p.username = ?`;
                        this.con.query(query, [created_units, username], function (err) {
                            if (err) reject(err);
                        });
                    }.bind(this));
                }
                resolve();
            }.bind(this));
        });
    }

    get_player_unit_ques(username, p_unit) {
        return new Promise((resolve,reject) => {
            var query = `SELECT puq.unit_id, puq.count, UNIX_TIMESTAMP(puq.calculated_timestamp) AS calculated_timestamp
            FROM player_unit_ques puq
            INNER JOIN players p ON p.player_id = puq.player_id
            WHERE p.username = ?`;
            if (p_unit != 'all') {
                var u_index = units.findIndex(unit => unit.name == p_unit);
                query += ' AND puq.unit_id = ' + (u_index + 1);
            }
            this.con.query(query, [username] ,function (err, results) {
                if (err) reject(err);
                resolve(results);
            });
        });
    }

    execute_query(query, argumentArr) {
        return new Promise((resolve,reject) => {
            this.con.query(query, argumentArr, function (err, results) {
                if (err) reject(err);
                resolve(results);
            });
        });
    }

    get_starter_datapack(username, callback) {
        this.update_resource(username, 'all').then(function() {
            this.update_building_level(username, 'all').then(function() {
                this.update_player_unit_que(username, 'all').then(function() {
                    Promise.all([this.get_resource(username, 'all'), this.get_player_building_details(username, 'all'), this.get_player_units(username, 'all'), this.get_player_unit_ques(username, 'all')]).then(values => {
                        for (var i = 0; i < values[1].length; i++) {
                            values[1][i].curr_level = values[1][i].level;
                            values[1][i].level = [values[1][i].level - 1, values[1][i].level, values[1][i].level + 1];
                        }
                        this.get_building_details(values[1]).then(building_results => {
                            this.get_unit_details(values[2]).then(unit_results => {
                                for (var i = 0; i < unit_results.length; i++) {
                                    unit_results[i].count = values[2][i].count;
                                }
                                callback({resources: values[0], buildings: values[1], units: unit_results, unit_ques: values[3], building_details: building_results});
                            });
                        });
                    }).catch(err => { console.log(err) });
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }

    get_map_datapack(layout, callback) {
        if (layout === 'system') {
            this.get_space_objects().then(space_objects => { callback({space_objects: space_objects})}).catch(err => { console.log(err) });
        } else if(layout === 'galaxy') {
            this.get_galaxies().then(galaxies => { callback({galaxies: galaxies})}).catch(err => { console.log(err) });
        }
    }

    build_units(username, p_units) {
        return new Promise((resolve,reject) => {
            this.update_building_level(username, 4, true).then(function() {
                this.get_resource(username, 'all', true).then(function(player_resources) {
                    this.get_player_building_details(username, 4, true).then(function(p_units_building) {
                        var units_building_level_details = buildings.find(building => building.building_id == p_units_building.building_id).level_details
                        var allowed_units = units_building_level_details.find(level_detail => level_detail.level == p_units_building.level).units;
                        var updated_player_resources = Object.assign({}, player_resources);
                        var query = 'UPDATE players SET ';
                        for (var i = 0; i < p_units.length; i++) {
                            var u_index = units.findIndex(unit => unit.unit_id == p_units[i].unit_id);
                            for (var resource in units[u_index].cost) {
                                if (updated_player_resources[resource] > units[u_index].cost[resource] * p_units[i].count) {
                                    if (p_units[i].count > 0 && allowed_units.includes(parseInt(p_units[i].unit_id))) {
                                        updated_player_resources[resource] -= units[u_index].cost[resource] * p_units[i].count;
                                    } else {
                                        p_units.splice(i, 1);
                                    }
                                } else {
                                    reject('Not enough resources to build all units');
                                }
                            }
                        }
                        if (p_units.length < 1) {
                            reject('Invalid units input received');
                        }
                        //Currently expecting units to cost at least 1 of every mentioned resource
                        //If you want to implement free unit or just add cost of 0 for certain resource, will need to change this part of the code
                        //to not execute the query when the units_cost never exceeded 0
                        for (var resource in player_resources) {
                            var units_cost = player_resources[resource] - updated_player_resources[resource];
                            if (units_cost > 0) {
                                query += `${resource} = ${resource} - ${units_cost}, `;
                            }
                        }

                        this.update_player_unit_que(username).then(function() {
                            //remove the ", " part
                            query = query.slice(0, query.length - 2) + ' WHERE username = ?';
                            this.con.query(query, [username], function (err) {
                                if (err) reject(err);
                                for (var i = 0; i < p_units.length; i++) {
                                    query = `UPDATE player_unit_ques puq
                                    INNER JOIN players p ON p.player_id = puq.player_id 
                                    SET puq.count = puq.count + ?, puq.start_time = IF (puq.count = 0, NOW(), puq.start_time)
                                    WHERE p.username = ? AND puq.unit_id = ?`;
                                    this.con.query(query, [p_units[i].count, username, p_units[i].unit_id], function (err) {
                                        if (err) reject(err);
                                    });
                                }
                                resolve();
                            }.bind(this));
                        }.bind(this));
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        });
    }
}

module.exports = DbManager;