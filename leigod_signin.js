//环境变量名为LEISHEN_USER, 内容格式为username=&password=
//LEISHEN_REPEAT_NOTIFY（该变量暂时不可用）：是否开启重复暂停通知，默认为false，只有在当前账号未暂停时，首次暂停才会推送通知。将其设置为true则不管当前账号是否已经在任务执行前暂停，开启后即每次执行任务都会推送通知.
// 设置想要输出的时间点，这样只有在指定时间会推送通知，其余时间不会通知
const targetHour = 9;
//const targetMinute = 20;

/*
cron: 20 * * * *

*/

const notify = require('./sendNotify');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const md5 = require('js-md5');
const crypto = require('crypto');
const { exec } = require('child_process');
const now = new Date();
const currentHour = now.getHours();

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
const pre_data = {
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


function sign(data) {
  const ts = Math.floor((new Date).getTime() / 1e3).toString();
  const combinedData = { ts, ...data };


  const sortedKeys = Object.keys(combinedData).sort();


  const sortedData = {};
  for (const key of sortedKeys) {
    sortedData[key] = combinedData[key];
  }


  function buildQueryString(obj, encode = true) {
    return Object.entries(obj)
      .map(([key, value]) => `${key}=${encode ? encodeURIComponent(value) : value}`)
      .join('&');
  }


  const stringToHash = buildQueryString({ ...sortedData, key: '5C5A639C20665313622F51E93E3F2783' }, false);


  const md5Hash = crypto.createHash('md5').update(stringToHash).digest('hex');


  return { ...data, ts, sign: md5Hash };
}


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
        const data = sign(pre_data);
        //console.log(data)
        // Login
        const loginResponse = await fetch('https://webapi.leigod.com/wap/login/bind/v1', {
            headers,
            method: 'POST',
            body: JSON.stringify(data),
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
        console.log(`昵称: ${nickname}`);
        console.log(`剩余时长: ${expiry_time}`);
        console.log(`时长状态: ${pause_status_id === 1 ? '已暂停' : '加速中，未暂停'}`);
        console.log(`上次暂停时间: ${last_pause_time}`);
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
