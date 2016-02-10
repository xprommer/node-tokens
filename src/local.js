var winston = require('winston'),
    PACKAGE_NAME = '[node-tokens]';

module.exports = function LocalNodeTokens() {
    winston.info('%s Running in local mode.', PACKAGE_NAME);

    var tokenString = process.env.OAUTH_ACCESS_TOKENS;
        tokens = tokenString
                    .split(',')
                    .map(token => token.split(':'))
                    .reduce((acc, t) => {
                        var name = t[0],
                            token = t[1];
                        acc[name] = token;
                        return acc;
                    },
                    {});
    return {
        get: x => tokens[x] || false,
        MODE: 'local'
    };
}
