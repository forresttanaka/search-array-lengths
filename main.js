#!/usr/bin/env node

const program = require('commander');
const fs = require('fs');
const fetch = require('node-fetch');
const cliProgress = require('cli-progress');

/**
 * Convert a user key and secret assigned to them on an encoded site to an authorization string for
 * XHR requests.
 * @param {string} key Authorization key from encoded
 * @param {string} secret Authorization secret from encoded
 *
 * @return {string} Authorization string; use in XHR request headers.
 */
const keypairToAuth = (key, secret) => (
    `Basic ${Buffer.from(unescape(encodeURIComponent(`${key}:${secret}`))).toString('base64')}`
);

/**
 * Read a file and return its data in a Promise.
 * @param {string} path to a file
 * @param {string} opts Any encoding option
 *
 * @return {string} Contents of file
 */
const readFile = (path, opts = 'utf8') => (
    new Promise((resolve, reject) => {
        fs.readFile(path, opts, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    })
);

/**
 * Retrieve the JSON contents of the key file that contains the authentication information as well
 * as the URL of the host we'll be searching.
 * @param {string} keyfile keyfile path name
 *
 * @return {Promise} JSON contents of key file
 */
const readKeyfile = async (keyfile) => {
    const results = await readFile(keyfile);
    return JSON.parse(results);
};

/**
 * Create a new cart on the specified host.
 * @param {string} host URL of host to perform search on
 * @param {string} auth base64-encoded key and secret for POST permission
 * @param {number} suffix New carts will start with this suffix "Test Cart {suffix}"
 * @param {bool} debug True to output debug messages to console
 *
 * @return {Promise} Search result object
 */
const newCart = (host, auth, suffix, debug) => {
    if (debug) {
        console.log('NEW CART REQUEST %s:%s', host, suffix);
    }
    return fetch(`${host}/carts/@@put-cart`, {
        method: 'PUT',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: auth,
        },
        body: JSON.stringify({
            name: `Test Cart ${suffix}`,
            locked: false,
        }),
    }).then((response) => {
        if (debug) {
            console.log('NEW CART RESPONSE %o', response);
        }

        // Convert response to JSON
        if (response.ok) {
            return response.json();
        }
        throw new Error(`not ok ${JSON.stringify(response)}`);
    }).catch((e) => {
        console.log('OBJECT LOAD ERROR: %s', e);
    });
};

/**
 * Create multiple new empty carts.
 * @param {number} count Number of new carts to create
 * @param {number} start Starting suffix number for cart name "Test Cart {number}"
 * @param {string} host URL of host on which to create carts
 * @param {string} auth base64-encoded key and secret for POST permission
 * @param {object} progressBar Instance of progress-bar object
 * @param {bool} debug True to output debug messages to console
 *
 * @return {Promise} Promise for cart creation
 */
const multipleNewCarts = async (count, start, host, auth, progressBar, debug) => {
    for (let i = 0; i < count; i += 1) {
        const response = await newCart(host, auth, i + parseInt(start, 10), debug);
        if (debug) {
            console.log('NEW CART JSON %o', response);
        }
        progressBar.update(i + 1);
    }
};

program
    .version('1.0.0')
    .option('-k, --key [key]', 'key of keyfile', 'localhost')
    .option('-f, --keyfile [filename]', 'keyfile name/path', 'keypairs.json')
    .option('-c, --count [number]', 'number of carts to create', '1')
    .option('-s, --start [number]', 'starting cart number', '1')
    .option('-d, --debug', 'Debug flag', false)
    .parse(process.argv);

let keyFileData;
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

readKeyfile(program.keyfile).then((resultJson) => {
    keyFileData = resultJson;
    progressBar.start(program.count, 0);
    const auth = keypairToAuth(keyFileData[program.key].key, keyFileData[program.key].secret);
    return multipleNewCarts(program.count, program.start, keyFileData[program.key].server, auth, progressBar, program.debug);
}).then(() => {
    progressBar.stop();
});
