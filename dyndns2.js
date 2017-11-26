var url = require('url');
var fs = require('fs');
var zonefile = require('dns-zonefile');
var m = require('moment');

/*
  According to https://help.dyn.com/remote-access-api/perform-update/
  ...and for my needs...
  "hostname" and "myip" are the only important query fields
  "wildcard" ignored, "mx" ignored, "backmx" ignored
  I'm only going to worry about "hostname" and "myip"

  I have need of automatically creating new subdomains so I'm going
  to allow "update" with a hostname that doesn't exist yet in zone
  to add the new subdomain to the zone.

  Accordingly, I'm going to adopt the "/nic/delete" extension
  made by nsupdate.info
  (see https://nsupdateinfo.readthedocs.io/en/latest/standards.html)
  so I can remove an unneeded subdomain.
*/

exports.handle = function(req, res) {
    // record query from url
    var url_query = url.parse(req.url, true).query;
    // console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " \nurl_query: " + JSON.stringify(url_query));
    
    // check query is valid; no need to continue if it's bad
    if (!url_query.hostname || !url_query.myip) {
        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Missing hostname or ip address in query.");
        res.end("bad");
        return false;
    }

    // validate provided IP address
    var ip_expression = /((^\s*((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\s*$)|(^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$))/;
    if (!ip_expression.test(url_query.myip)) {
        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Bad IP address in query.");
        res.end("bad");
        return false;
    } 
 
    // create new object to store details for this request
    var dyndns2_obj = {};

    // get hosts to update
    // while we're at it, can we check the zone files too?
    get_hosts_to_update(dyndns2_obj, req, res);
    //console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " \ndyndns2_obj: " + JSON.stringify(dyndns2_obj));

    // record myip
    dyndns2_obj.myip = url_query.myip;
    //console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " \ndyndns2_obj: " + JSON.stringify(dyndns2_obj));

    // determine action_to_take: update or delete
    get_action_to_take(dyndns2_obj, req, res);
    //console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " \ndyndns2_obj: " + JSON.stringify(dyndns2_obj));

    // TODO
    //  we need to determine if files exist for each domain in query
    //  if any domain has no local zonefile, we should do nothing
    //  so as not to be confusing
    //  AND we can use this opportunity to save the zone filenames
    //  in the dyndns2_obj so we don't have to get them again
    var missing_domain_zonefiles = get_all_zonefiles(dyndns2_obj);
    //console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " \ndyndns2_obj: " + JSON.stringify(dyndns2_obj));
    //console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " \n");
    if (missing_domain_zonefiles.length > 0) {
        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Zone file does not exist for domain(s):" + missing_domain_zonefiles);
        res.end("bad");
        return false;
    }



    // So now we know all the domains needing updating, and their hosts
    // and whether we're going to update/delete information
    // all stored in dyndns2_obj
    // it's time to update the zone files
    // and we need to make sure a file exists for each domain,
    // but we can do that in the update/delete functions
    var result = "nochg";
    for (var domain in dyndns2_obj.hosts_to_update) {
        if (dyndns2_obj.hosts_to_update.hasOwnProperty(domain)) {
            var new_result = process_domain(dyndns2_obj, domain);
            // If we're doing multiple domains and any of them return good, keep that result:
            if (new_result == "good") {
                result = new_result;
            }
        }
    }

    // now if we have a "good" result we should do
    //    nsd-control reload <domain> && nsd-control notify <domain>
    // http://nodejs.org/api.html#_child_processes
    if (result == "good") {
        var exec = require('child_process').exec;
        exec('nsd-control reload', function(error, stdout, stderr) {
            console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + ' nsd-control reload stdout: ' + stdout);
            console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + ' nsd-control reload stderr: ' + stderr);
            if (error !== null) {
                console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + ' nsd-control reload exec error: ' + error);
            }
        });
        exec('nsd-control notify', function(error, stdout, stderr) {
            console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + ' nsd-control reload stdout: ' + stdout);
            console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + ' nsd-control reload stderr: ' + stderr);
            if (error !== null) {
                console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + ' nsd-control reload exec error: ' + error);
            }
        });
    }

    console.log(result);
    res.end(result);
}

