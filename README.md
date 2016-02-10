# node-tokens

[![Build Status](https://travis-ci.org/zalando-stups/node-tokens.svg?branch=master)](https://travis-ci.org/zalando-stups/node-tokens) [![Coverage Status](https://coveralls.io/repos/zalando-stups/node-tokens/badge.svg?branch=master&service=github)](https://coveralls.io/github/zalando-stups/node-tokens?branch=master)

## Installation

    npm install node-tokens

## Usage

~~~ javascript
var manageTokens = require('node-tokens');

// note: oauth endpoint configuration omitted
tokens = manageTokens({
    kio: {
        scope: ['application.write']
    },
    mint: {
        scope: ['application.write_sensitive']
    }
});

tokens.get('kio');
> "abcdedf" # or false if there is none yet
~~~

## Configuration

`manageTokens` takes some configuration options as a second argument. These are:

* `expirationThreshold`: Say you want to get a new token 2 minutes before the token actually expires. Then you would set this to `120000`. Defaults to 60 seconds.
* `refreshInterval`: How often you want your tokens to be checked for validity, in ms. Defaults to 10 seconds.
* `backoffFactor`: Factor to multiply the refresh interval when backing off. Defaults to 2, so it would go 100, 200, 400… for a configured interval of 100 ms.
* `maxRefreshInterval`: The maximum interval when backing off. Defaults to 5 minutes.
* `realm`: Realm you want your token to be valid for. Defaults to "/services".
* `credentialsDir`: Where to get client and user credentials, usually already set by Taupage. No default.
* `oauthTokeninfoUrl`: Where to get information about a token. No default!
* `oauthTokenUrl`: Where to get a new token. No default!

### Via environment

You can set the following environment variables to configure the corresponding option:

* `TOKENS_BACKOFF_FACTOR`
* `TOKENS_MAX_REFRESH_INTERVAL`
* `TOKENS_EXPIRATION_THRESHOLD`
* `TOKENS_REFRESH_INTERVAL`
* `CREDENTIALS_DIR`
* `OAUTH_TOKENINFO_URL`
* `OAUTH_TOKEN_URL`

## Local testing

You can set access tokens you want to use via the `OAUTH_ACCESS_TOKENS` environment variable.

    OAUTH_ACCESS_TOKENS="token1:abcdef,token2:cdeafd" node your-app-using-node-tokens.js

`node-tokens` will then not try to call OAuth endpoints e.g. to update a token.

## License

Apache 2.0
