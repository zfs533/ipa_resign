import { Schema, Connection, mongo } from "mongoose";
import { MongoDbUtil, TransSession } from "./mongoDbUtil";
import { CodeMsgAny, ErrCode, CodeMsg } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";
import { AdminRole, AdminUserDoc, adminUserDao } from "./adminDao";
import { ObjectId } from "bson";
import { logger } from "../common/logger";
import { resolve } from "dns";
import { createBundleId, getChangeDate } from "../common/utils";

export enum IpaStatus {
    /* 待传包 */
    NoUpload = 1,
    /* 审核中 */
    Opening,
    /* 上传完成 */
    Uploaded,
    /* 已删除状态 */
    Deleted,
}
export interface IpaFileModel {
    _id?: string,
    /* 上传应用的用户名 */
    act?: string,
    /* 唯一标示 */
    pid?: string,
    /* 应用名 */
    ipaName?: string,
    /* 应用分数 */
    score?: number,
    /* 应用描述 */
    ipaBrief?: string,
    /* 下载地址 */
    ipaUrl?: string,
    /* 下载开关 */
    enable?: boolean,
    /* 插件数量 */
    target?: number,
    /* 应用类型 */
    ipaType?: string,
    /* 上传时间 */
    uploadTime?: Date,
    /* 应用版本号 */
    version?: string,
    /* 设备安装数 */
    dled?: number,
    /* icon编码 */
    base64?: string,
    key?: string,
    /* 应用上传状态 */
    status?: number,
    /* 验证开关 */
    isCheck?: boolean,
    /* 应用大小 */
    fileSize?: number,
    /* 应用原始bundleId */
    oriBundle?: string,
    /* 扩展包bundleId */
    extentions?: []
}

class IpaFileDao extends ModelBaseDao {
    public init = (conn: Connection) => {
        let schema = new Schema({
            act: { type: String },                  //用户名
            pid: { type: String, unique: true },    //应用id
            ipaName: String,                        //包名
            score: Number,                           //评分数
            ipaBrief: String,                        //包简介       
            ipaType: String,                        //包类型       
            ipaUrl: String,                          //访问地址
            target: Number,                          //target数量
            uploadTime: Date,                        //上传时间
            version: String,
            enable: { type: Boolean, default: false }, //开启状态
            status: Number,                         //包目前状态
            isCheck: { type: Boolean, default: false },  //是否开启用户验证
            fileSize: Number,                       //包大小
            oriBundle: { type: String, default: null },  //原始bundleId
            extentions: { type: Array, default: [] },   //扩展包bundleId
            dled: { type: Number, default: 0 }        //设备安装数
        }, { versionKey: false });

        this._model = MongoDbUtil.createModel(conn, {
            name: "appInfo",
            schema: schema
        });
        this.initData();
        return Promise.resolve<CodeMsgAny>({ code: ErrCode.OK });
    };
    private async initData() {
        /* 初始化应用设备安装数 */
        let userData: any = await adminUserDao.getUserNames();
        for (let i = 0; i < userData.msg.length; i++) {
            await this.initAppListData(userData.msg[i].loginName);
        }
    }

    /**
     * 获取应用列表
     * @param admin AdminUserDoc 
     * @param ipaName 应用名字
     * @param page 页数
     * @param count 一页的行数
     * @param userName 用户名
     */
    public async  getList(admin: AdminUserDoc, ipaName: string, page: number, count: number, userName: string): Promise<CodeMsg<IpaFileModel[]>> {
        let cond: any = {};
        if (admin.role === AdminRole.USERS) {
            cond.act = admin.loginName;
        }
        if (userName) {
            cond.act = userName;
        }
        if (ipaName) {
            cond.ipaName = ipaName;
        }
        cond.status = { $ne: IpaStatus.Deleted };
        let aggregations: any = [
            { $match: cond },
            { $skip: (page - 1) * count },
            { $limit: count },
            { $project: { pid: 1, ipaName: 1, ipaBrief: 1, ipaUrl: 1, enable: 1, target: 1, ipaType: 1, uploadTime: 1, bundleId: 1, version: 1, dled: 1, status: 1, fileSize: 1, isCheck: 1, oriBundle: 1 } }
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregations);
        return data;
    }

    /**
     * 初始化应用列表设备安装数
     * @param admin AdminUserDoc 
     * @param ipaName 应用名字
     * @param page 页数
     * @param count 一页的行数
     * @param userName 用户名
     */
    public async  initAppListData(userName: string): Promise<CodeMsg<IpaFileModel[]>> {
        let cond: any = { act: userName };
        cond.status = { $ne: IpaStatus.Deleted };
        let aggregations: any = [
            { $match: cond },
            { $lookup: { from: "relations", localField: "pid", foreignField: "pid", as: "udids" } },
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregations);
        for (let i = 0; i < data.msg.length; i++) {
            let num = 0;
            let tempArr: any = [];
            for (let j = 0; j < data.msg[i].udids.length; j++) {
                let isHave = tempArr.find((element: string) => { return element == data.msg[i].udids[j].udid; });
                if (isHave) {
                    continue;
                } else {
                    tempArr.push(data.msg[i].udids[j].udid);
                    num++
                }
            }
            await this.updateDevices(data.msg[i].pid, num);
        }
        return data;
    }

