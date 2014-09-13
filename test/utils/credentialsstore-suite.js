require('./test/dependencies');
requireAndLoad('./src/utils/credentialsstore', 'RemoteStorage.util.CredentialsStore');

define(['require'], function(require) {

  var suites = [];

  suites.push({
    desc: 'CredentialsStore suite',
    setup: function (env, test) {
      env.baseClient = {
        on: function(eventName, handler) { env.handlers[eventName].push(handler); },
        uuid: function () { return 'test'; },
      };
      env.responses = {};
      env.handlers = {
        change: []
      };

      function mock(obj, functionName) {
        obj[functionName] = function() {
          var i, input = [functionName].concat(Array.prototype.slice.call(arguments));
          if (!env.responses[input]) {
            console.log('MISSING (or falsy) RESPONSE', input, Object.keys(env.responses));
          }
          env.called.push(input);
          if (env.responses[input] === 'ERROR') {
            throw 'mocked error';
          }
          return env.responses[input];
        };
      }
      mock(env.baseClient, 'getFile');
      mock(env.baseClient, 'storeFile');
      mock(env.baseClient, 'validate');
      global.sjcl = {};
      mock(global.sjcl, 'encrypt');
      mock(global.sjcl, 'decrypt');
      env.credentialsStore = new RemoteStorage.util.CredentialsStore('foo', env.baseClient);
      test.done();
    },
    tests: [

      {
        desc: "set and get, no encryption",
        run: function (env, test) {
          var storeFilePromise = promising(), getFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ ['validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }] ] = { valid: true };
          env.responses[ ['storeFile', 'application/json', 'foo',
              JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' })] ] = storeFilePromise;
          env.responses[ ['getFile', 'foo', undefined] ] = getFilePromise;

          env.credentialsStore.set({some: 'conf'}).then(function() {
            return env.credentialsStore.get(undefined);
          }).then(function(res) {
            test.assertAnd(res, {some: 'conf'});
            test.assertAnd(env.called, [
             [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ],
             [ 'storeFile', 'application/json', 'foo', '{"some":"conf","@context":"http://remotestorage.io/spec/modules/foo"}' ],
             [ 'getFile', 'foo', undefined ]
            ]);
            test.done();
          });
          storeFilePromise.fulfill({});
          getFilePromise.fulfill({
            data: JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }),
            mimeType: 'application/json'
          });
        }
      },

      {
        desc: "set and get, with encryption",
        run: function (env, test) {
          var storeFilePromise = promising(), getFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ] ] = { valid: true };
          env.responses[ [ 'encrypt', 'my secret',
              JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ] ] = 'crypto-crypto';
          env.responses[ [ 'storeFile', 'application/json', 'foo', 'AES-CCM-128:crypto-crypto' ] ] = storeFilePromise;
          env.responses[ [ 'getFile', 'foo', undefined ] ] = getFilePromise;
          env.responses[ [ 'decrypt', 'my secret', 'crypto-crypto' ] ] =
              JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' });

          env.credentialsStore.set('my secret', {some: 'conf'}).then(function() {
            return env.credentialsStore.get('my secret');
          }).then(function(res) {
            test.assertAnd(res, {some: 'conf'});
            test.assertAnd(env.called, [
             [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ],
             [ 'encrypt', 'my secret', JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ],
             [ 'storeFile', 'application/json', 'foo', 'AES-CCM-128:crypto-crypto' ],
             [ 'getFile', 'foo', undefined ],
             [ 'decrypt', 'my secret', 'crypto-crypto' ]
            ]);
            test.done();
          });
          storeFilePromise.fulfill({});
          getFilePromise.fulfill({
            data: 'AES-CCM-128:crypto-crypto',
            mimeType: 'application/json'
          });
        }
      },

      {
        desc: "set and get, with encryption, wrong password",
        run: function (env, test) {
          var storeFilePromise = promising(), getFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ] ] = { valid: true };
          env.responses[ [ 'encrypt', 'my secret',
              JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ] ] = 'crypto-crypto';
          env.responses[ [ 'storeFile', 'application/json', 'foo', 'AES-CCM-128:crypto-crypto' ] ] = storeFilePromise;
          env.responses[ [ 'getFile', 'foo', undefined ] ] = getFilePromise;
          env.responses[ [ 'decrypt', 'not my secret', 'crypto-crypto' ] ] = 'ERROR';

          env.credentialsStore.set('my secret', {some: 'conf'}).then(function() {
            return env.credentialsStore.get('not my secret');
          }).then(function() {
            test.result(false, 'get should have failed here');
          }, function(err) {
            test.assertAnd(err, 'could not decrypt foo with that password');
            test.assertAnd(env.called, [
             [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ],
             [ 'encrypt', 'my secret', JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ],
             [ 'storeFile', 'application/json', 'foo', 'AES-CCM-128:crypto-crypto' ],
             [ 'getFile', 'foo', undefined ],
             [ 'decrypt', 'not my secret', 'crypto-crypto' ]
            ]);
            test.done();
          });
          storeFilePromise.fulfill({});
          getFilePromise.fulfill({
            data: 'AES-CCM-128:crypto-crypto',
            mimeType: 'application/json'
          });
        }
      },

      {
        desc: "set without encryption and get with encryption",
        run: function (env, test) {
          var storeFilePromise = promising(), getFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ] ] = { valid: true };
          env.responses[ [ 'storeFile', 'application/json', 'foo',
             JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ] ] = storeFilePromise;
          env.responses[ [ 'getFile', 'foo', undefined ] ] = getFilePromise;

          env.credentialsStore.set(undefined, {some: 'conf'}).then(function() {
            return env.credentialsStore.get('my secret');
          }).then(function() {
            test.result(false, 'get should have failed here');
          }, function(err) {
            test.assertAnd(err, 'foo is not encrypted, or encrypted with a different algorithm');
            test.assertAnd(env.called, [
             [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ],
             [ 'storeFile', 'application/json', 'foo', JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ],
             [ 'getFile', 'foo', undefined ]
            ]);
            test.done();
          });
          storeFilePromise.fulfill({});
          getFilePromise.fulfill({
            data: JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }),
            mimeType: 'application/json'
          });
        }
      },

      {
        desc: "set with encryption and get without encryption",
        run: function (env, test) {
          var storeFilePromise = promising(), getFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ] ] = { valid: true };
          env.responses[ [ 'encrypt', 'my secret',
              JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ] ] = 'crypto-crypto';
          env.responses[ [ 'storeFile', 'application/json', 'foo', 'AES-CCM-128:crypto-crypto' ] ] = storeFilePromise;
          env.responses[ [ 'getFile', 'foo', undefined ] ] = getFilePromise;

          env.credentialsStore.set('my secret', {some: 'conf'}).then(function() {
            return env.credentialsStore.get();
          }).then(function() {
            test.result(false, 'get should have failed here');
          }, function(err) {
            test.assertAnd(err, 'foo is encrypted, please specify a password for decryption');
            test.assertAnd(env.called, [
             [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ],
             [ 'encrypt', 'my secret', JSON.stringify({some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }) ],
             [ 'storeFile', 'application/json', 'foo', 'AES-CCM-128:crypto-crypto' ],
             [ 'getFile', 'foo', undefined ]
            ]);
            test.done();
          });
          storeFilePromise.fulfill({});
          getFilePromise.fulfill({
            data: 'AES-CCM-128:crypto-crypto',
            mimeType: 'application/json'
          });
        }
      },

      {
        desc: "get non-JSON, no encryption",
        run: function (env, test) {
          var getFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ ['getFile', 'foo', undefined] ] = getFilePromise;

          env.credentialsStore.get().then(function() {
            test.result(false, 'get should have failed here');
          }, function(err) {
            test.assertAnd(err, 'could not parse foo as unencrypted JSON');
            test.assertAnd(env.called, [
             [ 'getFile', 'foo', undefined ]
            ]);
            test.done();
          });
          getFilePromise.fulfill({
            data: 'garbage',
            mimeType: 'application/json'
          });
        }
      },

      {
        desc: "non-object config",
        run: function (env, test) {
          env.called = [];
          env.responses = {};
          try {
            env.credentialsStore.set('foo', 'bar');
            test.result(false, 'should not have reached here');
          } catch (e) {
            test.assertAnd(e, 'config should be an object');
          }
          test.assertAnd(env.called, []);
          test.done();
        }
      },

      {
        desc: "sjcl undefined",
        run: function (env, test) {
          env.called = [];
          env.responses = {};
          var tmp = global.sjcl;
          delete global.sjcl;
          try {
            env.credentialsStore.set('foo', {some: 'conf'});
            test.result(false, 'should not have reached here');
          } catch (e) {
            test.assertAnd(e, 'please include sjcl.js (the Stanford JS Crypto Library) in your app');
          }
          test.assertAnd(env.called, []);
          global.sjcl = tmp;
          test.done();
        }
      },

      {
        desc: "schema not declared",
        run: function (env, test) {
          var storeFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ ['validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }] ] = 'ERROR';

          try {
            env.credentialsStore.set(undefined, {some: 'conf'});
            test.result(false, 'should not have reached here');
          } catch (err) {
            test.assertAnd(err, 'mocked error');
          }
          test.assertAnd(env.called, [
           [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ]
          ]);
          test.done();
        }
      },

      {
        desc: "schema violation",
        run: function (env, test) {
          var storeFilePromise = promising();
          env.called = [];
          env.responses = {};
          env.responses[ ['validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' }] ] = { valid: false, error: 'yep' };

          env.credentialsStore.set(undefined, {some: 'conf'}).then(function() {
            test.result(false, 'set should have failed here');
          }, function(err) {
            test.assertAnd(err, 'Please follow the config schema - {"valid":false,"error":"yep"}');
            test.assertAnd(env.called, [
             [ 'validate', { some: 'conf', '@context': 'http://remotestorage.io/spec/modules/foo' } ]
            ]);
            test.done();
          });
        }
      },

      {
        desc: "incoming updates",
        run: function (env, test) {
          env.called = [];
          env.responses = {};
          env.credentialsStore.on('change', function(evt) {
            test.assertAnd(evt, undefined);
            test.assertAnd(env.called, []);
            test.done();
          });
          env.handlers['change'][0]({
            origin: 'remote',
            path: 'foo',
            newValue: 'incoming value',
            newContentType: 'incoming content type'
          });
        }
      }
    ]

  });

  return suites;
});
