var monorail = require('./../monorail/monorail');
var ironic = require('./../openstack/ironic');
var Promise = require('bluebird');

module.exports.startPoller = function startPoller() {
    var ironic_client;
    var timeInterval;

    timeInterval = 20000;
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
                    console.log('Running poller on :' + ironic_nodes[i].uuid + ':');
                    ironic_client.get_node(ironic_nodes[i].uuid, function (node_data) {
                        node_data = JSON.parse(node_data);
                        if (node_data != undefined) {
                            if (node_data.error_message) {
                                //continue;
                            }
                            else if (node_data.extra && node_data.extra.timer) {
                                //if timer stop is set to true stop the task
                                if (node_data.extra.timer.stop) {
                                    // continue;
                                }
                                else {
                                    var timeNow = new Date();
                                    var timeFinished = node_data.extra.timer.finish;
                                    timeInterval = node_data.extra.timer.timeInterval;
                                    var parsedDate = new Date(Date.parse(timeFinished));
                                    var newDate = new Date(parsedDate.getTime() + timeInterval);
                                    if (newDate < timeNow) {
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
    console.log(node_data.extra.nodeid);
    return getSeldata(node_data.extra.nodeid).
        then(function (result) {
            if (result != undefined) {
                console.log(result);
                result = JSON.parse(result);
                if (result[0] && result[0].sel) {
                    console.log('node_data.extra.eventcnt += 1');
                    node_data.extra.eventcnt += 1;
                }
            }
            else {
                console.log('request_poller_data_get return null => terminate task for :' + node_data.uuid);
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
                        console.log('unregistered node');
                        return
                    }
                    if (result.extra) {
                        if (result.extra.stop) {
                            console.log('task forced to stop');
                            console.log();
                            return;
                        }
                        console.log(result.extra);
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