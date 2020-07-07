import { Connection, Model, Schema } from "mongoose";
import { CodeMsg, ErrCode, CodeMsgAny } from "../common/codeMsg";
import { MongoDbUtil, TransSession } from "./mongoDbUtil";
import { ModelBaseDao } from "./modelBaseDao";
import { getChangeDate, DayMS, endOfDay } from "../common/utils";
import { logger } from "../common/logger";
import { DownloadRecordReq } from "./relationDao";
import { shCmdHelper } from "../helper/shCmdHelper";
import { accountApi } from "../controller/accountApi";

export enum AccountStatus {
    Normal = "Normal",              //正常
    OtherProblem = "OtherProblem",  //异常
    Full = "Full",                  //签满
    Blocked = "Blocked",            //被封
    Changing = "Changing",          //切换中
    Changed = "Changed",            //切换完成
    Free = "Free",                  //空闲
}

export interface SignActReq {
    act?: string,
    user?: string,
    page: number,
    count: number
}
export interface SignActModel {
    _id?: string,
    act: string,
    pwd: string,
    status: string,      //枚举   Normal   NoLogin   Full   OtherProblem
    user: string,
    /* 设备安装数 */
    dlNum?: number,
    /* 切换账号状态，切换中，切换完成 */
    change?: string,
    /* 账号下设备真实数量 */
    deviceCount?: number,
    /* 添加账号时间 */
    addTime?: Date,
    /* 是否被封 0正常，1被封 */
    blocked?: number,
    /* 账号切换时间，过期时间 */
    changeDate?: Date,
    /* 新号被选，避免两个同时切换找到同一个信号，1表示被选了 */
    selectStatus?: number,
    /*是否被封，不存到数据库表里 */
    isBlocked?: number,
    /* 过期时间 */
    expired?: number
}

class SignActDao extends ModelBaseDao {
    public init = (conn: Connection): Promise<CodeMsgAny> => {
        let schema = new Schema({
            act: { type: String, index: true, unique: true },       //签名账号
            pwd: { type: String, index: true },                     //密码
            status: String,      //枚举   Normal   NoLogin   Full   OtherProblem
            user: { type: String, default: null },   //绑定使用用户
            change: { type: String, default: null },   //账号切换状态
            deviceCount: { type: Number, default: 0 },  //账号下真实设备数
            addTime: { type: Date }, //账号添加时间
            blocked: { type: Number, default: 0 }, //是否被封 0正常，1被封
            changeDate: { type: Date },
            selectStatus: { type: Number },
            expired: { type: Number, default: 30 }
        }, { versionKey: false });

        this._model = MongoDbUtil.createModel(conn, {
            name: "appAppleSignAct",
            schema: schema
        });
        this.initData();
        return Promise.resolve<CodeMsgAny>({ code: ErrCode.OK });
    }

    public async initData() {
        /* 同步添加时间和过期时间 */
        let data = await shCmdHelper.runCmd_GetAppleAccount_AddTime("", true);
        if (data.code == ErrCode.OK && data.msg) {
            let actData = await this.getMany({ blocked: { $ne: 1 } });
            for (let i = 0; i < actData.msg.length; i++) {
                let addTime = accountApi.getActAddTime(data.msg, actData.msg[i].act);
                let expired = 0;
                let oldTime = getChangeDate(actData.msg[i].addTime);
                if (addTime.getTime() > oldTime.getTime()) {
                    addTime = oldTime;
                    /* 缓存中没有这个号 */
                    expired = 30 - Math.ceil((getChangeDate().getTime() - oldTime.getTime()) / DayMS);
                }
                else {
                    expired = 30 - Math.ceil((getChangeDate().getTime() - addTime.getTime()) / DayMS);
                }
                await MongoDbUtil.updateOne(this._model, { act: actData.msg[i].act }, { $set: { addTime: addTime, expired: expired } })
            }
        }
    }
    /**
     * 
     * @param req
     * @param really 是否真正的切换，设备数=100或账号被封为真正的切换（账号切换时间会保存下来，并将账号状态设置为Full,Changed）
     * @param really 不是真正的切换，走切换任务准备备用账号（当前账号的状态会还原为change:null,status:Normal）
     */
    public async updateStatus(req: SignActModel, really?: boolean): Promise<CodeMsg<any>> {
        if (really) {
            return await MongoDbUtil.updateOne(this._model, { act: req.act }, { $set: { status: req.status, change: req.change, changeDate: getChangeDate() } });
        }
        else {
            return await MongoDbUtil.updateOne(this._model, { act: req.act }, { $set: { status: req.status, change: req.change } });
        }
    }

