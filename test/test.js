var createTokens = require('../index'),
    basic = x => (new Buffer(x).toString('base64')),
    TEST_TOKENS = {
                    test: {
                        scope: ['write']
                    }
                },
    DEFAULT_CONFIG = {
        oauthTokenUrl: 'https://tokenurl.info',
        oauthTokeninfoUrl: 'https://tokeninfo.url',
        realm: 'realm',
        refreshInterval: 50,
        expireThreshold: 100
    },
    TEST_CLIENT = {
        client_id: 'clientid',
        client_secret: 'clientsecret'
    },
    TEST_USER = {
        application_username: 'user',
        application_password: 'password'
    },
    SA_PASS = {
        end: cb => cb(null, {})
    },
    SA_FAIL = {
        end: cb => cb(new Error('Superagent failure'), null)
    };

describe('node-tokens', () => {
    var t;

    afterEach(() => {
        process.env.NODE_ENV = 'NODE_TOKENS_TEST';
        t.stop();
    });

    it('should expose all functions in test', () => {
        t = createTokens();
        expect(Object.keys(t).length).to.equal(9);
    });

    it('should expose an object by default', () => {
        process.env.NODE_ENV = 'NOT_TEST';
        t = createTokens();
        expect(typeof t.get).to.equal('function');
        expect(typeof t.stop).to.equal('function');
        expect(t.get('test')).to.be.undefined;
    });

    describe('#constructObtainRequest()', () => {
        it('should construct with correct parameters', () => {
            t = createTokens(TEST_TOKENS, {
                    realm: 'realm',
                    oauthTokenUrl: 'https://tokenurl.info'
                });
            var req = t.constructObtainRequest('test', TEST_CLIENT, TEST_USER);

            // method and host
            expect(req.method).to.equal('POST');
            expect(req.protocol).to.equal('https:');
            expect(req.host).to.equal('tokenurl.info');

            // headers
            expect(req.req._headers['content-type']).to.equal('application/x-www-form-urlencoded');
            expect(req.req._headers.authorization).to.equal('Basic ' + basic(`${TEST_CLIENT.client_id}:${TEST_CLIENT.client_secret}`));

            // query
            expect(req.qs.realm).to.equal('realm');

            // body
            expect(req._data).to.be.ok;
            expect(req._data.grant_type).to.equal('password');
            expect(req._data.username).to.equal(TEST_USER.application_username);
            expect(req._data.password).to.equal(TEST_USER.application_password);
        });
    });

    describe('#constructValidityRequest()', () => {
        it('should construct with correct parameters', () => {
            t = createTokens(TEST_TOKENS, {
                oauthTokeninfoUrl: 'https://tokeninfo.url'
            });

            t.tokens.test = 'abcd';

            var req = t.constructValidityRequest('test');
            expect(req.method).to.equal('GET');
            expect(req.url).to.equal('https://tokeninfo.url');
            expect(req.qs.access_token).to.equal('abcd');
        });
    });

    describe('#readJSON()', () => {
        it('should read a JSON file', () => {
            var json = t.readJSON('./', 'package.json');
            expect(json.name).to.equal('node-tokens');
        });
    });

    describe('#checkTokenValidity()', () => {
        it('should reject when there is no token', done => {
            t.checkTokenValidity('asf')
            .catch(() => done());
        });

        it('should resolve when validity is given', done => {
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                constructValidityRequestFn: () => SA_PASS
            }));
            t.tokens.test = 'asdf';

            t
            .checkTokenValidity('test')
            .then(done);
        });

        it('should reject when validity failed', done => {
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                constructValidityRequestFn: () => SA_FAIL
            }));
            t.tokens.test = 'asdf';

            t
            .checkTokenValidity('test')
            .catch(() => done());
        });
    });

    describe('#obtainToken()', () => {
        it('should resolve if token was obtained', done => {
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                constructObtainRequestFn: () => SA_PASS
            }));

            t
            .obtainToken('test')
            .then(done);
        });

        it('should reject if token could not be obtained', done => {
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                constructObtainRequestFn: () => SA_FAIL
            }));

            t
            .obtainToken('test')
            .catch(() => done());
        });
    });

    describe('#updateToken()', () => {
        it('should not try to obtain new if old is valid', done => {
            var tokeninfo = {
                    expires_in: DEFAULT_CONFIG.expireThreshold
                },
                spy = sinon.spy();
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                checkTokenValidityFn: () => Promise.resolve(tokeninfo),
                obtainTokenFn: spy
            }));

            t.updateToken('test')
            .then(() => {
                expect(spy.called).to.be.false;
                done();
            });
        });

        it('should try to obtain new if old expires soon', done => {
            var tokeninfo = {
                    expires_in: DEFAULT_CONFIG.expireThreshold - 1
                },
                spy = sinon.spy();
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                checkTokenValidityFn: () => Promise.resolve(tokeninfo),
                obtainTokenFn: spy
            }));

            t.updateToken('test')
            .then(() => {
                expect(spy.called).to.be.true;
                expect(spy.calledWith('test'));
                done();
            });
        });

        it('should try to obtain new if old is expired already', done => {
            var spy = sinon.spy();
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                checkTokenValidityFn: () => Promise.reject(),
                obtainTokenFn: spy
            }));

            t.updateToken('test')
            .then(() => {
                expect(spy.called).to.be.true;
                expect(spy.calledWith('test'));
                done();
            });
        });

        it('should try to update a token every configured interval', done => {
            var stub = sinon.stub();
            stub.returns(Promise.resolve());
            t = createTokens(TEST_TOKENS, Object.assign(DEFAULT_CONFIG, {
                updateTokenFn: stub
            }));
            t.scheduleUpdates();
            setTimeout(() => {
                expect(stub.callCount).to.equal(2);
                done();
            }, DEFAULT_CONFIG.refreshInterval + 10);
        });
    });
});