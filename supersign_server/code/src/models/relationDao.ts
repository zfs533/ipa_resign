import { Connection, Schema } from "mongoose";
import { MongoDbUtil } from "./mongoDbUtil";
import { CodeMsgAny } from "../common/codeMsg";
import { ErrCode } from "../common/codeMsg";
import { CodeMsg } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";
import { logger } from "../common/logger";
import { string, number } from "joi";
import { createBundleId, endOfDay, getChangeDate, DayMS } from "../common/utils";
import { signActDao } from "./signActDao";
import { shCmdHelper } from "../helper/shCmdHelper";
import { ipaFilesDao } from "./ipaFileDao";
import { statisticsDao, SynchronizeData } from "./statisticsDao";
import { resolve } from "dns";

export interface DownloadRecordReq {
    userName?: string,        //用户
    pid?: string,
    startTime?: any,
    endTime?: any
}
export interface RelationDaoModel {
    _id?: string,
    /* 用户名 */
    user: string,
    /* 设备唯一标示 */
    udid?: string,
    /*  应用唯一标示 */
    pid?: string,
    /* 设备第一次下载时间，一次创建永不更新 */
    originDate?: Date,
    /* 设备最后一次下载时间，每一次下载都更新 */
    lastDate?: Date,
    /* 苹果账号 */
    appleAccount?: string,
    /* 下载次数，每次下载都+1 */
    downloadCount?: number,
}

/**
 * 用户，设备，账号，关系表；统计
 */
class RelationDao extends ModelBaseDao {
    public init = (conn: Connection): Promise<CodeMsgAny> => {
        let schemaDefinition = {
            user: { type: String },
            udid: { type: String, index: true },
            pid: { type: String, index: true, default: "" },
            originDate: { type: Date, index: true },
            lastDate: { type: Date },
            appleAccount: { type: String, index: true, default: "" },
            downloadCount: { type: Number, default: 0 },
        }
        this._model = MongoDbUtil.createModel(conn, {
            name: "relations",
            schemaDefinition: schemaDefinition
        })
        return Promise.resolve<CodeMsgAny>({ code: ErrCode.OK });
    }

    /**
     * 插入一条数据
     * @param req RelationDaoModel对象
     * @param count 下载次数 0，1
     */
    public async insertOne(req: RelationDaoModel, count: number): Promise<CodeMsgAny> {
        let currentDay = getChangeDate();
        let endDay = endOfDay();
        req.originDate = endDay;
        req.lastDate = currentDay;
        if (currentDay.getTime() >= endDay.getTime()) {
            /* 跨天 */
            req.originDate = getChangeDate(new Date(endDay.getTime() + DayMS));
        }
        let reData = await MongoDbUtil.insert(this._model, req);
        /* 同步下载总量 */
        await statisticsDao.insertOneOrUpdateDlCount(req.user, req.originDate, req.downloadCount, SynchronizeData.DlCount);
        /* 同步新增设备数 */
        let deviceData = await this.getCurrentDayNewDevices(req.user);
        let newDeviceNum: number = deviceData.msg && deviceData.msg.length > 0 ? deviceData.msg[0].devices : 0;
        await statisticsDao.insertOneOrUpdateDlCount(req.user, req.originDate, newDeviceNum, SynchronizeData.NewDeCount);
        /* 同步设备下载总量 */
        deviceData = await this.getCurrentDayDevices(req.user);
        let deviceNum: number = deviceData.msg && deviceData.msg.length > 0 ? deviceData.msg[0].devices.length : 0;
        await statisticsDao.insertOneOrUpdateDlCount(req.user, req.originDate, deviceNum, SynchronizeData.DeCount);
        return reData;
    }

    /**
     * 更新
     * @param pid 应用唯一标示
     * @param udid 设备号
     * @param appleAccount 苹果账号
     * @param passworld 苹果账号密码
     */
    public async updateOne(user: string, udid: string, appleAccount: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.updateMany(this._model, { user: user, udid: udid }, { $set: { appleAccount: appleAccount } });
    }