    /**
     * 切换账号时将新选中的账号设置为已选，避免两个用户选用同一个账号
     * @param act 
     */
    public async updateNewActStatus(act: string, selectStatus: number): Promise<CodeMsg<any>> {
        logger.info(`updatenewactstatus:act ${act} selectStatus: ${selectStatus}`);
        return await MongoDbUtil.updateOne(this._model, { act: act }, { $set: { selectStatus: selectStatus } });
    }

    //刷新账号下真实设备数
    public updateDeviceCount = (act: string, deviceCount: number): Promise<CodeMsg<any>> => {
        return MongoDbUtil.updateOne(this._model, { act: act }, { $set: { deviceCount: deviceCount } });
    }

    public getOneByAct = (act: string): Promise<CodeMsg<SignActModel>> => {
        return MongoDbUtil.findOne(this._model, { act: act });
    }

    /**
     * 设置被封状态
     * @param act 账号
     */
    public async updateBlocked(act: string): Promise<CodeMsg<any>> {
        return MongoDbUtil.updateOne(this._model, { act: act }, { $set: { blocked: 1 } });
    }

    public getList = (cond: any, page: number, count: number): Promise<CodeMsg<SignActModel[]>> => {
        return MongoDbUtil.findMany(this._model, cond, { user: -1 }, page, count);
    }

    async getMany(cond: any): Promise<CodeMsgAny> {
        return await MongoDbUtil.findMany(this._model, cond);
    }

    getActCount = (condCount: any): Promise<CodeMsg<number>> => {
        return MongoDbUtil.findCount(this._model, condCount);
    }

    //获取没有绑定用户的正常账号绑定之,且没有被其他用户选了
    bindAct = (): Promise<CodeMsg<SignActModel>> => {
        return MongoDbUtil.findOne(this._model, { status: AccountStatus.Normal, user: null, selectStatus: { $ne: 1 }, blocked: { $ne: 1 } });
    }

    updateBindAct = (act: string, user: string): Promise<CodeMsgAny> => {
        return MongoDbUtil.updateOne(this._model, { act: act }, { $set: { user: user } });
    }

    /**
     * 获取没有绑定用户的正常账号绑定之(绑定两个账号)
     * @param userName 用户名
     * @param session 
     */
    async bindActByAdd(userName: string, session?: TransSession): Promise<CodeMsgAny> {
        if (session) {
            await MongoDbUtil.updateOne(this._model, { status: AccountStatus.Normal, user: null, blocked: { $ne: 1 }, selectStatus: { $ne: 1 } }, { $set: { user: userName } }, undefined, { session });
            return await MongoDbUtil.updateOne(this._model, { status: AccountStatus.Normal, user: null, blocked: { $ne: 1 }, selectStatus: { $ne: 1 } }, { $set: { user: userName } }, undefined, { session });
        }
        else {
            await MongoDbUtil.updateOne(this._model, { status: AccountStatus.Normal, user: null, blocked: { $ne: 1 }, selectStatus: { $ne: 1 } }, { $set: { user: userName } });
            return await MongoDbUtil.updateOne(this._model, { status: AccountStatus.Normal, user: null, blocked: { $ne: 1 }, selectStatus: { $ne: 1 } }, { $set: { user: userName } });
        }
    }

    public addNewAccount = (req: SignActModel): Promise<CodeMsgAny> => {
        return MongoDbUtil.insert(this._model, req);
    }

    public deleteAccount = (id: string): Promise<CodeMsgAny> => {
        return MongoDbUtil.deleteOne(this._model, { _id: id });
    }

    public deleteAccounts = (pid: string, session: TransSession): Promise<CodeMsgAny> => {
        return MongoDbUtil.deleteMany(this._model, { pid: pid }, { session });
    }

    /**
     * 获取用户所有可用账号（状态为Normal且没被封blocked != 1）
     * @param user 用户名
     */
    public async getAccountList(user: string): Promise<CodeMsg<SignActModel[]>> {
        let actList = await MongoDbUtil.findMany(this._model, { user: user, status: AccountStatus.Normal, blocked: { $ne: 1 } });
        if (actList.code !== ErrCode.OK) {
            logger.error(`getAccountList，获取 ${user} 苹果账号失败`);
            return actList;
        }
        actList.msg.sort((a, b) => { return b.deviceCount - a.deviceCount });
        return actList;
    }

    /**
     * 获取用户正在切换中的账号
     * @param user 
     */
    public async getChangingAccount(user: string): Promise<CodeMsgAny> {
        return await MongoDbUtil.findOne(this._model, { user: user, change: AccountStatus.Changing });
    }

