#!/usr/bin/env node

const program = require('commander');
const fs = require('fs');
const fetch = require('node-fetch');
const cliProgress = require('cli-progress');

/** Number of objects to get in one chunk */
const CHUNK_SIZE = 500;

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

const encodedURIComponent = value => (
    encodeURIComponent(value)
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/%3A/g, ':')
        .replace(/%20/g, '+')
);

/**
 * Create a new cart on the specified host.
 * @param {string} host URL of host to perform search on
 * @param {string} auth base64-encoded key and secret for POST permission
 * @param {number} suffix New carts will start with this suffix "Test Cart {suffix}"
 * @param {bool} debug True to output debug messages to console
 *
 * @return {Promise} Search result object
 */
const getChunk = (host, auth, type, field, from, debug) => {
    if (debug) {
        console.log('REQUEST %s:%s:%s', host, type, field);
    }
    return fetch(`${host}/report/?type=${type}&limit=${CHUNK_SIZE}&from=${from}&field=${encodedURIComponent(field)}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: auth,
        },
    }).then((response) => {
        if (debug) {
            console.log('SEARCH RESPONSE %o', response);
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
 * Extract the value of an object property based on a dotted-notation field,
 * e.g. { a: 1, b: { c: 5 }} you could retrieve the 5 by passing 'b.c' in `field`.
 * Based on https://stackoverflow.com/questions/6393943/convert-javascript-string-in-dot-notation-into-an-object-reference#answer-6394168
 * @param {object} object Object containing the value you want to extract.
 * @param {string} field  Dotted notation for the property to extract.
 *
 * @return {value} Whatever value the dotted notation specifies, or undefined.
 */
const getObjectFieldValue = (object, field) => {
    const parts = field.split('.');
    if (parts.length === 1) {
        return object[field];
    }
    return parts.reduce((partObject, part) => partObject && partObject[part], object);
};

const getAllChunks = async (host, auth, type, field, less, greater, debug) => {
    let from = 0;
    let chunksEnded = false;
    const results = [];
    while (!chunksEnded) {
        const chunk = await getChunk(host, auth, type, field, from, debug);
        chunksEnded = chunk['@graph'].length === 0;
        if (!chunksEnded) {
            chunk['@graph'].forEach((obj) => {
                const lengthField = field.substring(0, field.lastIndexOf('.'));
                const value = getObjectFieldValue(obj, lengthField);
                if (value && value.length >= greater && value.length <= less) {
                    console.log('%s - %s', obj['@id'], value.length);
                }
            });
            from += CHUNK_SIZE;
        }
    }
};

program
    .version('1.0.0')
    .option('-k, --key [key]', 'key of keyfile', 'localhost')
    .option('-f, --keyfile [filename]', 'keyfile name/path', 'keypairs.json')
    .option('-t, --type [string]', 'type of objects to search', 'Experiment')
    .option('-p, --property [string]', 'property to search', 'files.@id')
    .option('-g, --greater [string]', 'filter to array lengths >= this', '1')
    .option('-l, --less [string]', 'filter to array lengths <= this', Number.MAX_VALUE)
    .option('-d, --debug', 'Debug flag', false)
    .parse(process.argv);

let keyFileData;
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

readKeyfile(program.keyfile).then((resultJson) => {
    keyFileData = resultJson;
    const auth = keypairToAuth(keyFileData[program.key].key, keyFileData[program.key].secret);
    return getAllChunks(keyFileData[program.key].server, auth, program.type, program.property, program.less, program.greater, program.debug);
}).then((searchResults) => {
});
