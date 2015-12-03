var superagent = require('superagent'),
    winston = require('winston'),
    path = require('path'),
    fs = require('fs');

module.exports = function NodeTokens(tokenConfig, config) {
    var tokenConfig = tokenConfig || {},
        config = config || {},
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

    function checkTokenValidity(tokenName, constructValidityRequestParam) {
        if (!TOKENS[tokenName]) {
            winston.debug('Token', tokenName, 'does not exist.');
            return Promise.reject();
        }
        var constructValidityRequestFn = constructValidityRequestParam || constructValidityRequest;
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

    function obtainToken(tokenName, constructObtainRequestParam) {
        return new Promise((resolve, reject) => {
            var constructObtainRequestFn = constructObtainRequestParam || constructObtainRequest;

            constructObtainRequestFn(tokenName)
            .end((err, response) => {
                if (err) {
                    winston.error('Could not obtain token', tokenName, err);
                    return reject(err);
                }
                winston.info('Obtained new token', tokenName);
                resolve(response.body);
            });
        });
    }

    function updateToken(tokenName, checkTokenValidityParam, obtainTokenParam) {
        // whyyy are there no default parameters yet
        var checkTokenValidityFn = checkTokenValidityParam || checkTokenValidity,
            obtainTokenFn = obtainTokenParam || obtainToken;

        return checkTokenValidityFn(tokenName)
                .then(function(tokeninfo) {
                    if (tokeninfo.expires_in < EXPIRE_THRESHOLD) {
                        throw new Error();
                        // will be catched further down
                    }
                })
                .catch(function() {
                    obtainTokenFn(tokenName);
                });
    }

    var intervals = Object
                    .keys(tokenConfig)
                    .reduce(function(ints, name) {
                        // reduce with side effects!
                        obtainToken(name);

                        ints[name] = setInterval(() => (config.updateTokenFn || updateToken)(name), REFRESH_INTERVAL);
                        return ints;
                    },
                    {});

    function stop() {
        Object
        .keys(intervals)
        .forEach(inter => clearInterval(intervals[inter]));
    }

    if (process.env.NODE_ENV === 'NODE_TOKENS_TEST') {
        return {
            intervals,
            readJSON,
            updateToken,
            tokens: TOKENS,
            constructObtainRequest,
            constructValidityRequest,
            checkTokenValidity,
            obtainToken,
            stop
        }
    }

    // return getter function to avoid
    // overwriting a token by accident
    return {
        stop,
        get: x => TOKENS[x]
    };
}