    /**
     * 获取已绑定用户的账号,且账号状态为Normal,或者账号已经被封blocked = 1
     * 最好返回的是一个满足切换条件并且无重复项的列表
     */
    public async getValidActs(): Promise<CodeMsg<any[]>> {
        return new Promise(async resolve => {
            let nul: any = null;
            let aggregations = [
                { $match: { user: { $ne: nul }, change: nul, status: AccountStatus.Normal } },
                { $project: { user: 1, change: 1, status: 1, blocked: 1, act: 1, pwd: 1, deviceCount: 1, isBlocked: { $eq: ["$blocked", 1] } } }
            ];
            let data = await MongoDbUtil.executeAggregate(this._model, aggregations);
            if (data.code !== ErrCode.OK) {
                return data;
            }
            /* 选出当前账号数小于2，或者被封的账号 */
            let list: any[] = data.msg || [];
            let resultList: any[] = [];
            for (let j = 0; j < list.length; j++) {
                let bool = false;
                for (let m = 0; m < resultList.length; m++) {
                    if (resultList[m].data.user == list[j].user && !list[j].isBlocked && !resultList[m].data.isBlocked) {
                        resultList[m].appleActCount++;
                        bool = true;
                        break;
                    }
                }
                if (!bool)
                    resultList.push({ data: list[j], appleActCount: 1 });
            }
            let reList: any[] = [];
            for (let i = 0; i < resultList.length; i++) {
                if (resultList[i].appleActCount < 2) {
                    /* 如果用户有账号正在切换，则先将其忽略 */
                    let changingAct = await signActDao.getChangingAccount(resultList[i].data.user);
                    if (changingAct.code == ErrCode.OK) {
                        if (!changingAct.msg) {
                            reList.push(resultList[i].data);
                        }
                    }
                }
            }
            /* 一个用户下只允许有一个账号同时走切换任务，避免一个被封一个又刚好满足切换条件同时去跑任务的情况, 如果有被封的则优先选被封的切换 */
            let noRepeatList: any[] = [];
            for (let n = 0; n < reList.length; n++) {
                let itemIn = noRepeatList.find((element: any) => { return element.user == reList[n].user });
                if (itemIn) {
                    /* 优先选择被封的账号切换 */
                    if (!itemIn.isBlocked && reList[n].isBlocked) {
                        let index = noRepeatList.indexOf(itemIn);
                        noRepeatList.splice(index, 1, reList[n]);
                    }
                }
                else {
                    noRepeatList.push(reList[n]);
                }
            }
            resolve({ code: ErrCode.OK, msg: noRepeatList });
        });
    }

    /**
     * 获取用户当天使用账号数量(曲线图)
     * @param req 
     */
    public async getUserDayAccountsUsed(req: DownloadRecordReq): Promise<CodeMsgAny> {
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        let cond: any = { user: req.userName };
        if (req.startTime && req.endTime) {
            cond.changeDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.changeDate = { $eq: endStartTime };
        }

        let aggregations: any[] = [
            { $match: cond },
            { $group: { _id: "$user", dateList: { $addToSet: "$changeDate" } } }
        ];
        let data: any = await MongoDbUtil.executeAggregate(this._model, aggregations);
        if (data.code != ErrCode.OK) {
            logger.error("统计用户每日消耗账号数失败" + JSON.stringify(data));
            return data;
        }
        if (data.msg.length < 1) {
            return data;
        }
        /* 时间转整点 */
        let list: any = data.msg[0].dateList;
        for (let i = 0; i < list.length; i++) {
            let endDay = endOfDay(list[i]);
            let current = list[i];
            /* 跨天 */
            if (current.getTime() >= endDay.getTime()) {
                current = new Date(current.getTime() + DayMS);
            }
            list[i] = (new Date(current.getFullYear(), current.getMonth(), current.getDate()));
        }
        /* 将时间根据天进行分组 */
        let resultList: any[] = [];
        for (let j = 0; j < list.length; j++) {
            let bool = false;
            for (let m = 0; m < resultList.length; m++) {
                if (resultList[m].sumDate.getTime() == list[j].getTime()) {
                    resultList[m].appleActCount++;
                    bool = true;
                    break;
                }
            }
            if (!bool)
                resultList.push({ sumDate: list[j], appleActCount: 1 });
        }

        return Promise.resolve({ code: ErrCode.OK, msg: resultList });
    }

