//环境变量名为LEISHEN_USER, 内容格式为username=&password=
//LEISHEN_REPEAT_NOTIFY（该变量暂时不可用）：是否开启重复暂停通知，默认为false，只有在当前账号未暂停时，首次暂停才会推送通知。将其设置为true则不管当前账号是否已经在任务执行前暂停，开启后即每次执行任务都会推送通知.
// 设置想要输出的时间点，这样只有在指定时间会推送通知，其余时间不会通知
const targetHour = 9;
const $ =new Env('雷神加速器自动暂停');
//const targetMinute = 20;

/*
cron: 20 * * * *

*/

const notify = $.isNode() ? require('./sendNotify') : '';
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const md5 = require('js-md5');
const { exec } = require('child_process');
const now = new Date();
const currentHour = now.getHours();
//const currentMinute = now.getMinutes();



const userinfo = process.env.LEISHEN_USER || 'username=&password=';
const repeat_notify = String(process.env.LEISHEN_REPEAT_NOTIFY || 'true').toLocaleLowerCase() === 'true';
const hostToPing = '192.168.10.99'; // 替换为你想要ping的主机地址
const pingAttempts = 3; // 尝试ping的次数
const pingTimeout = 1000; // 每次ping的超时时间，单位为毫秒

const Secrets = {
    username: userinfo.split('&')[0].split('=')[1].trim(),
    password: md5(userinfo.split('&')[1].split('=')[1].trim()),
};
const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; 2206122SC Build/UKQ1.231003.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.120 Mobile Safari/537.36 XWEB/1220099 MMWEBSDK/20240104 MMWEBID/1615 MicroMessenger/8.0.48.2589(0x28003044) WeChat/arm64 Weixin GPVersion/1 NetType/WIFI Language/zh_CN ABI/arm64',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Android WebView";v="122"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'origin': 'https://www.leigod.com',
    'x-requested-with': 'com.tencent.mm',
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': 'https://www.leigod.com/',
    'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'
};
const user = {
    account_token: null,
    country_code: 86,
    lang: "zh_CN",
    password: Secrets.password,
    region_code: 1,
    src_channel: "guanwang",
    user_type: "0",
    code: "",
    username: Secrets.username,
    os_type: 5
};
function pingHost() {
    return new Promise((resolve, reject) => {
        exec(`ping -c ${pingAttempts} -W ${pingTimeout / 1000} ${hostToPing}`, (error, stdout, stderr) => {
            if (stdout.includes('100% packet loss')) {
                // ping失败，主机可能离线
                resolve(false);
            } else {
                // ping成功，主机在线
                resolve(true);
            }
        });
    });
}

const pauseLeiGodAccount = async () => {
    try {
        // Check username and password
        if (!Secrets.username || !Secrets.password) {
            throw new Error('账号或密码为空');
        }

        // Login
        const loginResponse = await fetch('https://webapi.leigod.com/wap/login/bind', {
            headers,
            method: 'POST',
            body: JSON.stringify(user),
        });
        const loginData = await loginResponse.json();

        if (loginData.code !== 0) {
            throw new Error(`错误，登录API返回代码 ${loginData.code}, 信息: ${loginData.msg}`);
        }

        const token = loginData.data.login_info.account_token;

        const userInfoResponse = await fetch('https://webapi.leigod.com/api/user/info', {
            headers,
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({
                "account_token": token,
                "lang": "zh_CN",
                "os_type": 5
            }),
        });

        const userInfoData = await userInfoResponse.json();
        // Extract required information
        const { nickname, expiry_time, pause_status_id, last_pause_time } = userInfoData.data;

        // Log the extracted information
        console.log(`Nickname: ${nickname}`);
        console.log(`Expiry Time: ${expiry_time}`);
        console.log(`Pause Status ID: ${pause_status_id}`);
        console.log(`Last Pause Time: ${last_pause_time}`);
        const expiry_time_hours = parseFloat(expiry_time);
        const expiry_time_days = Math.round(expiry_time_hours / 24);


        // Check if pause_status_id is 0
        if (pause_status_id === 0) {
            // Execute the code if pause_status_id is 0
            const pauseResponse = await fetch('https://webapi.leigod.com/api/user/pause', {
                headers,
                method: 'POST',
                credentials: 'include',
                body: JSON.stringify({
                    "account_token": token,
                    "lang": "zh_CN",
                    "os_type": 5
                }),
            });

            const pauseData = await pauseResponse.json();

            console.log(pauseData);
            
            // Handle pause response
            if (pauseData.code === 400803) {
                if (repeat_notify) {
                notify.sendNotify('雷神加速器自动暂停：', `用户：${nickname}，剩余时长：${expiry_time}（约${expiry_time_days}天），上次暂停时间：${last_pause_time}，本次暂停操作状态：${pauseData.msg}`);
                }
            } else {
                notify.sendNotify('雷神加速器自动暂停：', `用户：${nickname}，剩余时长：${expiry_time}（约${expiry_time_days}天），上次暂停时间：${last_pause_time}，本次暂停操作状态：${pauseData.msg}`);
            }
        } else {
            // Return and notify user if pause_status_id is not 0
            console.log(`用户：${nickname} 已是暂停状态，剩余时长：${expiry_time}（约${expiry_time_days}天），上次暂停时间：${last_pause_time}`);
            if (currentHour === targetHour) {
              notify.sendNotify('雷神加速器自动暂停：', `用户：${nickname} 已是暂停状态\n剩余时长：${expiry_time}（约${expiry_time_days}天）\n上次暂停时间：${last_pause_time}`);
            } else {
            }
            return;
        }
    } catch (error) {
        notify.sendNotify('雷神加速器自动暂停，出错：', error.message);
    }

};


(async () => {
    // 检查主机是否在线
    const isHostOnline = await pingHost();

    if (isHostOnline) {
        // 如果主机在线，不执行暂停操作
        console.log('主机在线，不执行操作');
        
    } else {
        // 如果主机离线，执行暂停操作
        console.log('主机离线，执行暂停操作');
        pauseLeiGodAccount();
        // 其余代码保持不变
        // ...
    }
})();


function Env(t,e){"undefined"!=typeof process&&JSON.stringify(process.env).indexOf("GITHUB")>-1&&process.exit(0);class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),n={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(n,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.post(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method="POST",this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:s,...i}=t;this.got.post(s,i).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
