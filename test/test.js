var assign = require('lodash/object/assign');
var LDAP = require('../index');
var ldap = assign(new LDAP(), {
    config: {
        id: 'ldap',
        logLevel: 'debug',
        url: 'ldap://172.16.30.1:61008',
        listen: false
    }
});
ldap.init();
// ldap.restartJobs();
