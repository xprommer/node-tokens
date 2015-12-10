var module = require('../index'),
    ENV_VAR = 'OAUTH_ACCESS_TOKENS';

describe('node-tokens', () => {
    afterEach(() => {
        delete process.env[ENV_VAR];
    });

    it('should load local mode if OAUTH_ACCESS_TOKENS is defined', () => {
        process.env[ENV_VAR] = 'token1:1234,token2:4321';
        var behavior = module();
        expect(behavior.MODE).to.equal('local');
    });

    it('should load default mode if OAUTH_ACCESS_TOKENS is not defined', () => {
        var behavior = module();
        expect(behavior.MODE).to.equal('default');
    });
});
