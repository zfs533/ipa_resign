import { Connection, Schema } from "mongoose";
import { MongoDbUtil } from "./mongoDbUtil";
import { CodeMsgAny, dataMessage } from "../common/codeMsg";
import { ErrCode } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";
import { logger } from "../common/logger";
import { createBundleId, endOfDay, getChangeDate, DayMS } from "../common/utils";
import { RelationDaoModel, DownloadRecordReq, relationDao } from "./relationDao";

export interface StatisticsDaoModel {
    _id?: string,
    /* 用户名 */
    user: string,
    /*  设备下载数 */
    deCount?: number,
    /* 新增设备数 */
    newDeCount?: number,
    /*  下载总数 */
    dlCount?: number,
    /* 苹果账号销量 */
    actCount?: number,
    /* 时间 */
    day?: Date,
}

/**
 * 同步数据类型
 */
export enum SynchronizeData {
    DlCount = 1,
    DeCount = 2,
    NewDeCount = 3,
    ActCount = 4,
}

/**
 * 数据统计
 */
class StatisticsDao extends ModelBaseDao {
    public init = (conn: Connection): Promise<CodeMsgAny> => {
        let schemaDefinition = {
            user: { type: String, index: true },
            day: { type: Date, index: true },
            dlCount: { type: Number, default: 0 },
            deCount: { type: Number, default: 0 },
            newDeCount: { type: Number, default: 0 },
            actCount: { type: Number, default: 0 },
        }
        this._model = MongoDbUtil.createModel(conn, {
            name: "statistics",
            schemaDefinition: schemaDefinition
        })
        this.initData();
        return Promise.resolve<CodeMsgAny>({ code: ErrCode.OK });
    }

    public async initData() {
        /* 初始化并同步数据 */
        let relData = await relationDao.initStatistics();
        if (relData.code != ErrCode.OK) {
            logger.error("初始化同步数据统计失败！");
            return;
        }
        for (let i = 0; i < relData.msg.length; i++) {
            let item = relData.msg[i];
            if (!item.user || item.user.length < 1) { continue; }
            let data = await MongoDbUtil.findOne(this._model, { user: item.user, day: item.sumDate });
            let req: StatisticsDaoModel = {
                user: item.user,
                day: item.sumDate,
                dlCount: item.totalDlNum,
                deCount: item.dlPhoneNum,
                newDeCount: item.devices,
                actCount: item.appleActCount
            }
            if (!data.msg) {
                await this.insertOne(req);
            }
            else {
                await this.updateOne(req);
            }
        }
    }
    /**
     * 更新数据
     * @param user 
     * @param day 
     */
    public async insertOneOrUpdateDlCount(user: string, day: Date, count: number, type: number): Promise<CodeMsgAny> {
        let data = await MongoDbUtil.findOne(this._model, { user: user, day: day });
        if (!data.msg) {
            let req: StatisticsDaoModel = {
                user: user,
                day: day,
                dlCount: 1,
                deCount: 1,
                newDeCount: 0,
                actCount: 0
            }
            await this.insertOne(req);
        }
        else {
            switch (type) {
                case SynchronizeData.DlCount:
                    data = await MongoDbUtil.updateOne(this._model, { user: user, day: day }, { $inc: { dlCount: count } });
                    break;
                case SynchronizeData.DeCount:
                    data = await MongoDbUtil.updateOne(this._model, { user: user, day: day }, { deCount: count });
                    break;
                case SynchronizeData.NewDeCount:
                    data = await MongoDbUtil.updateOne(this._model, { user: user, day: day }, { newDeCount: count });
                    break;
                case SynchronizeData.ActCount:
                    data = await MongoDbUtil.updateOne(this._model, { user: user, day: day }, { actCount: count });
                    break;
                default: break;
            }
        }
        return data;
    }

    public async insertOne(req: StatisticsDaoModel): Promise<CodeMsgAny> {
        return await MongoDbUtil.insert(this._model, req);
    }
    public async updateOne(req: StatisticsDaoModel): Promise<CodeMsgAny> {
        return await MongoDbUtil.updateOne(this._model, { user: req.user, day: req.day }, req);
    }

