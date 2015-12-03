# node-tokens

~~~
var createTokens = require('node-tokens');

tokens = createTokens({
    kio: {
        scope: ['application.write']
    },
    mint: {
        scope: ['application.write_sensitive']
    }
});

tokens.get('kio');
~~~


## License

Apache 2.0