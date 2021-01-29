#!/usr/bin/env node

const program = require('commander');
const fs = require('fs');
const fetch = require('node-fetch');
const cliProgress = require('cli-progress');

/** Number of objects to get in one chunk */
const CHUNK_SIZE = 500;

/** Create a new progress bar */
const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

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
 * Convert arbitrary text into a form the ENCODE portal can use in query-string values.
 * @param value {string} Value to convert
 *
 * @return {string} converted value.
 */
const encodedURIComponent = (value) => (
    encodeURIComponent(value)
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/%3A/g, ':')
        .replace(/%20/g, '+')
);

/**
 * Extract the value of an object property based on a dotted-notation field,
 * e.g. { a: 1, b: { c: 5 }} you could retrieve the 5 by passing 'b.c' in `field`.
 * Based on https://stackoverflow.com/questions/6393943/convert-javascript-string-in-dot-notation-into-an-object-reference#answer-6394168
 * @param {object} object Object containing the value you want to extract.
 * @param {string} field  Dotted notation for the property to extract.
 *
 * @return {value} Whatever value the dotted notation specifies, or undefined if unavailable.
 */
const getObjectFieldValue = (object, field) => {
    const parts = field.split('.');
    if (parts.length === 1) {
        return object[field];
    }
    return parts.reduce((partObject, part) => partObject && partObject[part], object);
};

/**
 * Get a chunk of object search results.
 * @param {string} host URL of host to perform search on
 * @param {string} auth base64-encoded key and secret for POST permission
 * @param {string} type Type of object to retrieve e.g. Experiment
 * @param {string} field Property of object to retrieve e.g. file.@id
 * @param {number} from Search result index to start from
 * @param {bool} debug True to output debugging messages
 *
 * @return {Promise} Search result object
 */
const getChunk = (host, auth, type, field, filters, from, debug) => {
    const searchUrl = `${host}/report/?type=${type}${filters ? `&${filters}` : ''}&limit=${CHUNK_SIZE}&from=${from}&field=${encodedURIComponent(field)}`;
    if (debug) {
        console.log('REQUEST %s:%s:%s\n%s', host, type, field, searchUrl);
    }
    return fetch(searchUrl, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
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
 * Get all requested search-result chunks.
 * @param {string} host URL of host to perform search on
 * @param {string} auth base64-encoded key and secret for POST permission
 * @param {string} type Type of object to retrieve e.g. Experiment
 * @param {string} field Property of object to retrieve e.g. file.@id
 * @param {number} less Filter to array lengths <= this value
 * @param {number} greater Filter to array lengths >= this value
 * @param {bool} debug True to output debugging messages
 */
const getAllChunks = async (host, auth, type, field, filters, less, greater, debug) => {
    let from = 0;
    let chunksEnded = false;
    let total = 0;
    const results = [];
    while (!chunksEnded) {
        const chunk = await getChunk(host, auth, type, field, filters, from, debug);
        chunksEnded = chunk['@graph'].length === 0;
        if (!chunksEnded) {
            // Update the progress bar once we know how many results we should see.
            if (total === 0) {
                total = chunk.total;
                progressBar.start(total, 0);
            }

            // For each result, add any that satisfy the user's array-length criteria to the
            // results.
            chunk['@graph'].forEach((obj) => {
                const lengthField = field.includes('.') ? field.substring(0, field.lastIndexOf('.')) : field;
                const value = getObjectFieldValue(obj, lengthField);
                if (value && value.length >= greater && value.length <= less) {
                    results.push(`${obj['@id']} - ${value.length}`);
                }
            });

            // Update progress and go to the next chunk starting index.
            from += CHUNK_SIZE;
            progressBar.update(from);
        }
    }
    return results;
};

program
    .version('1.0.0')
    .option('-k, --key [key]', 'key of keyfile', 'localhost')
    .option('-f, --keyfile [filename]', 'keyfile name/path', 'keypairs.json')
    .option('-t, --type [string]', 'type of objects to search', 'Experiment')
    .option('-p, --property [string]', 'property to search', 'files.@id')
    .option('-a, --filter [string]', 'additional filters', '')
    .option('-g, --greater [string]', 'filter to array lengths >= this', '1')
    .option('-l, --less [string]', 'filter to array lengths <= this', Number.MAX_VALUE)
    .option('-d, --debug', 'Debug flag', false)
    .parse(process.argv);

let keyFileData;

readKeyfile(program.keyfile).then((resultJson) => {
    keyFileData = resultJson;
    const auth = keypairToAuth(keyFileData[program.key].key, keyFileData[program.key].secret);
    return getAllChunks(keyFileData[program.key].server, auth, program.type, program.property, program.filter, program.less, program.greater, program.debug);
}).then((searchResults) => {
    progressBar.stop();
    console.log('\n%s results', searchResults.length);
    searchResults.forEach((result) => {
        console.log(result);
    });
});