    /**
     * 更新一个应用的设备安装数
     * @param pid 
     */
    public async updateDevicesByPid(pid: string) {
        let aggregations: any = [
            { $match: { pid: pid } },
            { $lookup: { from: "relations", localField: "pid", foreignField: "pid", as: "udids" } },
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregations);
        for (let i = 0; i < data.msg.length; i++) {
            let num = 0;
            let tempArr: any = [];
            for (let j = 0; j < data.msg[i].udids.length; j++) {
                let isHave = tempArr.find((element: string) => { return element == data.msg[i].udids[j].udid; });
                if (isHave) {
                    continue;
                } else {
                    tempArr.push(data.msg[i].udids[j].udid);
                }
                num++
            }
            await this.updateDevices(data.msg[i].pid, num);
        }
    }
    /**
     * 更新应用设备安装数
     * @param pid 
     * @param devices 
     */
    public async updateDevices(pid: string, devices: number): Promise<CodeMsgAny> {
        return await MongoDbUtil.updateOne(this._model, { pid: pid }, { $set: { dled: devices } });
    }

    public getCountByName = (name: string, user: string): Promise<CodeMsg<number>> => {
        return MongoDbUtil.findCount(this._model, { ipaName: name, act: user, status: { $lt: IpaStatus.Uploaded } });
    }

    public getListCount = (admin: AdminUserDoc, userName?: string): Promise<CodeMsg<number>> => {
        let cond: any = {};
        if (admin.role === AdminRole.USERS) {
            cond.act = admin.loginName;
        }
        if (userName) {
            cond.act = userName;
        }
        cond.status = { $ne: IpaStatus.Deleted };
        return MongoDbUtil.findCount(this._model, cond);
    }

    public getByPid = (pid: string): Promise<CodeMsg<IpaFileModel>> => {
        return MongoDbUtil.findOne(this._model, { pid });
    };

    public getDataByPid = (pid: string): Promise<CodeMsgAny> => {
        let aggregations: any[] = [
            { $match: { pid: pid } },
            { $lookup: { from: "sysUser", localField: "act", foreignField: "loginName", as: "sysUser" } },
            { $unwind: "$sysUser" },
            {
                $project: {
                    isCheck: 1, act: 1, pid: 1, ipaName: 1, ipaUrl: 1, enable: 1, dled: 1, key: "$sysUser.key", status: 1, score: 1, ipaType: 1, fileSize: 1, ipaBrief: 1
                }
            }
        ]
        return MongoDbUtil.executeAggregate(this._model, aggregations);
    };

    public getById = (id: string): Promise<CodeMsg<IpaFileModel>> => {
        return MongoDbUtil.findOne(this._model, { _id: id });
    };

    public getPidsByAct = async (act: string): Promise<CodeMsg<{ oriBundle: string, appName: string }[]>> => {
        let ret = await MongoDbUtil.findMany(this._model, { act: act, status: { $ne: IpaStatus.Deleted } });
        if (ret.code !== ErrCode.OK) {
            return ret;
        }
        let pids: { oriBundle: string, appName: string, pid: string }[] = ret.msg.length ? ret.msg.map(e => ({ oriBundle: e.oriBundle, appName: e.ipaName, pid: e.pid })) : [];
        return { code: ErrCode.OK, msg: pids }
    };

    public getBindsByAct = async (act: string): Promise<CodeMsg<IpaFileModel[]>> => {
        return MongoDbUtil.findMany(this._model, { act: act, status: IpaStatus.Uploaded });
    };

    public saveIpaMsg = (req: IpaFileModel): Promise<CodeMsgAny> => {
        return MongoDbUtil.insert(this._model, req);
    };

    public updateIpaMsg = (req: IpaFileModel): Promise<CodeMsgAny> => {
        let up = { ...req };
        delete up._id;
        return MongoDbUtil.updateOne(this._model, { _id: req._id }, up);
    };

    /**
     * 正常包删除，只改变状态，不从数据库删除
     * @param pid 应用pid 
     */
    public async deleteIpaFile(pid: string): Promise<CodeMsgAny> {
        return await this.updateStatus(pid, IpaStatus.Deleted);
        // return MongoDbUtil.deleteOne(this._model, { _id: id });
    };

    /**
     * 从数据库删除
     * @param pid 应用pid 
     */
    public async deleteIpaFileDb(pid: string): Promise<CodeMsgAny> {
        return MongoDbUtil.deleteOne(this._model, { pid: pid });
    };

    public enableIpaFile = (id: string, enable: boolean): Promise<CodeMsgAny> => {
        return MongoDbUtil.updateOne(this._model, { _id: id }, { enable: enable });
    };

