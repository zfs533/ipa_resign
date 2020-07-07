import { Connection } from "mongoose";
import { CodeMsgAny } from "../common/codeMsg";
import { MongoDbUtil, TransSession } from "./mongoDbUtil";
import { ErrCode } from "../common/codeMsg";
import { CodeMsg } from "../common/codeMsg";
import { ModelBaseDao } from "./modelBaseDao";
import { logger } from "../common/logger";
import { getChangeDate } from "../common/utils";
export enum AdminStatus {
    ALL = 1,
    YIBU = 2,
    ERBU = 3,
    SANBU = 4,
}

export enum AdminRole {
    USERS = "users",    //普通用户
    ADMINS = "admins",  //管理员
    CS = "cs",//客服
    AUDIT = "audit",//审计
}
/* 用户表数据结构 */
export interface AdminUserDoc {
    _id: string,
    uid: number,
    /* 用户名 */
    loginName: string,
    /* 用户角色 users普通用户，admins管理员 */
    role: string,
    password: string,
    token?: string,
    remark: string,
    createDate: Date,
    updateDate: Date,
    /* 设备安装总值 */
    setDlNumber?: number,
    /* 剩余设备安装数 */
    laveNum?: number,
    /* 用户下载总量 */
    dled?: number,
    key?: string,
    /* 合作应用列表 */
    appList?: Array<string>,
}
/* 用户表 */
class AdminUserDao extends ModelBaseDao {
    public init = async (conn: Connection): Promise<CodeMsgAny> => {
        this._model = MongoDbUtil.createModel(conn, {
            name: "sysUser",
            schemaDefinition: {
                uid: { type: Number, unique: true, index: true },
                loginName: { type: String, unique: true, required: true },
                password: { type: String, required: true },
                role: { type: String, required: true },
                token: { type: String },
                remark: { type: String },
                setDlNumber: { type: Number },
                createDate: { type: Date, index: true },
                updateDate: { type: Date, index: true },
                appList: { type: Array, default: [] },
                key: String,
            }
        })
        this.initDate();
        return Promise.resolve({ code: ErrCode.OK })
    }

    /**
     * 没有新字段的给加一个
     */
    public async initDate(): Promise<CodeMsgAny> {
        let data = await MongoDbUtil.findMany(this._model, {});
        for (let i = 0; i < data.msg.length; i++) {
            if (data.msg[i].appList && data.msg[i].appList.length < 1) {
                await MongoDbUtil.updateOne(this._model, { loginName: data.msg[i].loginName }, { $set: { appList: [] } })
            }
        }
        return null;
    }

    /**
     * 获取http接口请求认证标示
     * @param path 访问接口，如"/admin/login
     * @param userMark  验证数据 {loginName: loginName}
     */
    public async getDbToken(path: string, userMark: string): Promise<string> {
        let dbToken;
        let adminResult = await adminUserDao.getByLoginName(userMark);
        if (adminResult.code !== ErrCode.OK) {
            return;
        }
        let admin = adminResult.msg
        if (!admin) {
            dbToken = "invalid";
        } else {
            dbToken = admin.token ? admin.token : "invalid";
        }
        return dbToken;
    }
    /**
     * 根据用户名获取用户数据
     * @param loginName 用户名
     */
    public async getByLoginName(loginName: string): Promise<CodeMsg<AdminUserDoc>> {
        return MongoDbUtil.findOne(this._model, { loginName: loginName });
    }
    /**
     * 获取uid字段最大的用户数据
     */
    public async getMaxUid(): Promise<CodeMsg<AdminUserDoc>> {
        return MongoDbUtil.findOne(this._model, {}, { uid: -1 });
    }
    /**
     * 根据id获取用户数据
     * @param id 用户id
     */
    public async  getById(id: string): Promise<CodeMsg<AdminUserDoc>> {
        return MongoDbUtil.findOne(this._model, { _id: id });
    }
    /**
     * 添加用户
     * @param admin AdminUserDoc
     * @param session TransSession
     */
    public async addUser(admin: any, session?: TransSession): Promise<CodeMsg<AdminUserDoc>> {
        if (session) {
            return MongoDbUtil.insert(this._model, admin, { session });
        }
        else {
            return MongoDbUtil.insert(this._model, admin);
        }
    }

    public deleteUser = (_id: any) => {

        return MongoDbUtil.deleteOne(this._model, { _id });
    }

    public pageAdmin = (page: number, count: number, loginName?: string, sort?: any, body?: any): Promise<CodeMsg<AdminUserDoc[]>> => {
        let conditions: any = {}
        if (loginName) {
            conditions.loginName = loginName;
        }
        return MongoDbUtil.findMany(this._model, conditions, sort, page, count, body);
    }

    public updateAdmin = (conditions: any, options: any): Promise<CodeMsg<AdminUserDoc>> => {
        return MongoDbUtil.findOneAndUpdate(this._model, conditions, options);
    }

    public setGoogleAuth = (loginName: string, base32: string, authUrl: string): Promise<CodeMsg<AdminUserDoc>> => {
        return MongoDbUtil.findOneAndUpdate(this._model, { loginName: loginName }, { base32: base32, qrcode: authUrl });
    }

    getCount = (loginName: string): Promise<CodeMsg<number>> => {
        let conditions: any = {};
        if (loginName) {
            conditions.loginName = loginName;
        }
        return MongoDbUtil.findCount(this._model, conditions)
    }

    addDlTimes = (user: string, times: number): Promise<CodeMsgAny> => {
        return MongoDbUtil.updateOne(this._model, { loginName: user }, { $inc: { setDlNumber: times }, updateDate: getChangeDate() });
    }

    getUserNames = () => {
        return MongoDbUtil.findMany(this._model, { role: AdminRole.USERS }, undefined, undefined, undefined, { loginName: 1 });
    }

    /**
     * 获取当前用户的合作伙伴（合作项目组,合作应用））
     * @param user 当前用户
     * @param 
     * @param pid
     */
    public async getPartner(user: string, pid?: string): Promise<CodeMsgAny> {
        let data = await MongoDbUtil.findOne(this._model, { loginName: user });
        if (data.code !== ErrCode.OK) {
            logger.error("获取合作伙伴失败" + JSON.stringify(data));
            return data;
        }
        let isHave = false;
        if (pid && data.msg && data.msg.appList) {
            isHave = data.msg.appList.find((element: string) => { return element == pid });
        }
        return Promise.resolve({ code: ErrCode.OK, msg: isHave });
    }

    /**
     * 获取用户列表中的所有合作应用
     * @param userList 用户列表
     */
    public async getUsersAppList(userList: any[]): Promise<CodeMsgAny> {
        let aggregates: any = [
            { $match: { loginName: { $in: userList } } },
            { $group: { _id: null, pid: { $addToSet: "$appList" } } },
            { $project: { _id: 0, pidList: "$pid" } },
        ]
        let data = await MongoDbUtil.executeAggregate(this._model, aggregates);
        if (data.code !== ErrCode.OK) {
            return data;
        }
        let list = data.msg && data.msg.length > 0 ? data.msg : [];
        let pidList = [];
        for (let i = 0; i < list.length; i++) {
            for (let j = 0; j < list[i].pidList.length; j++) {
                pidList.push(list[i].pidList[j]);
            }
        }
        let reList = [];
        for (let k = 0; k < pidList.length; k++) {
            for (let m = 0; m < pidList[k].length; m++) {
                reList.push(pidList[k][m]);
            }
        }
        return Promise.resolve({ code: ErrCode.OK, msg: reList });
    }
}

export const adminUserDao = new AdminUserDao();