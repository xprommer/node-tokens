var superagent = require('superagent'),
    winston = require('winston'),
    PACKAGE_NAME = '[node-tokens]',
    fs = require('fs'),
    path = require('path')
    VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'))).version,
    UA_STRING = 'node-tokens (' + VERSION + ')';

module.exports = function DefaultNodeTokens(tokenConfig, config) {
    winston.info('%s Running in default mode.', PACKAGE_NAME);

    var tokenConfig = tokenConfig || {},
        config = config || {},
        STOP = false,
        TOKENS = {},
        EXPIRES = {},
        IN_TEST = process.env.NODE_ENV === 'NODE_TOKENS_TEST',
        BACKOFF_FACTOR = config.backoffFactor || parseInt(process.env.TOKENS_BACKOFF_FACTOR) || 2,
        EXPIRE_THRESHOLD = config.expirationThreshold || parseInt(process.env.TOKENS_EXPIRATION_THRESHOLD, 10) || 60000,
        REFRESH_INTERVAL = config.refreshInterval || parseInt(process.env.TOKENS_REFRESH_INTERVAL, 10) || 10000,
        MAX_REFRESH_INTERVAL = config.maxRefreshInterval || parseInt(process.env.TOKENS_MAX_REFRESH_INTERVAL, 10) || 300000,
        REALM = config.realm || process.env.TOKENS_REALM || '/services',
        CREDENTIALS_DIR = config.credentialsDir || process.env.CREDENTIALS_DIR,
        OAUTH_TOKENINFO_URL = config.oauthTokeninfoUrl || process.env.OAUTH_TOKENINFO_URL,
        OAUTH_TOKEN_URL = config.oauthTokenUrl || process.env.OAUTH_TOKEN_URL,
        refreshInterval = REFRESH_INTERVAL;

    function readJSON(dir, file) {
        return JSON.parse(String(fs.readFileSync(path.join(dir, file))));
    }

    /**
     * Constructs superagent request to tokeninfo endpoint
     *
     * @param  {String} tokenName Name of the token to get info about
     * @return {object} superagent request object
     */
    function constructValidityRequest(tokenName) {
        return superagent
                .get(OAUTH_TOKENINFO_URL)
                .set('User-Agent', UA_STRING)
                .query({
                    access_token: TOKENS[tokenName]
                });
    }

    /**
     * Checks if token is valid. Returns a promise yielding
     * tokeninfo if resolved, rejects if token is invalid or
     * expired locally.
     *
     * @param  {String} tokenName Name of the token to check validity for
     * @return {Promise}
     */
    function checkTokenValidity(tokenName) {
        if (!TOKENS[tokenName]) {
            var msg = `Token ${tokenName} does not exist.`;
            winston.debug('%s %s', PACKAGE_NAME, msg);
            return Promise.reject(new Error(msg));
        }
        var tokeninfo = TOKENS[tokenName];
        if (!tokeninfo.local_expiry) {
            // we don't know when we got that token
            // ask tokeninfo endpoint if it is valid
            var constructValidityRequestFn = config.constructValidityRequestFn || constructValidityRequest;
            return new Promise((resolve, reject) => {
                constructValidityRequestFn(tokenName)
                .end((err, response) => {
                    if (err) {
                        winston.debug('%s Token "%s" is invalid.', PACKAGE_NAME, tokenName);
                        return reject(err);
                    }
                    //TODO edge case where token is still valid but like two seconds.
                    winston.debug('%s Token "%s" is still valid for %s seconds.', PACKAGE_NAME, tokenName, response.body.expires_in);
                    resolve(response.body);
                });
            });
        }

        if (tokeninfo.local_expiry < Date.now()) {
            var msg = `Token ${tokenName} expired locally.`;
            winston.debug('%s %s', PACKAGE_NAME, msg);
            return Promise.reject(new Error(msg));
        }
        return Promise.resolve(tokeninfo);
    }

    /**
     * Constructs superagent request to send for a new token.
     *
     * @param  {String} tokenName Name of the token to get a new one
     * @param  {object} client Do not use! For testing only!
     * @param  {object} user Do not use! For testing only!
     * @return {[type]}           [description]
     */
    function constructObtainRequest(tokenName, client, user) {
        var client = client || readJSON(CREDENTIALS_DIR, 'client.json'),
            user = user || readJSON(CREDENTIALS_DIR, 'user.json');

        return superagent
                .post(OAUTH_TOKEN_URL)
                .set('User-Agent', UA_STRING)
                .query({
                    realm: REALM
                })
                .auth(client.client_id, client.client_secret || 'NOT_A_SECRET')
                .type('form')
                .send({
                    grant_type: 'password',
                    username: user.application_username,
                    password: user.application_password,
                    scope: tokenConfig[tokenName].scope ?
                            tokenConfig[tokenName].scope.join(' ') :
                            ''
                });
    }

    /**
     * Executes what constructObtainRequest yields.
     *
     * @param  {String} tokenName Name of the new token we will get
     * @return {Promise}
     */
    function obtainToken(tokenName) {
        return new Promise((resolve, reject) => {
            var constructObtainRequestFn = config.constructObtainRequestFn || constructObtainRequest;

            constructObtainRequestFn(tokenName)
            .end((err, response) => {
                if (err) {
                    winston.error('%s Could not obtain token "%s": %d %s. Response body: %j', PACKAGE_NAME, tokenName, err.status, err.message, (err.response && err.response.body));
                    return reject(err);
                }
                resolve(response.body);
            });
        });
    }

    /**
     * Sets provided tokenReponse locally.
     *
     * @param {String} tokenName Name of the token this reponse is for
     * @param {objet} tokenResponse Response of tokeninfo or token endpoint
     */
    function setToken(tokenName, tokenResponse) {
        // if there is no local_expiry field, this is a new token
        if (tokenResponse && !tokenResponse.local_expiry) {
            TOKENS[tokenName] = tokenResponse;
            TOKENS[tokenName].local_expiry = Date.now() + tokenResponse.expires_in * 1000 - EXPIRE_THRESHOLD;
            winston.info('%s Obtained new token "%s".', PACKAGE_NAME, tokenName);
        }
        // else just return what we have already
        return TOKENS[tokenName];
    }

    /**
     * Checks validity of token and obtains a new one
     * if it's invalid.
     *
     * @param  {String} tokenName Name of the token to update
     * @return {Promise} Will reject if obtainToken failed
     */
    function updateToken(tokenName) {
        // whyyy are there no default parameters yet
        var checkTokenValidityFn = config.checkTokenValidityFn || checkTokenValidity,
            obtainTokenFn = config.obtainTokenFn || obtainToken;

        return checkTokenValidityFn(tokenName)
                .catch(() => obtainTokenFn(tokenName))
                .then(response => setToken(tokenName, response));
    }

    /**
     * Stops the token updating. Used for testing. You probably don't want that.
     */
    function stop() {
        if (!STOP) {
            STOP = true;
        }
    }

    /**
     * Start scheduling updates for all tokens.
     */
    function scheduleUpdates() {
        if (STOP) {
            return;
        }

        var updatePromises = Object.keys(tokenConfig).map(config.updateTokenFn || updateToken);
        Promise
        .all(updatePromises)
        .then((res) => {
            if (refreshInterval > REFRESH_INTERVAL) {
                winston.debug('%s All updates were good, resetting refresh interval.', PACKAGE_NAME);
                refreshInterval = REFRESH_INTERVAL;
            }
            setTimeout(scheduleUpdates, refreshInterval);
        })
        .catch(err => {
            // backoff exponentially by configured factor but cap at MAX_REFRESH_INTERVAL
            refreshInterval = Math.min(MAX_REFRESH_INTERVAL, refreshInterval * BACKOFF_FACTOR);
            winston.error('%s Could not update all tokens, backing off. Retry in %d ms.', PACKAGE_NAME, refreshInterval);
            setTimeout(scheduleUpdates, refreshInterval);
        });
    }

    // if we are testing, expose a whole lot of stuff
    if (IN_TEST) {
        return {
            readJSON,
            updateToken,
            tokens: TOKENS,
            constructObtainRequest,
            constructValidityRequest,
            checkTokenValidity,
            obtainToken,
            stop,
            MODE: 'default',
            scheduleUpdates,
            get: x => TOKENS[x] ? TOKENS[x].access_token : false
        }
    }

    // if not in testing, start scheduling updates
    scheduleUpdates();

    // return getter function to avoid
    // overwriting a token by accident
    return {
        stop,
        MODE: 'default',
        get: x => TOKENS[x] ? TOKENS[x].access_token : false
    };
}
