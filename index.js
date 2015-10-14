var Port = require('ut-bus/port');
var util = require('util');
var cron = require('cron');
var through2 = require('through2');
var push;
var jobs = {};

function UtCron() {
    Port.call(this);
    this.config = {
        id: null,
        logLevel: '',
        jobsList: {},
        type: 'schedule',
        listen: false
    };
}

util.inherits(UtCron, Port);

UtCron.prototype.init = function init() {
    Port.prototype.init.apply(this, arguments);
};

UtCron.prototype.start = function start() {
    Port.prototype.start.apply(this, arguments);
    push = through2.obj(function(chunk, enc, callback) {
        this.push(chunk);
        callback();
    });
    this.pipe(push, {trace:0, callbacks:{}});

    if (this.config.jobsList && (Object.keys(this.config.jobsList).length > 0)) {
        this.addJobs(this.config.jobsList);
    }
};

UtCron.prototype.addJobs = function(jobs) {
    var keys = Object.keys(this.config.jobsList);
    for(var i = 0,l = keys.length;i < l; i++) {
        this.addJob(keys[i], jobs[keys[i]])
    }
    this.log.info && this.log.info({opcode:'Schedule',msg:'All jobs started'});
}

UtCron.prototype.addJob = function(name, job) {
    if (jobs[name]) {
        this.log.info && this.log.info({opcode:'Schedule',msg:`Remove Job ${name}`});
        jobs[name].stop();
        delete jobs[name];
    }
    this.log.info && this.log.info({opcode:'Schedule',msg:`Add Job ${name}`});
    jobs[name] = new cron.CronJob({
        cronTime: job.pattern,
        onTick: function() {
            job.lastRun = jobs[name].lastRun;
            jobs[name].lastRun = new Date();
            push.write({$$:{opcode: name, mtid: 'notification'}, messageId: name, payload: job})
        },
        start: true,
        timeZone: undefined,
        context: undefined
    });
}

module.exports = UtCron;
