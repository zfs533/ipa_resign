import { Request } from "express";
import Joi = require('joi')
import * as fs from "fs";
import * as path from 'path';
import * as express from "express";
import * as random from "string-random";
import { ipaFilesDao } from "../models/ipaFileDao";
import { CodeMsg, ErrCode, CodeMsgAny } from "./codeMsg";
import { potatoClient } from "./potatoClient";
import { globalCfg } from "../models/globalCfgDao";
import * as crypto from "crypto"
const interfaces = require('os').networkInterfaces();

export function bindObj(data: Object, schema: Joi.ObjectSchema) {
    let options = {}
    Object.assign(options, data);
    let bindRet = Joi.validate<any>(options, schema, { allowUnknown: true, stripUnknown: { arrays: false, objects: true } });
    let detail = null;
    if (bindRet.error) {
        detail = bindRet.error.details.map(d => d.message);
    }
    return { ...bindRet, error: detail };
}

export function bindExpress(req: Request, schema: Joi.ObjectSchema) {
    let options = {}
    if (req.query) {
        Object.assign(options, req.query)
    }
    if (req.params) {
        Object.assign(options, req.params)
    }
    if (req.body) {
        Object.assign(options, req.body)
    }
    let bindRet = Joi.validate<any>(options, schema, { allowUnknown: true, stripUnknown: { arrays: false, objects: true } });
    let detail = null;
    if (bindRet.error) {
        detail = bindRet.error.details.map(d => d.message);
    }
    return { ...bindRet, error: detail };
}

export function bindArrExpress(req: Request, schema: Joi.ArraySchema) {
    let options: any = []
    if (req.body) {
        if (req.body instanceof Array) {
            options = [...req.body]
        } else {
            return { error: 'req.body must be array', value: req.body };
        }
    }
    let bindRet = Joi.validate<any>(options, schema, { allowUnknown: true, stripUnknown: { arrays: false, objects: true } });
    let detail = null;
    if (bindRet.error) {
        detail = bindRet.error.details.map(d => d.message);
    }
    return { ...bindRet, error: detail };
}

export const joiObjectId = Joi.string().regex(/^[a-z0-9]{24}$/);
export const joiNumString = Joi.string().regex(/^-?\d+\.?\d*$/);
export const joiIntString = Joi.string().regex(/^-?\d+$/);


export function createWriteStream(filePath: string): fs.WriteStream {
    if (filePath) {
        let dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath)
        }
    }
    let stream = fs.createWriteStream(filePath);
    return stream
}

export function createDir(dirPath: string) {
    let parentPath = path.dirname(dirPath);
    if (!fs.existsSync(parentPath)) {
        createDir(parentPath);
    }
    fs.mkdirSync(dirPath);
    return true;
}

function isDir(filePath: string) {
    return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function isFile(filePath: string) {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

export function removeDir(packZipPath: string) {
    var files = [];
    if (fs.existsSync(packZipPath)) {
        files = fs.readdirSync(packZipPath);
        files.forEach((file: any, index: any) => {
            var curPath = packZipPath + "/" + file;
            if (fs.statSync(curPath).isDirectory()) { // recurse
                removeDir(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(packZipPath);
    }
}
export function saveRequestToFile(req: express.Request, filePath: string) {
    return new Promise<any>((resolve, reject) => {
        let stream = createWriteStream(filePath);
        var body = '';
        req.on('data', function (data) {
            body += data;
        });
        req.on('end', function () {
            stream.write(body, function () {
                resolve(true);
            })
        });
        req.on("error", function (err) {
            reject(err);
        })
    });
}

export function replaceAll(find: string, replace: string, str: string) {
    find = find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    return str.replace(new RegExp(find, 'g'), replace);
}

export function getBJDate(time: number) {
    let BJTime: Date = undefined;
    if (time) {
        let utcTime = new Date(time).valueOf();
        BJTime = new Date(time - 8 * 3600 * 1000);
    }
    return BJTime;
}

/**
 * 生成应用唯一标示
 */
export async function createPid(): Promise<CodeMsgAny> {
    let pid = random(8);
    let ipaDoc = await ipaFilesDao.getByPid(pid);
    if (ipaDoc.code !== ErrCode.OK) {
        return ipaDoc;
    }
    if (ipaDoc.msg) {
        return createPid();
    }
    return { code: ErrCode.OK, msg: pid };
}

/**
 * 获取字符串md5加密字符串
 * @param appleAccount 苹果账号
 * @param bit 生成位数,默认16位
 */
export function createBundleId(appleAccount: string, bit?: number): string {
    return encryptionMD5(appleAccount, bit);
}


export function toMonitorGroup(msg: string) {
    potatoClient.send({ chatType: globalCfg.dataMonitor.chatType, chatId: globalCfg.dataMonitor.chatId, msg: msg }); // 数据监控群
}


/**
 * 一天的(locale时间)零点
 * @param dis 天数
 * @param zeroIsDayEnd 
 * zeroIsDayEnd == true, 2012-12-12 00:00:00 => 2012-12-11 00:00:00
 * zeroIsDayEnd != true, 2012-12-12 00:00:00 => 2012-12-12 00:00:00
 */
export function startOfDay(t: Date | string, dis: number = 0, zeroIsDayEnd: boolean = false): Date {
    if (typeof t === 'string') {
        t = getChangeDate(new Date(t));
    }
    if (dis) {
        t = getChangeDate(new Date(t.getTime() + dis * DayMS));
    }
    let start = getChangeDate(new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0));
    if (zeroIsDayEnd && isLocaleMidNight(t)) {
        start = getChangeDate(new Date(start.getTime() - DayMS));
    }
    return start;
}

/**
 * 统一获取时间
 * @param date 
 */
export function getChangeDate(date?: Date): Date {
    date = date ? new Date(date) : new Date();
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
    return date;
}

/**
 * 一天的23:59:59
 * @param date Date
 */
export function endOfDay(date?: Date): Date {
    date = date ? new Date(date) : new Date();
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 24 - 8);
    return date;
}

/**
* 是否是本地时间0点
*/
function isLocaleMidNight(date: Date): boolean {
    return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}
export const DayMS = 86400000; //ms(一天)

/**
 * 字符串md5加密
 * @param str 加密字符串
 * @param bit 加密位数8, 16，32，默认为16微加密
 */
export function encryptionMD5(str: string, bit?: number) {
    let hash = crypto.createHash('md5').update(str)
    return hash.digest('hex').slice(0, bit);
}

/**
 * 在开发环境中获取局域网中的本机iP地址
 */
export function getLocalIp(): string {
    let IPAdress = '';
    for (var devName in interfaces) {
        var iface = interfaces[devName];
        for (var i = 0; i < iface.length; i++) {
            var alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                IPAdress = alias.address;
            }
        }
    }
    return IPAdress;
}