    /**
     * 获取单个用户的数据统计
     * @param req 
     */
    public async getDataByuser(req: DownloadRecordReq): Promise<CodeMsgAny> {
        req.startTime = relationDao.changeNumberToDate(req.startTime);
        req.endTime = relationDao.changeNumberToDate(req.endTime);
        let cond: any = { user: req.userName };
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        if (req.startTime && req.endTime) {
            cond.day = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.day = { $eq: endStartTime };
        }
        // let data = await MongoDbUtil.findMany(this._model, cond);
        let aggregates: any[] = [
            { $match: cond },
            { $project: { _id: 0, sumDate: "$day", totalDlNum: "$dlCount", dlPhoneNum: "$deCount", devices: "$newDeCount", appleActCount: "$actCount" } }
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        data.msg = relationDao.handleCenterDate(data.msg);
        return data;
    }

    /**
     * 获取所有用户的曲线图数据
     * @param req  
     */
    public async getAllData(req: DownloadRecordReq): Promise<CodeMsgAny> {
        req.startTime = relationDao.changeNumberToDate(req.startTime);
        req.endTime = relationDao.changeNumberToDate(req.endTime);
        let cond: any = {};
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        if (req.startTime && req.endTime) {
            cond.day = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.day = { $eq: endStartTime };
        }
        let aggregates: any[] = [
            { $match: cond },
            { $group: { _id: { day: "$day" }, dlCount: { $sum: "$dlCount" }, deCount: { $sum: "$deCount" }, newDeCount: { $sum: "$newDeCount" }, actCount: { $sum: "$actCount" } } },
            { $project: { _id: 0, sumDate: "$_id.day", totalDlNum: "$dlCount", dlPhoneNum: "$deCount", devices: "$newDeCount", appleActCount: "$actCount" } }
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        data.msg = relationDao.handleCenterDate(data.msg);
        data.msg.sort((a: any, b: any) => { return a.sumDate.getTime() - b.sumDate.getTime() });
        return data;
    }
    /**
     * 获取用户设备安装数（无重复，每日新增设备数相加即可）
     * @param user 用户名
     */
    public async getDeviceCountByUser(user: string): Promise<CodeMsgAny> {
        let aggregates: any[] = [
            { $match: { user: user } },
            { $group: { _id: "$user", newDeCount: { $sum: "$newDeCount" } } }
        ]
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        return data;
    }
    /**
     * 获取用户总下载量
     * @param user 用户名
     */
    public async getDownloadCountByUser(user: string): Promise<CodeMsgAny> {
        let aggregates: any[] = [
            { $match: { user: user } },
            { $group: { _id: "$user", dlCount: { $sum: "$dlCount" } } }
        ]
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        return data;
    }
    /**
     * 获取用户当日新增设备数
     * @param user 
     */
    public async getCurrentDayNewDevice(user: string): Promise<CodeMsgAny> {
        let time = new Date().getTime() > endOfDay().getTime() ? endOfDay().getTime() + DayMS : endOfDay().getTime();
        let data = await MongoDbUtil.findOne(this._model, { user: user, day: new Date(time) })
        return data;
    }

    /**
     * 获取用户所有数据
     * @param user 
     */
    public async getStatisticsByUser(user: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.findMany(this._model, { user: user }, { "$day": 1 });
    }

    /**
     * 获取某一个用户某月数据
     * @param req 
     */
    public async getStatisticsByMonth(req: DownloadRecordReq): Promise<CodeMsgAny> {
        let startTime = getChangeDate(req.startTime);
        let endTime = getChangeDate(req.endTime);
        let startYear = startTime.getFullYear();
        let startMonth = startTime.getMonth();
        let endYear = endTime.getFullYear();
        let endMonth = endTime.getMonth() + 1;
        let data: any;
        if (req.userName) {
            data = await this.getStatisticsByUser(req.userName);
        }
        else {
            data = await MongoDbUtil.findMany(this._model, {}, { "$day": 1 });
        }
        if (data.code != ErrCode.OK) {
            return data;
        }
        let list = data.msg || [];
        let subMonth = endMonth - startMonth;
        let result: any[] = [];
        if (startYear == endYear) {
            let dt = this.selectMonthData(list, startMonth, startYear);
            if (dt.length > 0) result.push(dt);
            if (subMonth > 0) {
                for (let i = 1; i < subMonth; i++) {
                    dt = this.selectMonthData(list, startMonth + i, startYear)
                    if (dt.length > 0)
                        result.push(dt)
                }
            }
        }
        else {
            /* 跨年 */
            subMonth = 12 - startMonth;
            let dt = this.selectMonthData(list, startMonth, startYear);
            if (dt.length > 0) result.push(dt);
            if (subMonth > 0) {
                for (let i = 1; i < subMonth; i++) {
                    dt = this.selectMonthData(list, startMonth + i, startYear)
                    if (dt.length > 0)
                        result.push(dt)
                }
            }
            subMonth = endMonth - 1;
            dt = this.selectMonthData(list, 0, endYear);
            if (dt.length > 0) result.push(dt);
            if (subMonth > 0) {
                for (let i = 0; i < subMonth; i++) {
                    dt = this.selectMonthData(list, 1 + i, endYear)
                    if (dt.length > 0)
                        result.push(dt)
                }
            }
        }


        return Promise.resolve({ code: ErrCode.OK, msg: result });
    }

    private selectMonthData(list: any[], mth: number, yr: number): any {
        let temp = [];
        for (let i = 0; i < list.length; i++) {
            let month = list[i].day.getMonth();
            let year = list[i].day.getFullYear();
            if (month == mth && year == yr) {
                if (temp.length < 1) {
                    temp.push(list[i])
                }
                else {
                    temp[0].dlCount += list[i].dlCount;
                    temp[0].deCount += list[i].deCount;
                    temp[0].newDeCount += list[i].newDeCount;
                    temp[0].actCount += list[i].actCount;
                }
            }
        }
        return temp;
    }
}

export const statisticsDao = new StatisticsDao();