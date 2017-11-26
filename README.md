# node-dyndns2

## About

This is a simple, quick-and-dirty dynamic dns server in Node.js that can receive DNS updates via the dyndns2 API protocol (both /v3/ and legacy /nic/ as per [dyn.com](https://help.dyn.com/remote-access-api/perform-update/)), and makes changes to locally stored zone files (making use of [dns-zonefile](https://github.com/DualDev/dns-zonefile)).

It will add a subdomain/host if not already present, update existing ones if the IP is different, and, following [nsupdate.info's extension](https://nsupdateinfo.readthedocs.io/en/latest/standards.html), it'll delete a subdomain/host if asked, too.

I coded this for myself, to update my nsd server's host files, so it's hard-wired to run `nsd-control reload` and `nsd-control notify` after modifying zone files.

## Use

As a quick-and-dirty solution, I'm running this with systemd and doing logging at runtime by redirecting output to a logfile, so logging just comes from regular `console.log(whatever)` as the app runs.

You'll need to set three environment variables for the app (which can be done with systemd by reading an environment file when the service loads):

```
DYNDNS_AUTH_TOKEN_BCRYPT_HASH="bcrypthashofyoursupersecretpasswordtoken"
DYNDNS_ZONEFILE_LOCATION="/place/where/your/zone/files/are"
DYNDNS_DEFAULT_DYN_TTL="3333"
```

### DYNDNS_AUTH_TOKEN_BCRYPT_HASH

node-dyndns2 accepts an auth password/token by http basic auth. To avoid storing the actual password/token on the server, you must obtain a bcrypt hash of the password/token, and store that in `DYNDNS_AUTH_TOKEN_BCRYPT_HASH`. You can use the included `hashpass.js` to obtain a hash of your password/token, by executing `node hashpass.js "supersecretpasswordtoken"`

Following duckdns.org, we don't care about the username, it will be ignored. As long as the password provided via http basic auth matches, this app will make whatever updates are asked of it.

### DYNDNS_ZONEFILE_LOCATION

This must be a directory, and it should contain your host zone files. Each file should have the name of its domain in its filename: the zone file for "example.com" could be "example.com.zone" or "example.com" or even "zone_example.com.txt" but not "com.example.zone" or "example_com.zone" -- this app just looks for the first file whose filename includes the domain represented in the hostname it's been asked to update.

In other words, if you send a query to update "some.sub.host.at.my.custom.org" this app will look for zone files in the provided directory whose filename includes "custom.org" and update the IP address for "some.sub.host.at.my"

### DYNDNS_DEFAULT_DYN_TTL

This app makes no changes to the TTL already set for existing hosts. But if you send an update request for a host not found in the zone, it'll add that host, and set a TTL. The app uses a default TTL of "300," but you can override that by setting a value for DYNDNS_DEFAULT_DYN_TTL.

