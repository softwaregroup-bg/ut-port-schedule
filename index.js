var Port = require('ut-bus/port');
var util = require('util');
var cron = require('cron');
var through2 = require('through2');

function Schedule() {
    Port.call(this);
    this.config = {
        id: null,
        logLevel: '',
        type: 'schedule',
        listen: false
    };
    this.jobsList = {};
    this.jobs = {};
    this.incoming = {};
}

function InitJobs() {

    for (var jobName in this.jobsList) {
        if (this.jobsList.hasOwnProperty(jobName)) {
            var jobConfig = this.jobsList[jobName];
            var job = new cron.CronJob({
                cronTime: jobConfig.pattern,
                onTick:function() {
                    this.port.jobsList[this.jobName].lastRun = new Date();
                    this.port.incoming.write({$$:{opcode: this.jobName, mtid: 'notification'}, messageId: this.jobName, payload: this.port.jobsList[this.jobName]})
                },
                start: true,
                timeZone: undefined,
                context: {port:this, jobName: jobName}
            });
            this.jobs[jobName] = job;
            if (CheckForImmediateRun(jobConfig.lastRun, job)) {
                jobConfig.lastRun = new Date();
                this.incoming.write({$$:{opcode: jobName, mtid: 'notification'}, messageID: jobName, payload: jobConfig})
            }
        }
    }

    this.log.info && this.log.info({opcode:'Schedule',msg:'All jobs started'});
}

util.inherits(Schedule, Port);

Schedule.prototype.init = function init() {
    Port.prototype.init.apply(this, arguments);
};

Schedule.prototype.start = function start() {
    Port.prototype.start.apply(this, arguments);
    this.incoming = through2.obj(function(chunk, enc, callback) {
        this.push(chunk);
        callback();
    });
    this.pipe(this.incoming, {trace:0, callbacks:{}});

    this.loadJobs();
    InitJobs.call(this);
};

Schedule.prototype.loadJobs = function loadJobs() {
    if (this.config.jobsList) {
        this.jobsList = this.config.jobsList;
    } else {
        // TODO: load from file/db/args? ....
        this.jobsList = {
            "job1": {
                "opcode": "job1",
                "pattern": "1,5,8,13,15,20,25,30,35,40,45,50,55 * * * * *",
                lastRun: null //Date object
            },
            "job2": {
                "opcode": "job2",
                "pattern": "6 * * * * *",
                lastRun: null
            },
            "job3": {
                "opcode": "job3",
                "pattern": "* 43 10,13,14,20 * * *",
                lastRun: new Date(Date.parse("01/15/2015 11:00:15"))
            }
        };
    }
};

Schedule.prototype.restartJobs = function restartJobs(jobList) {

    for (var jobName in this.jobs) {
        if (this.jobs.hasOwnProperty(jobName)) {
            this.jobs[jobName].stop();
        }
    }
    this.jobs = {};
    this.loadJobs(jobList);
    InitJobs.call(this);
};

function CheckForImmediateRun(lastRun, job) {
    if (!lastRun) {
        return false;
    }
    var lastRunMin = lastRun.getMinutes();
    var lastRunHour = lastRun.getHours();
    var lastRunDay = lastRun.getDate();
    var lastRunMonth = (lastRun.getMonth()).toString();
    var nlastRunYear = lastRun.getFullYear();
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

module.exports = Schedule;