function process_domain(dyndns2_obj, domain) {
    var hosts_to_update = dyndns2_obj.hosts_to_update[domain].hosts;
    var zonefile_to_change = dyndns2_obj.hosts_to_update[domain].zonefile;
    var action_to_take = dyndns2_obj.action_to_take;

    // assume ipv4 A records need changing
    var record_type = "a";
    // but if ipv6 detected, then ipv6 AAAA records need changing
    if (dyndns2_obj.myip.indexOf(":") > -1) { record_type = "aaaa"; }
    //console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Is ipv6? : " + is_ipv6 + " IP: " + myip);

    // read zone file to change into zone object
    var text = fs.readFileSync(zonefile_to_change, 'utf8');
    var zone_obj = zonefile.parse(text);
    //console.log(JSON.stringify(zone_obj[record_type]));

    // assume no change, we'll flip this if we do make changes
    var change = false;

    if ( action_to_take == "update" ) {
        // loop through hosts
        hosts_to_update.forEach(function update_host(host) {
            // is host in the zone_obj?
            var record_found = false;
            zone_obj[record_type].forEach(function identify_record(record) {
                if (record.name == host) {
                    console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Found: " + JSON.stringify(record));
                    record_found = true;
                    if (record.ip !== dyndns2_obj.myip) {
                        record.ip = dyndns2_obj.myip;
                        change = true;
                        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Modified to: " + JSON.stringify(record));
                    }
                    if (record_found && !change) {
                        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Nothing modified for: " + JSON.stringify(record))
                    }
                }
            });
            if (!record_found) {
                var record = {};
                record.name = host;
                record.ip = dyndns2_obj.myip;
                record.ttl = process.env.DYNDNS_DEFAULT_DYN_TTL;
                zone_obj[record_type].push(record);
                change = true;
                console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Record not found. Added record: " + JSON.stringify(record));
            }
        });
    } else if ( action_to_take == "delete" ) {
        hosts_to_update.forEach(function update_host(host) {
            // is host in the zone_obj?
            var record_found = false;
            zone_obj[record_type].forEach(function identify_record(record, index) {
                if (record.name == host) {
                    console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Found: " + JSON.stringify(record));
                    record_found = true;
                    var removed_record = zone_obj[record_type].splice(index, 1);
                    change = true;
                    console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Deleted: " + JSON.stringify(removed_record))
                }
            });
        });
    }

    if (change) {
    // in case we're going to modify the zonefile, let's get the new serial
        var new_serial = get_serial(zone_obj);
        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Old serial is " + zone_obj.soa.serial +
                                                          ", New serial is " + new_serial);
        zone_obj.soa.serial = new_serial;
        fs.writeFileSync(zonefile_to_change, zonefile.generate(zone_obj));
        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Changes written to: " + zonefile_to_change);
    }

    // console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " After change, zone_obj is " + JSON.stringify(zone_obj));

    if (change) { return "good"; }
    else return "nochg";
}


function getAllFilesFromFolder(dir) {
    var results = [];

    fs.readdirSync(dir).forEach(function(file) {
        file = dir+'/'+file;
        var stat = fs.statSync(file);

        if (stat && !stat.isDirectory()) {
            results.push(file);
        } 
    });

    return results;
};

function get_zone_file_to_change(domain) {
    // grab zonefile location
    var zonefile_location = process.env.DYNDNS_ZONEFILE_LOCATION;
    // get list of files in location
        var files_list = [];
        files_list = getAllFilesFromFolder(zonefile_location);
        if (files_list.length < 1) {
            console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " No files exist! No modifications can be made.");
            return "";
        }

    // get any files matching current domain
        var candidates = [];
        files_list.forEach(function(file) {
            if (file.indexOf(domain) > -1) {
                candidates.push(file);
            }
        });
        if (candidates.length < 1) {
            console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " No candidate file for " + domain + " found, no changes can be made.");
            return "";
        }

    // assuming we have one or more candidate files to modify,
    // we're just going to use the first one
    return candidates[0];
}

