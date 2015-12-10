var defaultBehavior = require('./src/default'),
    localBehavior = require('./src/local');

module.exports = function(tokenConfig, config) {
    if (!!process.env.OAUTH_ACCESS_TOKENS) {
        return localBehavior();
    }
    return defaultBehavior(tokenConfig, config);
};
