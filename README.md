# Create multiple carts

This node script creates multiple carts on an ENCODE demo, on production, or on ENCODE test.

To install, clone this repo locally, then in its directory install the required npm packages.

```
$ npm i
```

As this requires posting to an ENCODE instance, you first have to create an access key and secret on the target host in your user profile. Once you have these items, copy them to the `keypairs.json` file in any target’s object, or by adding a new target with a new unique key. Copy your public access key to the entry’s `key` property, and your secret key to the `secret` property. Make sure you discard these changes when you’re done.

You can then execute the main script:

```
$ node main.js
```

## Usage

```
Options:
  -V, --version             output the version number
  -k, --key [key]           key of keyfile (default: "localhost")
  -f, --keyfile [filename]  keyfile name/path (default: "keypairs.json")
  -c, --count [number]      number of carts to create (default: "1")
  -s, --start [number]      starting cart number (default: "1")
  -d, --debug               Debug flag (default: false)
  -h, --help                display help for command
```
