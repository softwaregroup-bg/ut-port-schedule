'use strict';
const cron = require('cron');

function CheckForImmediateRun(job) {
    if (!job.lastRun || !(job.lastRun instanceof Date)) {
        return false;
    }
    const lastRunMin = job.lastRun.getMinutes();
    const lastRunHour = job.lastRun.getHours();
    const lastRunDay = job.lastRun.getDate();
    const lastRunMonth = (job.lastRun.getMonth()).toString();
    const nlastRunYear = job.lastRun.getFullYear();
    const lastRunYear = nlastRunYear.toString();
    const lastRunYearMonth = parseInt(lastRunYear + (lastRunMonth.length === 1 ? ('0' + lastRunMonth) : lastRunMonth), 10);
    const cronTime = job.cronTime;
    const cMinute = cronTime.minute;
    const cHour = cronTime.hour;
    const cDay = cronTime.dayOfMonth;
    const cMonth = cronTime.month;
    const cWeekDays = cronTime.dayOfWeek;

    let eMonth = null;
    for (const m in cMonth) {
        const mStr = m.toString();
        const cYearMonth = parseInt(lastRunYear + (mStr.length === 1 ? ('0' + mStr) : mStr), 10);
        if (cYearMonth >= lastRunYearMonth) {
            eMonth = m;
            break;
        }
        eMonth = m;
    }
    let eDay = null;
    for (const d in cDay) {
        if (d >= lastRunDay) {
            eDay = d;
            break;
        }
        eDay = d;
    }
    let eHour = null;
    for (const h in cHour) {
        if (h >= lastRunHour) {
            eHour = h;
            break;
        }
        eHour = h;
    }
    let eMinute = null;
    for (const n in cMinute) {
        if (n >= lastRunMin) {
            eMinute = n;
            break;
        }
        eMinute = n;
    }

    const nextDateTime = new Date(nlastRunYear, eMonth, eDay, eHour, eMinute, 0, 0);

    for (let w = 0; w <= 6; w++) {
        const nextWDay = nextDateTime.getDay();
        if (nextWDay in cWeekDays) {
            break;
        }
        nextDateTime.setDate(nextDateTime.getDate() + 1);
    }

    const currD = new Date();
    const nextTime = Math.floor(nextDateTime.getTime() / 1000);
    const currTime = Math.floor(currD.getTime() / 1000);

    return (currTime > nextTime);
}

module.exports = ({utPort}) => class SchedulePort extends utPort {
    constructor() {
        super(...arguments);
        this.jobs = {};
    }

    get defaults() {
        return {
            jobsList: {},
            type: 'schedule',
            listen: false
        };
    }

    async start() {
        const result = await super.start(...arguments);
        this.context = { requests: {} };
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

            if (this.interval) clearInterval(this.interval);
            this.interval = setInterval(this.extLoad.bind(this), extLoadInterval);
        }
        if (this.config.run && this.config.run.notify) {
            this._notify = this.bus.importMethod(this.config.run.notify);
        }
        return result;
    }

    extLoad(jobs) {
        this._load({}).then(function(r) {
            const updateTime = Date.now();
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
            .catch(function(e) { });
    }

    addJobs(jobs) {
        const keys = Object.keys(this.config.jobsList);
        for (let i = 0, l = keys.length; i < l; i++) {
            this.addJob(keys[i], jobs[keys[i]]);
        }
        this.log.info && this.log.info({ opcode: 'Schedule', msg: 'All jobs started' });
    }

    addJob(name, job) {
        if (!this.jobs[name]) {
            if (this.jobs[name]) {
                this.stop();
            }
            this.log.info && this.log.info({opcode: 'Schedule', msg: `Add Job ${name}`, job: job});

            this.jobs[name] = new cron.CronJob({
                cronTime: job.pattern,
                onTick: function() {
                    this.jobs[name].lastRun = (new Date()).toISOString();
                    job.lastRun = this.jobs[name].lastRun;
                    this.stream.push([job, {method: name, opcode: name, mtid: 'notification'}]);

                    if (this._notify) {
                        this._notify(job).catch(error => this.error(error));
                    }
                }.bind(this),
                start: true,
                timeZone: undefined,
                context: undefined,
                onComplete: function() {
                    this.stop(name);
                }.bind(this)
            });
            this.jobs[name].updatedAt = job.updatedAt;
            if (CheckForImmediateRun(job)) {
                this.stream.push([job, {method: name, opcode: name, mtid: 'notification'}]);
            }
        } else {
            this.log.info && this.log.info({opcode: 'Schedule', msg: `Cannot Add Job ${name}, already exists, use updateJob`});
        }
    }

    updateJob(name, job) {
        if (this.jobs[name]) {
            job.lastRun = this.jobs[name].lastRun || job.lastRun;
            this.removeJob(name);
        }
        this.addJob(name, job);
    }

    removeJob(name) {
        this.log.info && this.log.info({opcode: 'Schedule', msg: `Remove Job ${name}`});
        this.jobs[name].stop();
        delete this.jobs[name];
        this.stop();
    }

    cleanupExpiredJobs(updateTime) {
        Object.keys(this.jobs).map(function(key) {
            if (this.jobs[key].updatedAt !== updateTime) {
                this.removeJob(key);
            }
        }.bind(this));
    }

    /**
     * created stop function for cron and clear intervals
     * @param {name} name Job name
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            delete this.interval;
        }
        return super.stop(...arguments);
    }
};
