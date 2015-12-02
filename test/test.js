require('repl').start({useGlobal: true});

var wire = require('wire');

wire({
    bunyan: {
        create: {
            module: 'ut-log',
            args: {
                type: 'bunyan',
                name: 'bunyan_test',
                streams: [
                    {
                        level: 'trace',
                        stream: 'process.stdout'
                    }
                ]
            }
        }
    },
    schedule: {
        create: 'ut-port-schedule',
        init: 'init',
        properties: {
            config: {
                id: 'schedule',
                logLevel: 'debug'
            },
            log: {$ref: 'bunyan'}
        }
    }
}, {require: require}).then(function contextLoaded(context) {
    context.schedule.start();

    context.schedule.restartJobs();
}).done();
