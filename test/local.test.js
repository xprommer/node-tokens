var localMode = require('../src/local'),
    ENV_VAR = 'OAUTH_ACCESS_TOKENS',
    TEST_TOKENS = 'token1:1234,token2:4321';

describe('node-tokens in local mode', () => {
    var tokens;

    beforeEach(() => {
        process.env[ENV_VAR] = TEST_TOKENS;
        tokens = localMode();
    });

    it('should export get() and MODE', () => {
        expect(Object.keys(tokens).length).to.equal(2);
        expect(tokens.get).to.be.ok;
        expect(tokens.MODE).to.be.ok;
    });

    it('should read tokens from environment', () => {
        expect(tokens.get('token1')).to.equal('1234');
        expect(tokens.get('token2')).to.equal('4321');
    });

    it('should return false if there is no token', () => {
        expect(tokens.get('token3')).to.be.false;
    });
});
