var assign = require('lodash/object/assign');
var Schedule = require('../index');
var schedule = assign(new Schedule(), {
    config: {
        id: 'ldap',
        logLevel: 'debug',
        url: 'ldap://172.16.30.1:61008',
        listen: false
    }
});
schedule.init();
// schedule.restartJobs();