    /**
     * 获取用户今日账号使用量
     * @param userName 用户名
     */
    public async getCurrentDayDevices(userName: string): Promise<CodeMsgAny> {
        let time = new Date().getTime() > endOfDay().getTime() ? endOfDay().getTime() + DayMS : endOfDay().getTime();
        let req: DownloadRecordReq = { userName: userName, startTime: new Date(time - DayMS), endTime: new Date(time) };
        logger.info(req);
        let data = await this.getUserDayAccountsUsed(req);
        for (let i = 0; i < data.msg.length; i++) {
            data.msg[i].sumDate = endOfDay(new Date(data.msg[i].sumDate));
        }
        logger.info(data);
        return data;
    }

    /**
     * 获取所以用户每日苹果账号消耗（曲线图）
     * @param req 
     * @param isUser 是否按用户名分组 
     */
    public async getAllUserDayAccountsUsed(req: DownloadRecordReq, isUser?: boolean): Promise<CodeMsgAny> {
        req.endTime = endOfDay(req.endTime);
        let endStartTime = endOfDay(req.startTime);
        req.startTime = getChangeDate(req.startTime);
        let cond: any = {};
        if (req.startTime && req.endTime) {
            cond.changeDate = { $gte: endStartTime, $lte: req.endTime };
        }
        if (req.startTime == req.endTime) {
            cond.changeDate = { $eq: endStartTime };
        }

        let aggregations: any[] = [
            { $match: cond },
            { $group: { _id: null, dateList: { $addToSet: "$changeDate" } } }
        ];
        if (isUser) {
            aggregations = [
                { $match: { changeDate: { $ne: null } } },
                { $group: { _id: { user: "$user" }, dateList: { $addToSet: "$changeDate" } } },
                { $project: { _id: 0, user: "$_id.user", dateList: "$dateList" } }
            ];
        }
        let data: any = await MongoDbUtil.executeAggregate(this._model, aggregations);
        if (data.code != ErrCode.OK) {
            logger.error("统计用户每日消耗账号数失败" + JSON.stringify(data));
            return data;
        }
        if (data.msg.length < 1) {
            return data;
        }
        if (isUser) {
            return await this.handleGroupForUser(data);
        }
        /* 时间转整点 */
        let list: any = data.msg[0].dateList;
        for (let i = 0; i < list.length; i++) {
            let endDay = endOfDay(list[i]);
            let current = list[i];
            /* 跨天 */
            if (current.getTime() >= endDay.getTime()) {
                current = new Date(current.getTime() + DayMS);
            }
            list[i] = (new Date(current.getFullYear(), current.getMonth(), current.getDate()));
        }
        /* 将时间根据天进行分组 */
        let resultList: any[] = [];
        for (let j = 0; j < list.length; j++) {
            let bool = false;
            for (let m = 0; m < resultList.length; m++) {
                if (resultList[m].sumDate.getTime() == list[j].getTime()) {
                    resultList[m].appleActCount++;
                    bool = true;
                    break;
                }
            }
            if (!bool)
                resultList.push({ sumDate: list[j], appleActCount: 1 });
        }
        return Promise.resolve({ code: ErrCode.OK, msg: resultList });
    }

    private selectData(resultList: any[], item: any, list: any): boolean {
        for (let m = 0; m < resultList.length; m++) {
            if (resultList[m].sumDate.getTime() == item.getTime() && resultList[m].user == list.user) {
                resultList[m].appleActCount++;
                return true;
            }
        }
        return false;
    }

    public async handleGroupForUser(data: any): Promise<CodeMsgAny> {
        /* 时间转整点 */
        let list = data.msg;
        for (let i = 0; i < list.length; i++) {
            let item = list[i].dateList;
            for (let j = 0; j < item.length; j++) {
                let endDay = endOfDay(item[j]);
                let current = item[j];
                /* 跨天 */
                if (current.getTime() >= endDay.getTime()) {
                    current = new Date(current.getTime() + DayMS);
                }
                item[j] = (new Date(current.getFullYear(), current.getMonth(), current.getDate()));
            }
        }

        /* 将时间根据天进行分组 */
        let resultList: any[] = [];
        for (let j = 0; j < list.length; j++) {
            let bool = false;
            let item = list[j].dateList;
            for (let k = 0; k < item.length; k++) {
                let bool = this.selectData(resultList, item[k], list[j]);
                if (!bool)
                    resultList.push({ user: list[j].user, sumDate: item[k], appleActCount: 1 });
            }
        }
        return Promise.resolve({ code: ErrCode.OK, msg: resultList });
    }
}

export const signActDao = new SignActDao();