    public checkIpaFile = (pid: string, isCheck: boolean): Promise<CodeMsgAny> => {
        return MongoDbUtil.updateOne(this._model, { pid: pid }, { isCheck: isCheck });
    };

    /**
     * 
     * @param pid 应用唯一标示
     * @param target 插件数量
     * @param version 版本号
     * @param oriBundle 应用原始bundleId
     */
    target(pid: string, target: number, version: string, oriBundle: string, extentions: any): Promise<CodeMsgAny> {
        return MongoDbUtil.updateOne(this._model, { pid }, { $set: { target: target, uploadTime: getChangeDate(), version: version, enable: true, status: IpaStatus.Uploaded, oriBundle: oriBundle, extentions: extentions } });
    }

    /**
     * 更新应用状态
     * @param pid  应用唯一标示
     * @param status 应用状态
     * @param fileSize 应用大小
     */
    public async updateStatus(pid: string, status: number, fileSize?: number): Promise<CodeMsg<IpaFileModel>> {
        if (fileSize) {
            return MongoDbUtil.findOneAndUpdate(this._model, { pid: pid }, { status: status, fileSize: fileSize });
        } else {
            let ipaName = createBundleId(pid, 8);
            return MongoDbUtil.findOneAndUpdate(this._model, { pid: pid }, { status: status, ipaName: ipaName });
        }
    }
    /**
     * 单独切换状态
     * @param pid  应用唯一标示
     * @param status 应用状态
     */
    public async updateStatusNomal(pid: string, status: number): Promise<CodeMsgAny> {
        return MongoDbUtil.findOneAndUpdate(this._model, { pid: pid }, { status: status });
    }

    updateOribundle = (pid: string, oriBundle: string): Promise<CodeMsg<IpaFileModel>> => {
        return MongoDbUtil.findOneAndUpdate(this._model, { pid: pid }, { $set: { oriBundle: oriBundle } });
    }

    getUsers = () => {
        let cond: any[] = [
            { $match: { status: { $ne: IpaStatus.Deleted } } },
            { $group: { _id: null, users: { $addToSet: "$act" } } },
            { $project: { _id: 0, users: 1 } }
        ];
        return MongoDbUtil.executeAggregate(this._model, cond);
    }

    getALl = (): Promise<CodeMsg<IpaFileModel[]>> => {
        return MongoDbUtil.findMany(this._model, {})
    }

    /**
     * 主绑定id是否已经创建过了
     * @param user 用户名
     * @param mainBundleId 当前应用主bundleId
     * @param appleAccount 苹果账号
     */
    public async isExistmMainBundleId(user: string, mainBundleId: string): Promise<CodeMsgAny> {
        let aggregations = [
            { $match: { act: user, status: IpaStatus.Uploaded } },
            { $group: { _id: '', bundlIds: { $addToSet: "$oriBundle" } } },
            { $project: { isExist: { $in: [mainBundleId, "$bundlIds"] } } }
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregations);
        if (data.code != ErrCode.OK) {
            logger.error("判断mainBundleId是否重复出错啦！");
            return data;
        }
        let isExist = data.msg && data.msg.length > 0 && data.msg[0].isExist ? true : false;
        return Promise.resolve({ code: data.code, msg: isExist });
    }

    /**
     * 已经创建过的应用，查看是否还存在用户列表中
     * @param user 用户名
     * @param mainBundleId 当前应用主bundleId
     * @param appleAccount 苹果账号
     */
    public async isExistStatusEnabled(user: string, mainBundleId: string): Promise<CodeMsgAny> {
        let aggregations = [
            { $match: { act: user, status: IpaStatus.Uploaded } },
            { $group: { _id: '', bundlIds: { $addToSet: "$oriBundle" } } },
            { $project: { isExist: { $in: [mainBundleId, "$bundlIds"] } } }
        ];
        let data = await MongoDbUtil.executeAggregate(this._model, aggregations);
        if (data.code != ErrCode.OK) {
            logger.error("判断mainBundleId是否重复出错啦！");
            return data;
        }
        let isExist = data.msg && data.msg.length > 0 && data.msg[0].isExist ? true : false;
        return Promise.resolve({ code: data.code, msg: isExist });
    }
    public async isUpgrade(user: string, mainBundleId: string, pid: string): Promise<CodeMsgAny> {
        let data = await MongoDbUtil.findOne(this._model, { act: user, pid: pid });
        if (data.code != ErrCode.OK) {
            logger.error("查找包升级出错啦！" + JSON.stringify(data.err));
            return data;
        }
        let obj = { upgrade: false, upgradeErr: false };
        if (data.msg) {
            if (data.msg.oriBundle && data.msg.oriBundle == mainBundleId) {
                obj.upgrade = true;
                logger.info("版本升级");
            }
            else if (data.msg.oriBundle && data.msg.oriBundle != mainBundleId) {
                obj.upgradeErr = true;
                logger.info("更新包传错案例 ");
            }
            return Promise.resolve({ code: data.code, msg: obj });
        }
    }

}

export const ipaFilesDao = new IpaFileDao();