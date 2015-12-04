var superagent = require('superagent'),
    winston = require('winston'),
    path = require('path'),
    fs = require('fs');

module.exports = function NodeTokens(tokenConfig, config) {
    var tokenConfig = tokenConfig || {},
        config = config || {},
        STOP = false,
        TOKENS = {},
        EXPIRES = {},
        EXPIRE_THRESHOLD = config.expireThreshold || 60,
        REFRESH_INTERVAL = config.refreshInterval || 10000,
        REALM = config.realm || process.env.TOKENS_REALM || '/services',
        CREDENTIALS_DIR = config.credentialsDir || process.env.CREDENTIALS_DIR,
        OAUTH_TOKENINFO_URL = config.oauthTokeninfoUrl || process.env.OAUTH_TOKENINFO_URL,
        OAUTH_TOKEN_URL = config.oauthTokenUrl || process.env.OAUTH_TOKEN_URL;

    function readJSON(dir, file) {
        return JSON.parse(String(fs.readFileSync(path.join(dir, file))));
    }

    function constructValidityRequest(tokenName) {
        return superagent
                .get(OAUTH_TOKENINFO_URL)
                .query({
                    access_token: TOKENS[tokenName]
                });
    }

    function checkTokenValidity(tokenName) {
        if (!TOKENS[tokenName]) {
            var msg = `Token ${tokenName} does not exist.`;
            winston.debug(msg);
            return Promise.reject(new Error(msg));
        }
        var constructValidityRequestFn = config.constructValidityRequestFn || constructValidityRequest;
        return new Promise((resolve, reject) => {
            constructValidityRequestFn(tokenName)
            .end((err, response) => {
                if (err) {
                    winston.debug('Token', tokenName, 'is invalid.');
                    return reject(err);
                }
                winston.debug('Token', tokenName, 'is still valid.');
                resolve(response.body);
            });
        });
    }

    function constructObtainRequest(tokenName, client, user) {
        var client = client || readJSON(CREDENTIALS_DIR, 'client.json'),
            user = user || readJSON(CREDENTIALS_DIR, 'user.json');

        return superagent
                .post(OAUTH_TOKEN_URL)
                .query({
                    realm: REALM
                })
                .auth(client.client_id, client.client_secret)
                .type('form')
                .send({
                    grant_type: 'password',
                    username: user.application_username,
                    password: user.application_password,
                    scope: tokenConfig[tokenName].scope || []
                });
    }

    function obtainToken(tokenName) {
        return new Promise((resolve, reject) => {
            var constructObtainRequestFn = config.constructObtainRequestFn || constructObtainRequest;

            constructObtainRequestFn(tokenName)
            .end((err, response) => {
                if (err) {
                    winston.error('Could not obtain token', tokenName, err);
                    return reject(err);
                }
                resolve(response.body);
            });
        });
    }

    function setToken(tokenName, tokenResponse) {
        if (tokenResponse) {
            TOKENS[tokenName] = tokenResponse.access_token;
            winston.info('Obtained new token', tokenName);
        }
        return tokenResponse;
    }

    function updateToken(tokenName) {
        // whyyy are there no default parameters yet
        var checkTokenValidityFn = config.checkTokenValidityFn || checkTokenValidity,
            obtainTokenFn = config.obtainTokenFn || obtainToken;

        return checkTokenValidityFn(tokenName)
                .then(function(tokeninfo) {
                    if (tokeninfo.expires_in < EXPIRE_THRESHOLD) {
                        throw new Error();
                        // will be catched further down
                    }
                })
                .catch(() => obtainTokenFn(tokenName))
                .then(response => setToken(tokenName, response));
    }

    function stop() {
        if (!STOP) {
            STOP = true;
        }
    }

    function scheduleUpdates() {
        if (STOP) {
            return;
        }

        Object
        .keys(tokenConfig)
        .map(config.updateTokenFn || updateToken)
        .reduce((prev, cur) => prev.then(cur), Promise.resolve())
        .then(() => {
            console.log()
            // ensure we land in catch()
            throw new Error();
        })
        .catch(err => setTimeout(scheduleUpdates, REFRESH_INTERVAL));
    }

    if (process.env.NODE_ENV === 'NODE_TOKENS_TEST') {
        return {
            readJSON,
            updateToken,
            tokens: TOKENS,
            constructObtainRequest,
            constructValidityRequest,
            checkTokenValidity,
            obtainToken,
            stop,
            scheduleUpdates
        }
    }

    scheduleUpdates();
    // return getter function to avoid
    // overwriting a token by accident
    return {
        stop,
        get: x => TOKENS[x]
    };
}