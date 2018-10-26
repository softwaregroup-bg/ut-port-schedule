'use strict';
const merge = require('lodash.merge');
const util = require('util');
const cron = require('cron');

function CheckForImmediateRun(job) {
    if (!job.lastRun || !(job.lastRun instanceof Date)) {
        return false;
    }
    let lastRunMin = job.lastRun.getMinutes();
    let lastRunHour = job.lastRun.getHours();
    let lastRunDay = job.lastRun.getDate();
    let lastRunMonth = (job.lastRun.getMonth()).toString();
    let nlastRunYear = job.lastRun.getFullYear();
    let lastRunYear = nlastRunYear.toString();
    let lastRunYearMonth = parseInt(lastRunYear + (lastRunMonth.length === 1 ? ('0' + lastRunMonth) : lastRunMonth), 10);
    let cronTime = job.cronTime;
    let cMinute = cronTime.minute;
    let cHour = cronTime.hour;
    let cDay = cronTime.dayOfMonth;
    let cMonth = cronTime.month;
    let cWeekDays = cronTime.dayOfWeek;

    let eMonth = null;
    for (let m in cMonth) {
        let mStr = m.toString();
        let cYearMonth = parseInt(lastRunYear + (mStr.length === 1 ? ('0' + mStr) : mStr), 10);
        if (cYearMonth >= lastRunYearMonth) {
            eMonth = m;
            break;
        }
        eMonth = m;
    }
    let eDay = null;
    for (let d in cDay) {
        if (d >= lastRunDay) {
            eDay = d;
            break;
        }
        eDay = d;
    }
    let eHour = null;
    for (let h in cHour) {
        if (h >= lastRunHour) {
            eHour = h;
            break;
        }
        eHour = h;
    }
    let eMinute = null;
    for (let n in cMinute) {
        if (n >= lastRunMin) {
            eMinute = n;
            break;
        }
        eMinute = n;
    }

    let nextDateTime = new Date(nlastRunYear, eMonth, eDay, eHour, eMinute, 0, 0);

    for (let w = 0; w <= 6; w++) {
        let nextWDay = nextDateTime.getDay();
        if (nextWDay in cWeekDays) {
            break;
        }
        nextDateTime.setDate(nextDateTime.getDate() + 1);
    }

    let currD = new Date();
    let nextTime = Math.floor(nextDateTime.getTime() / 1000);
    let currTime = Math.floor(currD.getTime() / 1000);

    return (currTime > nextTime);
}

module.exports = function({parent}) {
    function SchedulePort({config}) {
        parent && parent.apply(this, arguments);
        this.config = merge({
            id: null,
            logLevel: 'info',
            jobsList: {},
            type: 'schedule',
            listen: false
        }, config);
    }

    if (parent) {
        util.inherits(SchedulePort, parent);
    }

    SchedulePort.prototype.jobs = {};

    SchedulePort.prototype.start = function start() {
        parent && parent.prototype.start.apply(this, arguments);
        this.context = {requests: {}};
        this.stream = this.pull(false, this.context);

        if (this.config.jobsList && (Object.keys(this.config.jobsList).length > 0)) {
            this.addJobs(this.config.jobsList);
        }

        if (this.config.extLoad && this.config.extLoad.from && this.config.extLoad.every) {
            this._load = this.bus.importMethod(this.config.extLoad.from);
            let extLoadInterval = parseInt(this.config.extLoad.every.slice(0, -1), 10);
            switch (this.config.extLoad.every.slice(-1)) {
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
            this._notify = this.bus.importMethod(this.config.run.notify);
        }
    };

    SchedulePort.prototype.extLoad = function(jobs) {
        this._load({}).then(function(r) {
            let updateTime = Date.now();
            if (r.jobsList) {
                r = r.jobsList;
                let i = 0;
                while (r[i]) {
                    r[i].updatedAt = updateTime;
                    this.updateJob(r[i].name, r[i]);
                    i = i + 1;
                }
            }
            this.cleanupExpiredJobs(updateTime);
        }.bind(this))
            .catch(function(e) {});
    };

    SchedulePort.prototype.addJobs = function(jobs) {
        let keys = Object.keys(this.config.jobsList);
        for (let i = 0, l = keys.length; i < l; i++) {
            this.addJob(keys[i], jobs[keys[i]]);
        }
        this.log.info && this.log.info({opcode: 'Schedule', msg: 'All jobs started'});
    };

    SchedulePort.prototype.addJob = function(name, job) {
        if (!this.jobs[name]) {
            this.log.info && this.log.info({opcode: 'Schedule', msg: `Add Job ${name}`, job: job});
            this.jobs[name] = new cron.CronJob({
                cronTime: job.pattern,
                onTick: function() {
                    this.jobs[name].lastRun = (new Date()).toISOString();
                    job.lastRun = this.jobs[name].lastRun;
                    this.stream.push([job, {opcode: name, mtid: 'notification'}]);

                    if (this._notify) {
                        this._notify(job).catch(error => this.error(error));
                    }
                }.bind(this),
                start: true,
                timeZone: undefined,
                context: undefined
            });
            this.jobs[name].updatedAt = job.updatedAt;
            if (CheckForImmediateRun(job)) {
                this.stream.push([job, {opcode: name, mtid: 'notification'}]);
            }
        } else {
            this.log.info && this.log.info({opcode: 'Schedule', msg: `Cannot Add Job ${name}, allready exists, use updateJob`});
        }
    };

    SchedulePort.prototype.updateJob = function(name, job) {
        if (this.jobs[name]) {
            job.lastRun = this.jobs[name].lastRun || job.lastRun;
            this.removeJob(name);
        }
        this.addJob(name, job);
    };

    SchedulePort.prototype.removeJob = function(name) {
        this.log.info && this.log.info({opcode: 'Schedule', msg: `Remove Job ${name}`});
        this.jobs[name].stop();
        delete this.jobs[name];
    };

    SchedulePort.prototype.cleanupExpiredJobs = function(updateTime) {
        Object.keys(this.jobs).map(function(key) {
            if (this.jobs[key].updatedAt !== updateTime) {
                this.removeJob(key);
            }
        }.bind(this));
    };

    return SchedulePort;
};
