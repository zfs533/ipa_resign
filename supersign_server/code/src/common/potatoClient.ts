import { CodeMsgAny, ErrCode } from "./codeMsg";
import { logger } from "./logger";
import { httpClient } from "./httpClient";
import { globalCfg } from "../models/globalCfgDao";
const PUSHNUM = 5;
export enum PotatoChatType {
    Single = 1,
    StandardGroup = 2,
    SuperGroup = 3
}


export interface PotatoTarget {
    chatType: PotatoChatType,
    chatId: number,
}

export interface PotatoSendMsgUnit extends PotatoTarget {
    msg: string
}
export interface PotatoSendFileUnit extends PotatoTarget {
    file: Buffer,
    filename: string
}

const potatoDomain = "api.sydney.im";

class PotatoClient {
    // getUpdates
    public getUpdates = async () => {
        let url = `https://${potatoDomain}/${globalCfg.botToken}/getUpdates`
        let getRet = await httpClient.get(url);
        try {
            let ok = JSON.parse(getRet.msg.body).ok
            if (getRet.code === ErrCode.OK && ok) {
                return getRet;
            } else {
                logger.error('PotatoClient getUpdates err', getRet, '===>', JSON.stringify(getRet))
                return getRet;
            }
        } catch (error) {
            logger.error('PotatoClient getUpdates JSON.parse err：', error, "ret：", getRet)
            return getRet;
        }
    }
    // set Webhook
    public setWebhook = async (callbackUrl: string) => {
        let url = `https://${potatoDomain}/${globalCfg.botToken}/setWebhook`
        let body = { url: callbackUrl };
        let postRet = await httpClient.postJson(url, body);
        if (postRet.code === ErrCode.OK && postRet.msg.ok) {
            return postRet;
        } else {
            logger.error('PotatoClient setWebhook err', postRet, '===>', JSON.stringify(postRet))
            return postRet;
        }
    }
    // Remove Webhook
    public delWebhook = async () => {
        let url = `https://${potatoDomain}/${globalCfg.botToken}/delWebhook`
        let getRet = await httpClient.get(url);
        try {
            let ok = JSON.parse(getRet.msg.body).ok
            if (getRet.code === ErrCode.OK && ok) {
                return getRet;
            } else {
                logger.error('PotatoClient delWebhook err', getRet, '===>', JSON.stringify(getRet))
                return getRet;
            }
        } catch (error) {
            logger.error('PotatoClient delWebhook JSON.parse err', error, "ret：", getRet)
            return getRet;
        }
    }

    // Send A Text Message
    public send = async (unit: PotatoSendMsgUnit) => {
        let pushNum = PUSHNUM;
        let url = `https://${potatoDomain}/${globalCfg.botToken}/sendTextMessage`
        let body = { chat_type: unit.chatType, chat_id: unit.chatId, markdown: true, text: "env:" + globalCfg.env + ",msg:" + unit.msg };
        while (true) {
            logger.info("potato sendMsg", url, JSON.stringify(body));
            let postRet = await httpClient.postJson(url, body);
            pushNum--;
            if (postRet.code === ErrCode.OK && postRet.msg.ok) {
                return postRet;
            }
            if (pushNum <= 0) {
                return postRet;
            }
        }
    }
    // Send Document File
    public sendFile = async (unit: PotatoSendFileUnit) => {
        let url = `https://${potatoDomain}/${globalCfg.botToken}/sendDocument`
        let body = {
            chat_type: unit.chatType, chat_id: unit.chatId, document: {
                value: unit.file, options: { filename: unit.filename }
            }
        };
        logger.info("potato sendFile", url);
        let postRet = await httpClient.postFormData(url, body);
        try {
            let ok = JSON.parse(postRet.msg).ok
            if (postRet.code === ErrCode.OK && ok) {
                return postRet;
            } else {
                logger.error('PotatoClient sendFile err', postRet, '===>', JSON.stringify(postRet))
                return postRet;
            }
        } catch (error) {
            logger.error('PotatoClient sendFile JSON.parse err', error, "ret：", postRet)
            return postRet;
        }
    }

    public sends = async (units: PotatoSendMsgUnit[]) => {
        return await Promise.all(units.map(unit => (this.send(unit))));
    }

    public sendsOrder = async (units: PotatoSendMsgUnit[]) => {
        let retArr: CodeMsgAny[] = new Array<CodeMsgAny>(units.length);
        for (let i = 0; i < units.length; i++) {
            let ret = await this.send(units[i]);
            retArr.push(ret);
        }
        return retArr;
    }

    public sendOrderedByTarget = async (units: PotatoSendMsgUnit[]) => {
        let m = new Map<string, PotatoSendMsgUnit[]>();
        units.forEach(unit => {
            let key = unit.chatType + ":" + unit.chatId;
            let us = m.get(key);
            if (!us) {
                us = [];
                m.set(key, us);
            }
            us.push(unit);
        });
        let p: Promise<CodeMsgAny[]>[] = [];
        for (let [_, un] of m) {
            p.push(this.sendsOrder(un));
        }
        return Promise.all(p);
    }


    public sendsFileOrder = async (units: PotatoSendFileUnit[]) => {
        let retArr: CodeMsgAny[] = new Array<CodeMsgAny>(units.length);
        for (let i = 0; i < units.length; i++) {
            let ret = await this.sendFile(units[i]);
            retArr.push(ret);
        }
        return retArr;
    }

    public sendFileOrderedByTarget = async (units: PotatoSendFileUnit[]) => {
        let m = new Map<string, PotatoSendFileUnit[]>();
        units.forEach(unit => {
            let key = unit.chatType + ":" + unit.chatId;
            let us = m.get(key);
            if (!us) {
                us = [];
                m.set(key, us);
            }
            us.push(unit);
        });
        let p: Promise<CodeMsgAny[]>[] = [];
        for (let [_, un] of m) {
            p.push(this.sendsFileOrder(un));
        }
        return Promise.all(p);
    }
}

export const potatoClient = new PotatoClient();