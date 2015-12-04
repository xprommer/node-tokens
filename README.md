# node-tokens

[![Build Status](https://travis-ci.org/zalando-stups/node-tokens.svg?branch=master)](https://travis-ci.org/zalando-stups/node-tokens) [![Coverage Status](https://coveralls.io/repos/zalando-stups/node-tokens/badge.svg?branch=master&service=github)](https://coveralls.io/github/zalando-stups/node-tokens?branch=master)


## Usage

~~~
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
* `realm`: Realm you want your token to be valid for. Defaults to "/services".
* `credentialsDir`: Where to get client and user credentials, usually already set by Taupage. No default.
* `oauthTokeninfoUrl`: Where to get information about a token. No default!
* `oauthTokenUrl`: Where to get a new token. No default!

### Via environment

You can set the following environment variables to configure the corresponding option:

* `TOKENS_EXPIRATION_THRESHOLD`
* `TOKENS_REFRESH_INTERVAL`
* `CREDENTIALS_DIR`
* `OAUTH_TOKENINFO_URL`
* `OAUTH_TOKEN_URL`

## License

Apache 2.0