    /**
     * 复用的老账号下没有当前udid，将udid设置为无效
     * @param user 
     * @param udid 
     * @param udidChange 
     */
    public async updateUdid(appleAccount: string, udid: string, udidChange: string): Promise<CodeMsgAny> {
        return new Promise(async resolve => {
            let haveData = await MongoDbUtil.findOne(this._model, { appleAccount: appleAccount, udid: udid });
            if (haveData.code != ErrCode.OK || !haveData.msg) {
                resolve({ code: ErrCode.BadRequest, msg: haveData.msg });
                return;
            }
            let data = await MongoDbUtil.updateMany(this._model, { appleAccount: appleAccount, udid: udid }, { $set: { udid: udidChange } });
            resolve({ code: data.code, msg: data.msg });
        });
    }

    /**
     * 获取用户设备安装总数
     * @param user 用户名
     */
    public async getUserDeviceCount(user: string): Promise<CodeMsgAny> {
        let aggregations: any[] = [
            { $match: { user: user } },
            { $group: { _id: "$user", udids: { $addToSet: "$udid" } } }
        ]
        let data = await MongoDbUtil.executeAggregate(this._model, aggregations);
        if (data.code !== ErrCode.OK) {
            logger.error("获取用户设备安装总数失败：" + user);
            return data;
        }
        let count = data.msg && data.msg.length > 0 ? data.msg[0].udids.length : 0;
        return Promise.resolve({ code: ErrCode.OK, msg: count })
    }

