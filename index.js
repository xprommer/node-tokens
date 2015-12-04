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
        EXPIRE_THRESHOLD = config.expirationThreshold || parseInt(process.env.TOKENS_EXPIRATION_THRESHOLD, 10) || 60000,
        REFRESH_INTERVAL = config.refreshInterval || parseInt(process.env.TOKENS_REFRESH_INTERVAL, 10) || 10000,
        REALM = config.realm || process.env.TOKENS_REALM || '/services',
        CREDENTIALS_DIR = config.credentialsDir || process.env.CREDENTIALS_DIR,
        OAUTH_TOKENINFO_URL = config.oauthTokeninfoUrl || process.env.OAUTH_TOKENINFO_URL,
        OAUTH_TOKEN_URL = config.oauthTokenUrl || process.env.OAUTH_TOKEN_URL;

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
            winston.debug(msg);
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
                        winston.debug('Token', tokenName, 'is invalid.');
                        return reject(err);
                    }
                    //TODO edge case where token is still valid but like two seconds.
                    winston.debug('Token', tokenName, 'is still valid.');
                    resolve(response.body);
                });
            });
        }

        if (tokeninfo.local_expiry < Date.now()) {
            var msg = `Token ${tokenName} expired locally.`;
            winston.debug(msg);
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
                    winston.error('Could not obtain token', tokenName, err);
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
            winston.info('Obtained new token', tokenName);
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

        Object
        .keys(tokenConfig)
        .map(config.updateTokenFn || updateToken)
        .reduce((prev, cur) => prev.then(cur), Promise.resolve())
        .then(() => {
            // ensure we land in catch()
            throw new Error();
        })
        .catch(err => setTimeout(scheduleUpdates, REFRESH_INTERVAL));
    }

    // if we are testing, expose a whole lot of stuff
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
        get: x => TOKENS[x] ? TOKENS[x].access_token : false
    };
}