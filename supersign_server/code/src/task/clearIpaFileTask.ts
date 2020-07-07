import { udidTokenLogDAO } from "../models/udidTokenLogDao";
import { ErrCode, CodeMsg } from "../common/codeMsg";
import { logger } from "../common/logger";
import * as fs from "fs";
import * as path from "path";

class ClearIpaFileTask {
    DIR = path.join(process.cwd(), "./data/download");
    private _expireTimerId: NodeJS.Timer;
    private getUdids = async () => {
        return new Promise<CodeMsg<string[]>>(async resolve => {
            let time = Date.now() - 30 * 24 * 60 * 60 * 1000;
            let udidsCM = await udidTokenLogDAO.findUdidByCreateTime(time);
            if (udidsCM.code !== ErrCode.OK) {
                logger.error("deleteTask findUdidByCreateTimeAndDelete err:", udidsCM.err);
                resolve({ code: ErrCode.Unknown, err: udidsCM.err });
            }
            if (!udidsCM.msg) {
                return;
            }
            let udids: string[] = udidsCM.msg.map(e => e.udid);
            resolve({ code: ErrCode.OK, msg: udids });
        })
    }

    public startIpaWatch = () => {
        this._expireTimerId = setInterval(() => {
            this.expireIpas(this.DIR);
        }, 12 * 60 * 60000);
    }

    private expireIpas = (filePath: string) => {
        return new Promise(async resolve => {
            let udidsCM = await this.getUdids();
            if (udidsCM.code !== ErrCode.OK) {
                logger.error("deleteTask expireIpas err:", udidsCM.err);
                return;
            }
            if (udidsCM.msg.length === 0) {
                return;
            }
            for (const udid of udidsCM.msg) {
                let filename = path.join(filePath, udid + ".ipa");
                fs.unlink(filename, (err) => resolve({ code: err ? ErrCode.Unknown : ErrCode.OK, err }));
            }
        })
    }
}

export const clearIpaFileTask = new ClearIpaFileTask();