function get_serial(zone_obj) {
    var old_serial = zone_obj.soa.serial;
    var old_serial_date = Math.floor(old_serial / 100);
    // var new_date_year = d.getFullYear().toString();
    // var new_date_mo = (d.getMonth()+1).toString();
    //     if (new_date_mo.length == 1) { new_date_mo = "0" + new_date_mo }
    // var new_date_day = d.getDate().toString();
    //     if (new_date_day.length == 1) { new_date_day = "0" + new_date_day }
    // var new_serial_date = parseInt(new_date_year + new_date_mo + new_date_day);
    var new_serial_date = m().format('YYYYMMDD');
    //console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Serial is " + old_serial_date + " and new date is " + new_serial_date);
    if (old_serial_date >= new_serial_date) {
        var new_serial = old_serial + 2;
    } else {
        var new_serial = new_serial_date * 100;
    }
    return new_serial;
}

function get_hosts_to_update(dyndns2_obj, req, res) {
    // create array of hosts from comma-separated hostname parameter
    var hosts_arr = url.parse(req.url, true).query.hostname.split(",");

    // do a simple, imperfect test of hostname validity
    var hostname_ok = true;
        // use simple regex
        var reg = new RegExp("[^a-z0-9-.]","i");
        hosts_arr.forEach(function check_host(host) {
            if (reg.test(host)) { hostname_ok = false;}
            // also check if hostname includes "." -- we think it should
            if (host.indexOf('.') == -1) { hostname_ok = false;}
        });

    // check there are fewer than 20 hosts provided, as per API
    // and also report 'bad' if we found any hostname invalid
    if (hosts_arr.length > 20 || !hostname_ok) {
        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Invalid hostname in query.");
        res.end("bad");
        return false;
    }

    // generate hosts_to_update object we can work through to process updates
    // format: { domain1: array_of_domain1_subdomains_to_process,
    //           domain2: array_of_domain2_subdomains_to_process }
    var hosts_to_update = {};
    hosts_arr.forEach(function get_domain_json(host){
        var host_parts = host.split(".");
        var domain = host_parts[host_parts.length-2] + "." + host_parts[host_parts.length-1];
        host = host.slice(0,-(domain.length+1))
        if (!hosts_to_update.hasOwnProperty(domain)) {
            hosts_to_update[domain] = {};
            var domain_host_array = [];
            domain_host_array.push(host);
            hosts_to_update[domain].hosts = domain_host_array;
        } else {
            hosts_to_update[domain].hosts.push(host);
        }
    });
    dyndns2_obj.hosts_to_update = hosts_to_update;
}

function get_action_to_take(dyndns2_obj, req, res) {
    // record the url path, which will tell us whether to update or delete
    req_path = url.parse(req.url).pathname;

    if (req_path.indexOf("update") !== -1) {
        dyndns2_obj.action_to_take = "update";
    } else if (req_path.indexOf("delete") !== -1) {
        dyndns2_obj.action_to_take = "delete";
    } else {
        console.log(m().format('YYYY-MM-DD hh:mm:ss Z') + " Well, something went wrong...");
        res.end("bad");
        return false;
    }
}

function get_all_zonefiles(dyndns2_obj) {
    var missing_domain_zonefiles = "";
    for (var domain in dyndns2_obj.hosts_to_update) {
        // get zone file to change
        var zonefile_to_change = get_zone_file_to_change(domain);
        // return bad to main process if no zonefile found for this domain
        if (!zonefile_to_change || zonefile_to_change == "") {
            all_zonefiles_exist = false;
            missing_domain_zonefiles += (" " + domain + "...");
        } else {
            dyndns2_obj.hosts_to_update[domain].zonefile = zonefile_to_change;
        }
    }
    return missing_domain_zonefiles;
}