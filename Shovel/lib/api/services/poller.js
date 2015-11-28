var monorail = require('./../monorail/monorail');
var ironic = require('./../openstack/ironic');
var Promise = require('bluebird');

module.exports.startPoller = function startPoller() {
    var ironic_client;
    var time_interval;

    time_interval = 20000;
    setInterval(function () {
        return new Promise(function (resolve, reject) {
            ironic.get_client(function (client) {
                ironic_client = client;
                client.get_node_list(function (result) {
                    resolve(result);
                });
            });
        }).then(function (result) {
                var ironic_nodes = JSON.parse(result).nodes;
                for (var i in ironic_nodes) {
                    console.info('Running poller on :' + ironic_nodes[i].uuid + '::::');
                    ironic_client.get_node(ironic_nodes[i].uuid, function (node_data) {
                        node_data = JSON.parse(node_data);
                        if (node_data != undefined) {
                            if (node_data.error_message) {
                                //continue;
                            }
                            if (node_data.extra && node_data.extra.timer) {
                                //if timer stop is set to true stop the task
                                if (node_data.extra.timer.stop) {
                                    // continue;
                                }
                                else {
                                    var time_now = new Date();
                                    var time_finished = node_data.extra.timer.finish;
                                    time_interval = node_data.extra.timer.timeInteval;
                                    var parsedDate = new Date(Date.parse(time_finished));
                                    var newDate = new Date(parsedDate.getTime() + time_interval);
                                    if (newDate < time_now) {
                                        node_data.extra.timer.start = new Date().toJSON();
                                        if (node_data.extra.timer.isDone) {
                                            node_data.extra.timer.isDone = false;
                                            updateSelinfo(ironic_client, node_data);
                                        }
                                    }
                                }
                            }
                            else {
                                //continue
                            }
                        }
                    });
                }
            });
    }, 5000);
}
function updateSelinfo(ironic_client, node_data) {
    console.info(node_data.extra.nodeid);
    return getSeldata(node_data.extra.nodeid).
        then(function (result) {
            if (result != undefined) {
                console.info(result);
                result = JSON.parse(result);
                if (result[0] && result[0].sel) {
                    console.info('node_data.extra.eventcnt += 1');
                    node_data.extra.eventcnt += 1;
                }
            }
            else {
                console.info('request_poller_data_get return null => terminate task for :' + node_data.uuid);
                return;
            }
            //update finish time
            node_data.extra.timer.finish = new Date().toJSON();
            node_data.extra.timer.isDone = true;
            var data = [{ 'path': '/extra', 'value': node_data.extra, 'op': 'replace' }];
            ironic_client.patch_node(node_data.uuid, JSON.stringify(data), function (result) {
                result = JSON.parse(result);
                if (result != undefined) {
                    if (result.error_message) {
                        console.info('unregistered node');
                        return
                    }
                    if (result.extra) {
                        if (result.extra.stop) {
                            console.info('task forced to stop');
                            console.info();
                            return;
                        }
                        console.info(result.extra);
                    }
                }
                return;
            });
        });
}

function getSeldata(identifier) {
    return new Promise(function (resolve) {
        var result;
        monorail.request_poller_get(identifier, function (pollers) {
            if (typeof pollers !== 'undefined') {
                pollers = JSON.parse(pollers);
                for (var i in pollers) {
                    if (pollers[i]['config']['command'] === 'sel') {
                        monorail.request_poller_data_get(pollers[i]['id'], function (data) {
                            resolve(data);
                        });
                    }
                }
            }
            else {
                result = {};
                resolve(result);
            }
        });
    });
}