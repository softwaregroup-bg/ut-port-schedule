# **Schedule port:** `ut-port-schedule` #
The purpose of this port is for cron tasks(scheduler).

### **Technological Dependencies** ###

 - `cron` - [GitHub Official Page](https://github.com/ncb000gt/node-cron)
 - `ut-bus/port` - TODO add link to documentation
 - `through2` - [GitHub Official Page](https://github.com/rvagg/through2)

In the UT5 implementations the Schedule port is initialized in the following manner:

```javascript
    module.exports = {
        id: 'scheduler',
        type: 'schedule',
        logLevel: 'info',
        extLoad: {//call some port with some menthod, result will be pushed as jobs, result should be object with hash key `jobsList` and within should have array with all jobs
          from: 'maindb.scheduleLoad',
          every: '60s'//it will run every 60 sec, s: sec, m: min. , h: hours
        },
        ran: {
          notify: 'maindb.scheduleTaskRan'//called after every task run with message job itself
        },
        jobsList: {
          job1: {
              opcode: 'job1',
              pattern: '1 * 1 * * *',
              lastRun: null
          }
        },

        namespace: ['scheduler'],
        imports: [],
        receive: function(msg) {
            return msg;
        },
        send: function(msg) {
            return msg;
        }
    }
```

all of the properties that can be set can be seen in the Nodemailer github page