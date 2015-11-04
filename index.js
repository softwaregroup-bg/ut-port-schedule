var Port = require('ut-bus/port');
var util = require('util');
var cron = require('cron');
var through2 = require('through2');
var push;
var jobs = {};
var extLoad;
var runNotify;
var extLoadInterval = 60000 * 60;

function CheckForImmediateRun(job) {
    if (!job.lastRun || !(job.lastRun instanceof Date)) {
        return false;
    }
    var lastRunMin = job.lastRun.getMinutes();
    var lastRunHour = job.lastRun.getHours();
    var lastRunDay = job.lastRun.getDate();
    var lastRunMonth = (job.lastRun.getMonth()).toString();
    var nlastRunYear = job.lastRun.getFullYear();
    var lastRunYear = nlastRunYear.toString();
    var lastRunYearMonth = parseInt(lastRunYear + (lastRunMonth.length == 1 ? ('0' + lastRunMonth) : lastRunMonth));
    var cronTime = job.cronTime;
    var cMinute = cronTime.minute;
    var cHour = cronTime.hour;
    var cDay = cronTime.dayOfMonth;
    var cMonth = cronTime.month;
    var cWeekDays = cronTime.dayOfWeek;

    var eMonth = null;
    for (m in cMonth) {
        var mStr = m.toString();
        var cYearMonth = parseInt(lastRunYear + (mStr.length == 1 ? ('0' + mStr) : mStr));
        if (cYearMonth >= lastRunYearMonth) {
            eMonth = m;
            break;
        }
        eMonth = m;
    }
    var eDay = null;
    for (d in cDay) {
        if (d >= lastRunDay) {
            eDay = d;
            break;
        }
        eDay = d;
    }
    var eHour = null;
    for (h in cHour) {
        if (h >= lastRunHour) {
            eHour = h;
            break;
        }
        eHour = h;
    }
    var eMinute = null;
    for (n in cMinute) {
        if (n >= lastRunMin) {
            eMinute = n;
            break;
        }
        eMinute = n;
    }

    var nextDateTime = new Date(nlastRunYear, eMonth, eDay, eHour, eMinute, 0, 0);

    for (var w = 0; w <= 6; w++) {
        var nextWDay = nextDateTime.getDay();
        if (nextWDay in cWeekDays) {
            break;
        }
        nextDateTime.setDate(nextDateTime.getDate() + 1);
    }

    var currD = new Date();
    var nextTime = Math.floor(nextDateTime.getTime() / 1000);
    var currTime = Math.floor(currD.getTime() / 1000);

    return (currTime > nextTime);
}

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

    if (this.config.extLoad && this.config.extLoad.from && this.config.extLoad.every) {
        extLoad = this.bus.importMethod(this.config.extLoad.from);
        extLoadInterval = parseInt(this.config.extLoad.every.slice(0, -1));
        switch(this.config.extLoad.every.slice(-1)) {
            case 'h':
                extLoadInterval = extLoadInterval * 60 * 60;
            break;
            case 'm':
                extLoadInterval = extLoadInterval * 60;
            break;
        }
        extLoadInterval = extLoadInterval * 1000;

        setInterval(this.extLoad.bind(this), extLoadInterval);
    }
    if (this.config.run && this.config.run.notify) {
        runNotify = this.bus.importMethod(this.config.run.notify);
    }
};

UtCron.prototype.extLoad = function(jobs) {
    extLoad({})
    .then(function(r) {
        if (r.jobsList) {
            r = r.jobsList;
            var i = 0;
            while(r[i]) {
                this.updateJob(r[i].name, r[i]);
                i = i + 1;
            }
        }
    }.bind(this))
    .catch(function(e) {});
}

UtCron.prototype.addJobs = function(jobs) {
    var keys = Object.keys(this.config.jobsList);
    for(var i = 0,l = keys.length;i < l; i++) {
        this.addJob(keys[i], jobs[keys[i]])
    }
    this.log.info && this.log.info({opcode:'Schedule',msg:'All jobs started'});
}

UtCron.prototype.addJob = function(name, job) {
    if (!jobs[name]) {
        this.log.info && this.log.info({opcode:'Schedule',msg:`Add Job ${name}`,job: job});
        jobs[name] = new cron.CronJob({
            cronTime: job.pattern,
            onTick: function() {
                jobs[name].lastRun = (new Date()).toISOString();
                job.lastRun = jobs[name].lastRun;
                push.write([job, {opcode: name, mtid: 'notification'}]);

                if (runNotify) {
                    runNotify(job)
                    .then(function() {})
                    .catch(function() {});
                }
            },
            start: true,
            timeZone: undefined,
            context: undefined
        });
        if (CheckForImmediateRun(job)) {
            push.write([job, {opcode: name, mtid: 'notification'}]);
        }
    } else {
        this.log.info && this.log.info({opcode:'Schedule',msg:`Cannot Add Job ${name}, allready exists, use updateJob`});
    }
}

UtCron.prototype.updateJob = function(name, job) {
    if (jobs[name]) {
        this.log.info && this.log.info({opcode:'Schedule',msg:`Remove Job ${name}`});
        jobs[name].stop();
        job.lastRun = jobs[name].lastRun || job.lastRun;
        delete jobs[name];
    }
    this.addJob(name, job);
}

module.exports = UtCron;
