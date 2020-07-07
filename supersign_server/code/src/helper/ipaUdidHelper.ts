import * as express from "express";
import { logger } from "../common/logger";
import { ErrCode } from "../common/codeMsg";

class IpaUdidHelper {
    getReqUdid = (req: express.Request): Promise<any> => {
        return new Promise(async (resolve, reject) => {
            let rawBody = '';//添加接收变量
            var json = {};
            req.setEncoding('utf8');
            req.on('data', function (chunk) {
                rawBody += chunk;
            });
            req.on('end', function () {
                let regex = /<key>UDID<\/key>\n\t<string>(\w|\d|-)+<\/string>/;
                let regex1 = /<key>VERSION<\/key>\n\t<string>(\w|\d|-)+<\/string>/;
                let udids = rawBody.match(regex) || [];
                let iphoneVs = rawBody.match(regex1) || [];
                if (!udids || udids.length === 0) {
                    logger.error("没有获取到udid");
                    return;
                }
                let udid = udids[0].split("string")[1].split(">")[1].split("<")[0].trim();
                /* 手机版本号 */
                let iphoneVersion = iphoneVs[0].split("string")[1].split(">")[1].split("<")[0].trim();
                return resolve({ code: ErrCode.OK, msg: udid });
            });
        });
    }

}

export const ipaUdidHelper = new IpaUdidHelper();