    /**
     * 获取用户下载总量
     * @param user 用户名
     */
    public async getUserDownloadCount(user: string): Promise<CodeMsgAny> {
        let aggregates = [
            { $match: { user: user } },
            { $group: { _id: "", count: { $sum: "$downloadCount" } } }
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        if (data.code !== ErrCode.OK) {
            logger.error("获取用户下载总数失败：" + user);
            return data;
        }
        let count = data.msg.length > 0 ? data.msg[0].count : 0;
        return Promise.resolve({ code: ErrCode.OK, msg: count });
    }

    /**
     * 根据设备号获取该设备使用过的所有苹果账号，第一个或最后一个为最近使用的
     * @param udid 设备udid
     */
    public async getAppleAccountByUdid(udid: string): Promise<CodeMsgAny> {
        let aggregates = [
            { $match: { udid: udid } },
            { $sort: { lastDate: 1 } },
            { $group: { _id: "$udid", appleAccounts: { $addToSet: "$appleAccount" } } },
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        if (data.code !== ErrCode.OK) {
            logger.error("获取该设备使用过的所有苹果账号失败：" + udid);
            return data;
        }
        return Promise.resolve({ code: ErrCode.OK, msg: data.msg[0].appleAccounts });
    }

    /**
     * 30天内老账号判定
     * @param data 
    { 
        "pid" : "TgwlMWus", 
        "udid" : "5f56a8a305f06191edb1ad70bfc23a17786ced74", 
        "thirtyDay" : 2592000000.0, 
        "appleAccouts" : ["fan699329225@163.com"]
    }    
    * @param currentAppleAccount：当前账号
    */
    public async analysis(data: any, currentAppleAccount: string, user: string, udid: string): Promise<CodeMsgAny> {
        let list = data.appleAccouts;
        let reData = null;
        for (let i = 0; i < list.length; i++) {
            let apple = await signActDao.getOneByAct(list[i]);
            let item = apple.msg;
            if (apple.code == ErrCode.OK && item && item.blocked != 1) {
                // let addTime = item.addTime ? item.addTime : (await shCmdHelper.runCmd_GetAppleAccount_AddTime(list[i])).msg;
                // let subResult = (new Date()).getTime() - addTime.getTime();
                // logger.info(`----subResult------${subResult}`)
                // if (subResult < Number(data.thirtyDay)) {
                logger.info("-----------复用老账号-----------");
                let bundleId = createBundleId(item.act);
                reData = { appleAccount: item.act, passworld: item.pwd, bundleId: bundleId }
                logger.info(currentAppleAccount, reData);
                break;
                // }
            }
            else if (item && item.blocked == 1) {
                logger.info(`----------------账号被封---------------${item.act}`);
                await this.updateOne(user, udid, currentAppleAccount);
                break;
            }
        }
        return Promise.resolve({ code: ErrCode.OK, msg: reData });
    }
    /**
     *  复用30天内老账号
     * @param user 应用唯一标示
     * @param udid 设备uidid
     */
    public async getOneMonthOldAppleAccount(appleAccount: string, user: string, udid: string): Promise<CodeMsgAny> {
        let aggregates = [
            { $match: { udid: udid, user: user } },
            /* sub = 账号添加时间-最后一次下载时间(毫秒)*/
            { $project: { pid: 1, originDate: 1, udid: 1, lastDate: 1, appleAccount: 1 } },
            /* 30天整毫秒值 */
            { $set: { thirtyDay: 2592000000 } },
            { $group: { _id: { udid: "$udid", thirtyDay: "$thirtyDay" }, appleAccouts: { $addToSet: "$appleAccount" } } },
            { $project: { _id: 0, pid: "$_id.pid", udid: "$_id.udid", thirtyDay: "$_id.thirtyDay", appleAccouts: "$appleAccouts" } }
        ];
        let appleAccounts = await MongoDbUtil.executeAggregate(this._model, aggregates);
        if (appleAccounts.code !== ErrCode.OK) {
            logger.error("获取该设备使用过的所有苹果账号失败：" + udid + " " + user);
            return appleAccounts;
        }
        if (appleAccounts.msg && appleAccounts.msg.length > 0) {
            return await this.analysis(appleAccounts.msg[0], appleAccount, user, udid);
        }
        else {
            return Promise.resolve({ code: ErrCode.OK, msg: null });
        }
    }

    /**
     * 单个应用曲线图
     * 获取当前用户某单个应用的下载下载量和下载设备数统计
     * @param req 
     */
    public async getOneDayDataForApp(req: DownloadRecordReq): Promise<CodeMsgAny> {
        /* 获取当天的新设备增量 */
        let deviceData = await this.getOneDayDevicesRe(req);

        let cond: any = { user: req.userName, pid: req.pid };
        req.endTime = this.changeNumberToDate(req.endTime);
        req.startTime = this.changeNumberToDate(req.startTime);
        /* 转成当天23:59:59 */
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        if (req.startTime && req.endTime) {
            cond.originDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.originDate = { $eq: endStartTime };
        }
        let aggregations: any[] = [
            { $match: cond },
            { $group: { _id: { pid: "$pid", date: "$originDate" }, downloadCount: { $sum: "$downloadCount" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, pid: "$_id.pid", sumDate: "$_id.date", totalDlNum: "$downloadCount", dlPhoneNum: { $size: "$udids" } } },
            { $sort: { sumDate: 1 } }
        ]
        let current = await MongoDbUtil.executeAggregate(this._model, aggregations);
        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            for (let j = 0; j < deviceData.msg.length; j++) {
                if (item.sumDate.getTime() == deviceData.msg[j].sumDate.getTime()) {
                    item.devices = deviceData.msg[j].devices;
                    break;
                }
            }
        }
        current.msg = this.handleCenterDate(current.msg);
        return current;
    }

    /**
     * 当前用户所有应用曲线图（下载量，设备安装数）
     * 当天下载量，当天设备数，当天设备增量，当天账号使用数
     * @param req 
     */
    public async getAllDataForApp(req: DownloadRecordReq): Promise<CodeMsgAny> {
        req.startTime = this.changeNumberToDate(req.startTime);
        req.endTime = this.changeNumberToDate(req.endTime);
        /* 获取当天的新设备增量 */
        let deviceData = await this.getAllDayDevicesRe(req);
        /* 获取用户当天使用账号数量 */
        let accountDate = await signActDao.getUserDayAccountsUsed(req);
        let cond: any = { user: req.userName };
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        if (req.startTime && req.endTime) {
            cond.originDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.originDate = { $eq: endStartTime };
        }
        let aggregations: any[] = [
            { $match: cond },
            { $set: { appleActCount: 0 } },
            { $group: { _id: { date: "$originDate", appleActCount: "$appleActCount" }, downloadCount: { $sum: "$downloadCount" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, pid: "$_id.pid", sumDate: "$_id.date", totalDlNum: "$downloadCount", appleActCount: "$_id.appleActCount", dlPhoneNum: { $size: "$udids" } } },
            { $sort: { sumDate: 1 } }
        ];
        let current = await MongoDbUtil.executeAggregate(this._model, aggregations);
        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            for (let j = 0; j < deviceData.msg.length; j++) {
                if (item.sumDate.getTime() == deviceData.msg[j].sumDate.getTime()) {
                    item.devices = deviceData.msg[j].devices;
                    break;
                }
            }
        }

        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            for (let j = 0; j < accountDate.msg.length; j++) {
                if (item.sumDate.getTime() == endOfDay(accountDate.msg[j].sumDate).getTime()) {
                    item.appleActCount = accountDate.msg[j].appleActCount;
                    break;
                }
            }
        }
        current.msg = this.handleCenterDate(current.msg);
        return current;
    }

    /**
     * 管理员界面，获取当前所有应用每日数据
     * @param req 
     */
    public async getAllUsersDateForApp(req: DownloadRecordReq): Promise<CodeMsgAny> {
        /* 获取当天的新设备增量 */
        let deviceData = await this.getAdminAllDevicesRe(req);
        /* 获取当天所有用户账号使用量 */
        let accountDate = await signActDao.getAllUserDayAccountsUsed(req);

        let cond: any = {};
        /* 转成当天23:59:59 */
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = endOfDay(req.startTime);
        if (req.startTime && req.endTime) {
            cond.originDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.originDate = { $eq: endStartTime };
        }
        let aggregations: any[] = [
            { $match: cond },
            { $set: { appleActCount: 0 } },
            { $group: { _id: { date: "$originDate", appleActCount: "$appleActCount" }, downloadCount: { $sum: "$downloadCount" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, pid: "$_id.pid", sumDate: "$_id.date", totalDlNum: "$downloadCount", appleActCount: "$_id.appleActCount", dlPhoneNum: { $size: "$udids" } } },
            { $sort: { sumDate: 1 } }
        ];
        let current = await MongoDbUtil.executeAggregate(this._model, aggregations);
        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            for (let j = 0; j < deviceData.msg.length; j++) {
                if (item.sumDate.getTime() == deviceData.msg[j].sumDate.getTime()) {
                    item.devices = deviceData.msg[j].devices;
                    break;
                }
            }
        }

        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            for (let j = 0; j < accountDate.msg.length; j++) {
                if (item.sumDate.getTime() == endOfDay(accountDate.msg[j].sumDate).getTime()) {
                    item.appleActCount = accountDate.msg[j].appleActCount;
                    break;
                }
            }
        }
        current.msg = this.handleCenterDate(current.msg);
        return current;
    }
    public changeNumberToDate(param: any): any {
        if (typeof (param) == "number" || typeof (param) == "string") {
            return new Date(Number(param));
        }
        return param;
    }
    /**
     * 设备增量
     * 获取当前用户单个应用某一天新设备数曲线图数据
     * @param req 
     */
    public async getOneDayDevicesRe(req: DownloadRecordReq): Promise<CodeMsgAny> {
        let cond: any = { user: req.userName, pid: req.pid };
        req.endTime = this.changeNumberToDate(req.endTime);
        req.startTime = this.changeNumberToDate(req.startTime);
        /* 转成当天23:59:59 */
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        if (req.startTime && req.endTime) {
            cond.originDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.originDate = { $eq: endStartTime };
        }
        /* 获取当天的设备总数 */
        let aggregationsOne: any[] = [
            { $match: cond },
            { $set: { devices: 0 } },
            { $group: { _id: { pid: "$pid", date: "$originDate", devices: "$devices" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, pid: "$_id.pid", sumDate: "$_id.date", devices: "$_id.devices", udids: "$udids" } },
            { $sort: { sumDate: 1 } }
        ];
        let current = await MongoDbUtil.executeAggregate(this._model, aggregationsOne);
        /* 获取所有每一天设备数 */
        cond = { user: req.userName, pid: req.pid };
        let aggregationsTwo: any[] = [
            { $match: cond },
            { $group: { _id: { pid: "$pid", date: "$originDate" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, pid: "$_id.pid", sumDate: "$_id.date", udids: "$udids" } },
            { $sort: { sumDate: 1 } }
        ];
        let all = await MongoDbUtil.executeAggregate(this._model, aggregationsTwo);
        if (current.code !== ErrCode.OK || all.code !== ErrCode.OK) {
            logger.error("查询单个应用当日设备增加总数失败" + JSON.stringify(current) + JSON.stringify(all));
            return current.code !== ErrCode.OK ? current : all;
        }
        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            item.devices = this.selectDate(all.msg, item);
        }
        return current;
    }

    /**
     *  设备增量
      * 获取当前用户所有应用某一天新设备数曲线图数据
      * @param req 
      */
    public async getAllDayDevicesRe(req: DownloadRecordReq): Promise<CodeMsgAny> {
        let cond: any = { user: req.userName };
        req.endTime = this.changeNumberToDate(req.endTime);
        req.startTime = this.changeNumberToDate(req.startTime);
        /* 转成当天23:59:59 */
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        if (req.startTime && req.endTime) {
            cond.originDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.originDate = { $eq: endStartTime };
        }
        /* 获取当天的设备总数 */
        let aggregationsOne: any[] = [
            { $match: cond },
            { $set: { devices: 0 } },
            { $group: { _id: { date: "$originDate", devices: "$devices" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, sumDate: "$_id.date", devices: "$_id.devices", udids: "$udids" } },
            { $sort: { sumDate: 1 } }
        ];
        let current = await MongoDbUtil.executeAggregate(this._model, aggregationsOne);
        /* 获取所有每一天设备数 */
        cond = { user: req.userName };
        let aggregationsTwo: any[] = [
            { $match: cond },
            { $group: { _id: { date: "$originDate" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, sumDate: "$_id.date", udids: "$udids" } },
            { $sort: { sumDate: 1 } }
        ];
        let all = await MongoDbUtil.executeAggregate(this._model, aggregationsTwo);
        if (current.code !== ErrCode.OK || all.code !== ErrCode.OK) {
            logger.error("查询单个应用当日设备增加总数失败" + JSON.stringify(current) + JSON.stringify(all));
            return current.code !== ErrCode.OK ? current : all;
        }
        for (let i = 0; i < current.msg.length; i++) {
            current.msg[i].devices = this.selectDate(all.msg, current.msg[i]);
        }
        return current;
    }
    /**
     *  设备增量
      * 管理员界面所有用户所有应用某一天新设备数曲线图数据
      * @param req 
      * @param isUser 查询分组是否加上用户 
      */
    public async getAdminAllDevicesRe(req: DownloadRecordReq, isUser?: boolean): Promise<CodeMsgAny> {
        let cond: any = {};
        req.startTime = 1;
        /* 转成当天23:59:59 */
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = endOfDay(req.startTime);
        if (req.startTime && req.endTime) {
            cond.originDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.originDate = { $eq: endStartTime };
        }
        /* 获取当天的设备总数 */
        let aggregationsOne: any[] = [
            { $match: cond },
            { $set: { devices: 0 } },
            { $group: { _id: { date: "$originDate", devices: "$devices" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, sumDate: "$_id.date", devices: "$_id.devices", udids: "$udids" } },
            { $sort: { sumDate: 1 } }
        ];
        if (isUser) {
            aggregationsOne = [
                { $match: cond },
                { $set: { devices: 0 } },
                { $group: { _id: { date: "$originDate", user: "$user", devices: "$devices" }, udids: { $addToSet: "$udid" } } },
                { $project: { _id: 0, sumDate: "$_id.date", user: "$_id.user", devices: "$_id.devices", udids: "$udids" } },
                { $sort: { sumDate: 1 } }
            ];
        }
        let current = await MongoDbUtil.executeAggregate(this._model, aggregationsOne);
        /* 获取所有每一天设备数 */
        let aggregationsTwo: any[] = [
            { $group: { _id: { date: "$originDate" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, sumDate: "$_id.date", udids: "$udids" } },
            { $sort: { sumDate: 1 } }
        ];
        if (isUser) {
            aggregationsTwo = [
                { $group: { _id: { date: "$originDate", user: "$user" }, udids: { $addToSet: "$udid" } } },
                { $project: { _id: 0, sumDate: "$_id.date", user: "$_id.user", udids: "$udids" } },
                { $sort: { sumDate: 1 } }
            ];
        }
        let all = await MongoDbUtil.executeAggregate(this._model, aggregationsTwo);
        if (current.code !== ErrCode.OK || all.code !== ErrCode.OK) {
            logger.error("查询单个应用当日设备增加总数失败" + JSON.stringify(current) + JSON.stringify(all));
            return current.code !== ErrCode.OK ? current : all;
        }
        if (isUser) {
            for (let i = 0; i < current.msg.length; i++) {
                current.msg[i].devices = this.selectDateByUser(all.msg, current.msg[i]);
            }
        }
        else {
            for (let i = 0; i < current.msg.length; i++) {
                current.msg[i].devices = this.selectDate(all.msg, current.msg[i]);
            }
        }
        return current;
    }

    /**
     * 
     * @param list Array 所有用户每一天的数据列表[{user,sumDate,udids}]
     * @param oneday 单个用户一天的数据
     */
    public selectDateByUser(list: any, oneday: any): number {
        let ignoreTime = getChangeDate(oneday.sumDate).getTime();
        /* 取出当天以前的说有设备数 */
        let allDevices: any[] = [];
        for (let i = 0; i < list.length; i++) {
            let time = getChangeDate(list[i].sumDate).getTime();
            if (time >= ignoreTime || oneday.user != list[i].user) { continue; }
            for (let j = 0; j < list[i].udids.length; j++) {
                allDevices.push(list[i].udids[j]);
            }
        }
        /* 得到当天的设备增量 */
        let count = 0;
        for (let m = 0; m < oneday.udids.length; m++) {
            let isHave = allDevices.find((element: string) => { return element == oneday.udids[m]; });
            if (!isHave) {
                count++;
            }
        }
        return count;
    }
    /**
     * 
     * @param list Array 一个应用每一天的数据列表[{pid,sumDate,udids}]
     * @param oneday 单个应用一天的数据
     */
    public selectDate(list: any, oneday: any): number {
        let ignoreTime = getChangeDate(oneday.sumDate).getTime();
        /* 取出当天以前的说有设备数 */
        let allDevices: any[] = [];
        for (let i = 0; i < list.length; i++) {
            let time = getChangeDate(list[i].sumDate).getTime();
            if (time >= ignoreTime) { continue; }
            for (let j = 0; j < list[i].udids.length; j++) {
                allDevices.push(list[i].udids[j]);
            }
        }
        /* 得到当天的设备增量 */
        let count = 0;
        for (let m = 0; m < oneday.udids.length; m++) {
            let isHave = allDevices.find((element: string) => { return element == oneday.udids[m]; });
            if (!isHave) {
                count++;
            }
        }
        return count;
    }

    /**
     * 补全非连续天数据
     * @param list Array
     */
    public handleCenterDate(list: any[]): any {
        let tempArr1: any[] = [];
        let tempArr2: any[] = [];
        for (let i = 0; i < list.length; i++) {
            tempArr1.push(list[i].sumDate.getTime());
        }
        tempArr1.sort((a, b) => { return a - b });
        /* 取出不连续的天 */
        for (let j = 1; j < tempArr1.length; j++) {
            let gap = tempArr1[j] - tempArr1[j - 1];
            if ((gap - DayMS) != 0) {
                tempArr2.push({ begin: tempArr1[j - 1], days: gap - DayMS });
            }
        }

        for (let m = 0; m < tempArr2.length; m++) {
            let day = tempArr2[m].days / DayMS;
            for (let n = 0; n < day; n++) {
                let item: any = {};
                item.sumDate = getChangeDate(tempArr2[m].begin + (n + 1) * DayMS);
                item.totalDlNum = 0;
                item.dlPhoneNum = 0;
                item.devices = 0;
                item.appleActCount = 0;
                list.push(item);
            }
        }
        list.sort((a, b) => { return a.sumDate - b.sumDate })
        return list;
    }
    /**
     * 取出所有用户的udid
     */
    public async getUdidsByUser(): Promise<CodeMsgAny> {
        let aggregates: any[] = [
            { $group: { _id: "$user", udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, user: "$_id", udids: "$udids" } }
        ];
        return await MongoDbUtil.executeAggregate(this._model, aggregates);
    }

    /**
     * 获取设备下载的最新一条数据
     * @param user 用户
     * @param udid 设备号
     */
    public async getActUdid(user: string, udid: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.findMany(this._model, { user: user, udid: udid }, { "lastDate": -1 });
    }

    public async updateMany(user: string, udid: string, act: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.updateMany(this._model, { user: user, udid: udid, appleAccount: { $ne: act } }, { appleAccount: act });
    }
    public async updateManyByAct(oldAct: string, act: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.updateMany(this._model, { appleAccount: oldAct }, { appleAccount: act });
    }

    public async getUserActList(): Promise<CodeMsgAny> {
        let aggregates: any[] = [
            { $group: { _id: { user: "$user" }, acts: { $addToSet: "$appleAccount" } } },
            { $project: { _id: 0, user: "$_id.user", actList: "$acts" } }
        ];
        return await MongoDbUtil.executeAggregate(this._model, aggregates);
    }

    /**
     * 获取用户账号列表，除开当前正在使用的
     * @param user 用户名
     * @param currentAct 当前使用的账号
     */
    public async getAllActByUser(user: string, currentAct: string): Promise<CodeMsgAny> {
        let aggregates: any[] = [
            { $match: { user: user, appleAccount: { $ne: currentAct } } },
            { $group: { _id: null, actList: { $addToSet: "$appleAccount" } } }
        ];
        return await MongoDbUtil.executeAggregate(this._model, aggregates);
    }

    /*-------------------------------------------------------------------------------------------------*/
    /**
     * 初始化数据统计statistics
     */
    public async initStatistics(): Promise<CodeMsgAny> {
        let req: DownloadRecordReq = {}
        req.startTime = 1;
        req.endTime = new Date().getTime() + DayMS * 10;

        /* 获取当天的新设备增量 */
        let deviceData = await this.getAdminAllDevicesRe(req, true);
        /* 获取当天所有用户账号使用量 */
        let accountDate = await signActDao.getAllUserDayAccountsUsed(req, true);
        let cond: any = {};
        /* 转成当天23:59:59 */
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = endOfDay(req.startTime);
        cond.originDate = { $gte: endStartTime, $lte: req.endTime };
        let aggregations: any[] = [
            { $match: cond },
            { $set: { appleActCount: 0 } },
            { $group: { _id: { date: "$originDate", user: "$user", appleActCount: "$appleActCount" }, downloadCount: { $sum: "$downloadCount" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, pid: "$_id.pid", user: "$_id.user", sumDate: "$_id.date", totalDlNum: "$downloadCount", appleActCount: "$_id.appleActCount", dlPhoneNum: { $size: "$udids" } } },
            { $sort: { sumDate: 1 } }
        ];
        let current = await MongoDbUtil.executeAggregate(this._model, aggregations);
        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            for (let j = 0; j < deviceData.msg.length; j++) {
                if (item.sumDate.getTime() == deviceData.msg[j].sumDate.getTime() && item.user == deviceData.msg[j].user) {
                    item.devices = deviceData.msg[j].devices;
                    break;
                }
            }
        }

        for (let i = 0; i < current.msg.length; i++) {
            let item = current.msg[i];
            for (let j = 0; j < accountDate.msg.length; j++) {
                if (item.sumDate.getTime() == endOfDay(accountDate.msg[j].sumDate).getTime() && item.user == accountDate.msg[j].user) {
                    item.appleActCount = accountDate.msg[j].appleActCount;
                    break;
                }
            }
        }
        current.msg = this.handleCenterDate(current.msg);
        return current;
    }

    /**
     * 获取用户今日新设备增量
     * @param userName 用户名
     */
    public async getCurrentDayNewDevices(userName: string): Promise<CodeMsgAny> {
        let time = new Date().getTime() > endOfDay().getTime() ? endOfDay().getTime() + DayMS : endOfDay().getTime();
        let req: DownloadRecordReq = { userName: userName, startTime: new Date(time), endTime: new Date(time) }
        let deviceData = await this.getAllDayDevicesRe(req);
        return deviceData;
    }
    /**
     * 获取用户今日下载设备总量
     * @param userName 用户名
     */
    public async getCurrentDayDevices(userName: string): Promise<CodeMsgAny> {
        let time = new Date().getTime() > endOfDay().getTime() ? endOfDay().getTime() + DayMS : endOfDay().getTime();
        let req: DownloadRecordReq = { userName: userName, startTime: new Date(time), endTime: new Date(time) };
        let cond = { user: userName, originDate: { $eq: new Date(time) } };
        let aggregates: any[] = [
            { $match: cond },
            { $group: { _id: { originDate: "$originDate" }, udids: { $addToSet: "$udid" } } },
            { $project: { _id: 0, sumDate: "$_id.originDate", devices: "$udids" } }
        ]
        let deviceData = await MongoDbUtil.executeAggregate(this._model, aggregates);
        return deviceData;
    }
}

export const relationDao = new RelationDao();